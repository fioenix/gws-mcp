import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "./config.js";
import { GwsClient, type GwsCallInput, type GwsExecResult } from "./gws.js";
import { ProfileManager, type ProfileInfo } from "./profiles.js";
import { GcpBridge, GCP_SUBCOMMANDS, type GcpSubcommand } from "./gcpbridge.js";
import { classifyAuthError, renderDiagnosis } from "./authdiag.js";
import { AuditLogger } from "./audit.js";
import type { Skill } from "./skills.js";

// Single source of truth for the version reported in the MCP handshake: read it
// from package.json (at the package root, one level up from src/ and dist/) so it
// can never drift from the published version.
const VERSION = (() => {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
    return (JSON.parse(readFileSync(pkgPath, "utf8")).version as string) || "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

const SERVICES = [
  "drive",
  "sheets",
  "gmail",
  "calendar",
  "admin-reports",
  "docs",
  "slides",
  "tasks",
  "people",
  "chat",
  "classroom",
  "forms",
  "keep",
  "meet",
  "events",
  "modelarmor",
  "workflow",
  "script",
] as const;

function trimStderr(stderr: string, max = 4000): string {
  if (stderr.length <= max) return stderr;
  return stderr.slice(0, max) + `\n... [truncated ${stderr.length - max} bytes]`;
}

function execToContent(result: GwsExecResult): {
  content: { type: "text"; text: string }[];
  isError?: boolean;
} {
  if (result.ok) {
    const text = result.stdout
      || `(empty stdout, exit=${result.exitCode}, duration=${result.durationMs}ms)`;
    return {
      content: [
        {
          type: "text",
          text: result.stdoutTruncated
            ? `${text}\n\n[truncated — set GWS_MCP_MAX_OUTPUT_BYTES higher on the host to see more]`
            : text,
        },
      ],
    };
  }
  const stderr = trimStderr(result.stderr || "(no stderr)");
  return {
    content: [
      {
        type: "text",
        text: `gws exited with code ${result.exitCode}\nCommand: ${result.command.join(" ")}\n\nstderr:\n${stderr}\n\nstdout:\n${result.stdout || "(empty)"}`,
      },
    ],
    isError: true,
  };
}

export interface BuildServerOptions {
  skills?: Skill[];
}

/**
 * Where credentials come from, described for the agent reading these instructions.
 *
 * When the host points gws at a gcloud ADC file, gws's own credential store is out of
 * the picture — but an agent that only knows the default setup will reach for
 * `gws auth login` on the first auth error and make things worse. Spell out the rules
 * of whichever mode is actually running.
 */
export function authBlurb(env: NodeJS.ProcessEnv = process.env): string {
  const credentialsFile = env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE?.trim();
  if (!credentialsFile) {
    return "Authentication happens on the host machine via `gws auth login` (tokens live in the host keyring); this server never sees credentials.";
  }

  const profile = env.GWS_PROFILE?.trim();
  const source = profile ? `profile "${profile}"` : "an explicitly configured credentials file";

  return [
    `Credentials come from ${source}: gws reads ${credentialsFile} directly, a gcloud application-default credentials file. This server never sees them.`,
    "Do NOT run `gws auth login` or `gws auth setup` here. Both belong to gws's own credential store, which this host does not use; `auth setup` additionally rewrites the OAuth client config and has been observed to corrupt it.",
    "Do NOT copy or symlink client_secret.json into the gws config dir. gws would then send that file's project as the quota project, and every call fails with 403 unless the account holds serviceusage.services.use on it. That file belongs outside the config dir, used only as `--client-id-file` when logging in.",
    "On `invalid_rapt` or `invalid_grant`, the credentials need a browser to refresh — you cannot do it. Ask the user to run `gcloud auth application-default login` with the same `--client-id-file` and `--scopes` they used originally. `gws auth status` is safe and useful for diagnosing.",
  ].join("\n");
}

export function buildServer(cfg: Config, opts: BuildServerOptions = {}): McpServer {
  const skills = opts.skills ?? [];
  const skillsByName = new Map(skills.map((s) => [s.name, s] as const));

  const skillsBlurb = skills.length
    ? `\nThis server also exposes ${skills.length} field-tested "skill" guides covering common workflows. Call \`gws_list_skills\` and \`gws_get_skill name:"gws-drive"\` to read them. They are also available as MCP resources (\`gws-skill://<name>\`) and as MCP prompts that clients with prompt UIs can invoke directly.`
    : "";

  const server = new McpServer(
    { name: "gws-mcp", version: VERSION },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: skills.length ? {} : undefined,
      },
      instructions: [
        "This MCP server wraps the locally-installed `gws` Google Workspace CLI.",
        authBlurb(),
        "Recommended flow:",
        "  1. Call `gws_list_services` to see what is enabled.",
        "  2. Call `gws_help` with `args:[\"<service>\"]` or `args:[\"<service>\",\"<resource>\"]` to discover methods.",
        "  3. Call `gws_schema` with `service.resource.method` (e.g. `drive.files.list`) to get parameter and body shapes.",
        "  4. Call `gws_call` with the structured args.",
        "Outputs are JSON by default — set `format` to `table`/`yaml`/`csv` only when the user asks for human-readable output.",
        "For paginated list calls, set `pageAll: true` to auto-paginate into NDJSON.",
        "Destructive operations (delete/send) may be blocked by host policy and will return an error.",
        "Credentials live in named profiles. `gws_profile_current` says which identity is active and whether its token is still valid, `gws_profile_list` shows the alternatives, and `gws_profile_use` switches for this session with no restart. On an auth failure, read the diagnosis block appended to the error before doing anything else — never switch identity without asking the user.",
        skillsBlurb,
      ]
        .join("\n")
        .trim(),
    },
  );

  const profiles = new ProfileManager();
  const gws = new GwsClient(cfg, profiles);
  const gcp = new GcpBridge(cfg.gcp.profileScript, cfg.gcp.enabled, cfg.gcp.timeoutMs);
  const audit = new AuditLogger(cfg.safety.auditLog);

  /**
   * A raw Google auth error tells the agent nothing about *which* identity failed or
   * what to do next, so it retries blindly. Append the profile, the file that was
   * read, the error class, and the fix command with paths already filled in.
   */
  async function withDiagnosis(result: GwsExecResult) {
    const base = execToContent(result);
    if (result.ok) return base;

    const kind = classifyAuthError(`${result.stderr}\n${result.stdout}`);
    if (!kind) return base;

    const active = profiles.active;
    const info: ProfileInfo | null = active ? profiles.describe(active) : null;

    // Only worth probing other profiles when the agent might reasonably switch.
    // Concurrently: this sits on the error path, and one subprocess per profile
    // in series would add seconds to every failed call.
    let healthy: { name: string; account: string | null }[] | undefined;
    if (kind === "reauth_required" || kind === "missing_credentials") {
      const candidates = profiles.list().filter((p) => p.name !== active && p.credentialsExist);
      const probes = await Promise.all(
        candidates.map(async (p) => {
          try {
            return (await gws.authStatus(p.name)).tokenValid ? p : null;
          } catch {
            return null; // a probe failure is not the error we are reporting
          }
        }),
      );
      healthy = probes.filter((p) => p !== null).map((p) => ({ name: p.name, account: p.account }));
    }

    const diagnosis = renderDiagnosis({
      kind,
      profile: info,
      credentialsFile: info?.credentialsFile ?? process.env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE ?? null,
      configDir: info?.configDir ?? process.env.GOOGLE_WORKSPACE_CLI_CONFIG_DIR ?? null,
      healthyAlternatives: healthy,
    });

    return {
      ...base,
      content: [{ type: "text" as const, text: `${base.content[0].text}\n${diagnosis}` }],
    };
  }

  server.registerTool(
    "gws_list_services",
    {
      title: "List Google Workspace services",
      description:
        "List the Google Workspace services exposed by this MCP server. Respects the host's allowlist (GWS_MCP_ALLOWED_SERVICES).",
      inputSchema: {},
    },
    async () => {
      const allow = cfg.safety.allowedServices;
      const list = (allow.size === 0 ? SERVICES.slice() : SERVICES.filter((s) => allow.has(s))) as string[];
      const denyHint =
        cfg.safety.deniedMethods.size > 0
          ? `\nDenied methods on this host: ${[...cfg.safety.deniedMethods].join(", ")}`
          : "";
      await audit.log({ event: "tool_call", tool: "gws_list_services", ok: true });
      return {
        content: [
          {
            type: "text",
            text:
              `Allowed services (${list.length}):\n` +
              list.map((s) => `  - ${s}`).join("\n") +
              denyHint +
              `\n\nUse \`gws_help args:["<service>"]\` to list resources, then \`gws_schema target:"service.resource.method"\` to inspect a method.`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "gws_help",
    {
      title: "Show gws CLI help",
      description:
        "Run `gws [args...] --help` to discover services, resources, and methods. Pass an empty array for the top-level help.",
      inputSchema: {
        args: z
          .array(z.string().regex(/^[a-z0-9][a-z0-9._-]*$/i, "lowercase identifiers only"))
          .max(4)
          .default([])
          .describe("Up to 4 positional args, e.g. ['drive'] or ['drive','files']"),
      },
    },
    async ({ args }) => {
      const start = Date.now();
      try {
        const result = await gws.help(args);
        await audit.log({
          event: "tool_call",
          tool: "gws_help",
          args,
          ok: result.ok,
          exitCode: result.exitCode,
          durationMs: Date.now() - start,
        });
        return execToContent(result);
      } catch (e) {
        const err = (e as Error).message;
        await audit.log({ event: "tool_call", tool: "gws_help", args, ok: false, error: err });
        return { content: [{ type: "text", text: `Error: ${err}` }], isError: true };
      }
    },
  );

  server.registerTool(
    "gws_schema",
    {
      title: "Inspect method schema",
      description:
        "Get the JSON schema for `service.resource.method` (e.g. `drive.files.list`, `gmail.users.messages.send`). Use this BEFORE calling `gws_call` to learn parameter and body shapes.",
      inputSchema: {
        target: z
          .string()
          .regex(/^[a-z0-9][a-z0-9._-]*$/i)
          .describe("Dotted path: service.resource[.subresource].method"),
        resolveRefs: z.boolean().default(false).describe("Inline $ref references into a single schema"),
      },
    },
    async ({ target, resolveRefs }) => {
      const start = Date.now();
      try {
        const result = await gws.schema(target, resolveRefs);
        await audit.log({
          event: "tool_call",
          tool: "gws_schema",
          args: { target, resolveRefs },
          ok: result.ok,
          exitCode: result.exitCode,
          durationMs: Date.now() - start,
        });
        return execToContent(result);
      } catch (e) {
        const err = (e as Error).message;
        await audit.log({ event: "tool_call", tool: "gws_schema", args: { target }, ok: false, error: err });
        return { content: [{ type: "text", text: `Error: ${err}` }], isError: true };
      }
    },
  );

  server.registerTool(
    "gws_call",
    {
      title: "Invoke a Google Workspace API",
      description:
        "Generic dispatcher to the host's `gws` CLI. Always call `gws_schema` first to learn the exact param/body shape.",
      inputSchema: {
        service: z
          .string()
          .regex(/^[a-z0-9][a-z0-9._-]*$/i)
          .describe("Service name, e.g. drive, sheets, gmail, calendar, docs"),
        resource: z
          .string()
          .regex(/^[a-z0-9][a-z0-9._-]*$/i)
          .describe("Resource on the service, e.g. files, spreadsheets, users"),
        subResource: z
          .string()
          .regex(/^[a-z0-9][a-z0-9._-]*$/i)
          .optional()
          .describe("Optional sub-resource (e.g. 'messages' for gmail users messages)"),
        method: z
          .string()
          .regex(/^[a-z0-9][a-z0-9._-]*$/i)
          .describe("Method name, e.g. list, get, create, update, send, delete"),
        params: z
          .union([z.record(z.unknown()), z.string()])
          .optional()
          .describe(
            "URL/query parameters. Pass a JSON object (preferred) — do NOT pre-stringify it. A JSON-encoded string is also accepted as a fallback.",
          ),
        json: z
          .unknown()
          .optional()
          .describe(
            "Request body for POST/PATCH/PUT methods. Pass a JSON object/array (preferred) — do NOT pre-stringify it; the server will JSON.stringify exactly once. A raw JSON string is accepted as a fallback (and is passed through verbatim).",
          ),
        dryRun: z
          .boolean()
          .optional()
          .describe(
            "Validate the request locally and print what would be sent without hitting Google. Use this to debug body/param shapes safely.",
          ),
        apiVersion: z.string().optional().describe("Override API version (e.g. v2, v3)"),
        format: z.enum(["json", "table", "yaml", "csv"]).optional().describe("Output format (default json)"),
        pageAll: z.boolean().optional().describe("Auto-paginate, one JSON line per page (NDJSON)"),
        pageLimit: z.number().int().positive().max(100).optional().describe("Max pages when pageAll=true"),
        pageDelayMs: z.number().int().nonnegative().max(10000).optional().describe("Delay between pages in ms"),
        upload: z
          .string()
          .optional()
          .describe(
            "Absolute path on the HOST to a file to upload as multipart media. Sandbox paths will NOT work — write the file to a host-shared location first.",
          ),
        uploadContentType: z.string().optional().describe("MIME type of the upload"),
        output: z
          .string()
          .optional()
          .describe("HOST path to write binary response (e.g. for drive.files.get with alt=media)"),
      },
    },
    async (input) => {
      const start = Date.now();
      const callInput: GwsCallInput = {
        service: input.service,
        resource: input.resource,
        subResource: input.subResource ?? null,
        method: input.method,
        params: (input.params as Record<string, unknown> | string | undefined) ?? null,
        json: input.json,
        apiVersion: input.apiVersion ?? null,
        format: input.format ?? null,
        pageAll: input.pageAll ?? null,
        pageLimit: input.pageLimit ?? null,
        pageDelayMs: input.pageDelayMs ?? null,
        upload: input.upload ?? null,
        uploadContentType: input.uploadContentType ?? null,
        output: input.output ?? null,
        dryRun: input.dryRun ?? null,
      };
      try {
        const result = await gws.call(callInput);
        await audit.log({
          event: "tool_call",
          tool: "gws_call",
          args: {
            service: input.service,
            resource: input.resource,
            subResource: input.subResource,
            method: input.method,
            hasParams: !!input.params,
            hasJson: input.json !== undefined,
            pageAll: input.pageAll,
            upload: input.upload,
          },
          ok: result.ok,
          exitCode: result.exitCode,
          durationMs: Date.now() - start,
        });
        return await withDiagnosis(result);
      } catch (e) {
        const err = (e as Error).message;
        await audit.log({
          event: "tool_call",
          tool: "gws_call",
          args: { service: input.service, resource: input.resource, method: input.method },
          ok: false,
          error: err,
        });
        return { content: [{ type: "text", text: `Error: ${err}` }], isError: true };
      }
    },
  );

  // -------- Profile layer --------

  function formatProfile(p: ProfileInfo, token?: { valid: boolean; error: string | null }): string {
    const marks = [p.active ? "ACTIVE" : null, p.credentialsExist ? null : "no-credentials"].filter(Boolean);
    const head = `${p.name}${marks.length ? `  [${marks.join(", ")}]` : ""}`;
    const lines = [
      `- ${head}`,
      `    account     : ${p.account ?? "(unknown)"}`,
      `    project     : ${p.project ?? "(unset)"}`,
      `    credentials : ${p.credentialsFile}${p.credentialsExist ? "" : "  (MISSING)"}`,
      `    config dir  : ${p.configDir}${p.configDirExists ? "" : "  (MISSING)"}`,
    ];
    if (token) {
      lines.push(`    token       : ${token.valid ? "valid" : `INVALID — ${token.error ?? "unknown error"}`}`);
    }
    return lines.join("\n");
  }

  server.registerTool(
    "gws_profile_list",
    {
      title: "List credential profiles",
      description:
        "List the credential profiles on this host (directories under GWS_PROFILE_ROOT, default ~/.config/gcloud/profiles), with the account, project, credential paths, and — unless you turn it off — the live token state of each. Use it to find out which identity is usable before asking the user to re-authenticate.",
      inputSchema: {
        checkTokens: z
          .boolean()
          .default(true)
          .describe("Probe each profile with `gws auth status` (read-only, one subprocess per profile)"),
      },
    },
    async ({ checkTokens }) => {
      const list = profiles.list();
      if (list.length === 0) {
        await audit.log({ event: "tool_call", tool: "gws_profile_list", ok: false, error: "no_profiles" });
        return {
          content: [{ type: "text", text: `No profiles found under ${profiles.root}.` }],
          isError: true,
        };
      }
      const blocks: string[] = [];
      for (const p of list) {
        let token: { valid: boolean; error: string | null } | undefined;
        if (checkTokens && p.credentialsExist) {
          try {
            const st = await gws.authStatus(p.name);
            token = { valid: st.tokenValid, error: st.tokenError };
          } catch (e) {
            token = { valid: false, error: (e as Error).message };
          }
        }
        blocks.push(formatProfile(p, token));
      }
      await audit.log({ event: "tool_call", tool: "gws_profile_list", ok: true, args: { checkTokens } });
      return {
        content: [
          {
            type: "text",
            text:
              `Profiles under ${profiles.root} (${list.length}):\n\n` +
              blocks.join("\n\n") +
              `\n\nSwitch with \`gws_profile_use name:"<name>"\` — it affects this MCP session only, not other processes on the machine.`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "gws_profile_current",
    {
      title: "Show the active credential profile",
      description:
        "Report which profile the next `gws_call` will run as, the credentials file and config dir it reads, the authenticated account, and whether the token is still valid.",
      inputSchema: {},
    },
    async () => {
      const active = profiles.active;
      await audit.log({ event: "tool_call", tool: "gws_profile_current", ok: true, args: { active } });

      if (!active) {
        const status = await gws.authStatus();
        return {
          content: [
            {
              type: "text",
              text: [
                profiles.pinned
                  ? "No profile selected — the host pinned GOOGLE_WORKSPACE_CLI_* paths directly."
                  : "No profile selected — gws is using its own default config dir.",
                `credentials : ${process.env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE ?? "(gws default)"}`,
                `config dir  : ${process.env.GOOGLE_WORKSPACE_CLI_CONFIG_DIR ?? "(gws default)"}`,
                `token       : ${status.tokenValid ? "valid" : `INVALID — ${status.tokenError ?? "unknown error"}`}`,
                "",
                "`gws_profile_use` can still select a profile for this session.",
              ].join("\n"),
            },
          ],
        };
      }

      const info = profiles.describe(active);
      const status = await gws.authStatus(active);
      return {
        content: [
          {
            type: "text",
            text:
              formatProfile(info, { valid: status.tokenValid, error: status.tokenError }) +
              (status.tokenValid
                ? ""
                : `\n\nThis profile cannot make calls until the user re-authenticates. Run \`gws_profile_list\` to see whether another profile is usable.`),
          },
        ],
      };
    },
  );

  server.registerTool(
    "gws_profile_use",
    {
      title: "Switch credential profile",
      description:
        "Point subsequent `gws_call` invocations at a different credential profile, for this MCP session only. Takes effect immediately — no restart — because the child env is rebuilt on every call. It does NOT touch the machine-wide ADC symlink or any other process. Switching identity changes whose data you read and write: ask the user first. Wait for this call to return before issuing the next `gws_call` — a switch batched in parallel with calls has no defined ordering, and those calls may run as the old identity.",
      inputSchema: {
        name: z
          .string()
          .regex(/^[a-z0-9][a-z0-9._-]*$/i)
          .describe("Profile name as listed by `gws_profile_list`, e.g. work, personal"),
      },
    },
    async ({ name }) => {
      const previous = profiles.active;
      try {
        const info = profiles.use(name);
        const status = await gws.authStatus(name);
        await audit.log({
          event: "profile_switch",
          tool: "gws_profile_use",
          ok: true,
          args: { from: previous, to: name, tokenValid: status.tokenValid },
        });
        return {
          content: [
            {
              type: "text",
              text:
                `Switched ${previous ?? "(none)"} -> ${name} for this MCP session.\n\n` +
                formatProfile({ ...info, active: true }, { valid: status.tokenValid, error: status.tokenError }) +
                (status.tokenValid
                  ? ""
                  : `\n\nWarning: this profile's token is not valid, so calls will still fail. Ask the user to run \`gcp login ${name}\`.`),
            },
          ],
        };
      } catch (e) {
        const err = (e as Error).message;
        await audit.log({
          event: "profile_switch",
          tool: "gws_profile_use",
          ok: false,
          args: { from: previous, to: name },
          error: err,
        });
        return { content: [{ type: "text", text: `Error: ${err}` }], isError: true };
      }
    },
  );

  // -------- gcp CLI bridge --------
  // `gcp` is a zsh function, not a binary, so it has to be sourced before it exists.
  // Exposed mainly so the agent can read host-wide state; `gws_profile_use` is the
  // right tool for changing what THIS session runs as.
  if (cfg.gcp.enabled) {
    server.registerTool(
      "gws_gcp",
      {
        title: "Run the host's gcp profile helper",
        description:
          "Run the host's `gcp` zsh helper (ls | who | use | login) for credential diagnostics. `ls` and `who` report machine-wide state. `use` rewrites the machine-wide ADC symlink and gcloud account — it affects every process on the host and does NOT change this session (use `gws_profile_use` for that); ask the user before running it. `login` needs a browser, so this tool returns the command instead of executing it.",
        inputSchema: {
          subcommand: z.enum(GCP_SUBCOMMANDS).describe("gcp subcommand"),
          args: z
            .array(z.string().regex(/^[a-z0-9][a-z0-9._-]*$/i, "lowercase identifiers only"))
            .max(2)
            .default([])
            .describe("Extra args, e.g. the profile name for `use` / `login`"),
        },
      },
      async ({ subcommand, args }) => {
        const start = Date.now();
        const result = await gcp.run(subcommand as GcpSubcommand, args);
        await audit.log({
          event: "tool_call",
          tool: "gws_gcp",
          args: { subcommand, args },
          ok: result.ok,
          exitCode: result.exitCode,
          durationMs: Date.now() - start,
        });

        if (result.note) {
          return { content: [{ type: "text", text: result.note }] };
        }
        if (!result.ok) {
          return {
            content: [
              {
                type: "text",
                text: `gcp ${[subcommand, ...args].join(" ")} failed (exit=${result.exitCode})\n\n${result.stderr || result.stdout || "(no output)"}`,
              },
            ],
            isError: true,
          };
        }
        const suffix =
          subcommand === "use"
            ? `\n\nNote: this changed machine-wide state only. This MCP session still runs as profile "${profiles.active ?? "(none)"}" — use \`gws_profile_use\` to change it.`
            : "";
        return {
          content: [{ type: "text", text: (result.stdout || "(no output)") + (result.stderr ? `\n${result.stderr}` : "") + suffix }],
        };
      },
    );
  }

  server.registerResource(
    "gws-services",
    "gws://services",
    {
      title: "Available services",
      description: "List of Google Workspace services exposed by this server",
      mimeType: "application/json",
    },
    async (uri) => {
      const allow = cfg.safety.allowedServices;
      const list = (allow.size === 0 ? SERVICES.slice() : SERVICES.filter((s) => allow.has(s))) as string[];
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ services: list, denied: [...cfg.safety.deniedMethods] }, null, 2),
          },
        ],
      };
    },
  );

  // -------- Skills layer --------
  if (skills.length > 0) {
    server.registerTool(
      "gws_list_skills",
      {
        title: "List Google Workspace skills",
        description:
          "List field-tested skill guides (loaded from the host's ~/.agents/skills/gws-*). Each entry has name, description, and the related `gws ... --help` command. Call `gws_get_skill` to read the full guide.",
        inputSchema: {},
      },
      async () => {
        await audit.log({ event: "tool_call", tool: "gws_list_skills", ok: true });
        const lines = skills.map((s) => {
          const help = s.cliHelp ? `  cli: ${s.cliHelp}` : "";
          return `- ${s.name} — ${s.description}\n${help}`.trimEnd();
        });
        return {
          content: [
            {
              type: "text",
              text:
                `Available skills (${skills.length}):\n` +
                lines.join("\n") +
                `\n\nFetch with: gws_get_skill name:"<name>"\n` +
                `Or via MCP resource URI: gws-skill://<name>`,
            },
          ],
        };
      },
    );

    server.registerTool(
      "gws_get_skill",
      {
        title: "Read a Google Workspace skill guide",
        description:
          "Return the full markdown body of a skill loaded from ~/.agents/skills/<name>/SKILL.md. Use this to get concrete examples, param shapes, and safety notes for a specific workflow.",
        inputSchema: {
          name: z
            .string()
            .regex(/^[a-z0-9][a-z0-9._-]*$/i)
            .describe("Skill name as shown by `gws_list_skills`, e.g. `gws-drive`, `gws-sheets`"),
        },
      },
      async ({ name }) => {
        const skill = skillsByName.get(name);
        if (!skill) {
          await audit.log({ event: "tool_call", tool: "gws_get_skill", args: { name }, ok: false, error: "not_found" });
          return {
            content: [
              {
                type: "text",
                text: `Skill "${name}" not found. Known skills: ${[...skillsByName.keys()].join(", ")}`,
              },
            ],
            isError: true,
          };
        }
        await audit.log({ event: "tool_call", tool: "gws_get_skill", args: { name }, ok: true });
        return {
          content: [
            {
              type: "text",
              text: `# ${skill.name}\n\n${skill.description}\n\n---\n\n${skill.body}`,
            },
          ],
        };
      },
    );

    // Index resource — clients that browse resources will see this first.
    server.registerResource(
      "gws-skills-index",
      "gws-skill://_index",
      {
        title: "Skills index",
        description: "JSON list of all available gws-* skill guides",
        mimeType: "application/json",
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              skills.map((s) => ({
                name: s.name,
                description: s.description,
                cliHelp: s.cliHelp,
                version: s.version,
                resourceUri: `gws-skill://${s.name}`,
              })),
              null,
              2,
            ),
          },
        ],
      }),
    );

    // One resource per skill at gws-skill://<name>
    for (const skill of skills) {
      server.registerResource(
        `skill-${skill.name}`,
        `gws-skill://${skill.name}`,
        {
          title: `Skill: ${skill.name}`,
          description: skill.description,
          mimeType: "text/markdown",
        },
        async (uri) => ({
          contents: [
            {
              uri: uri.href,
              mimeType: "text/markdown",
              text: skill.raw,
            },
          ],
        }),
      );
    }

    // One prompt per skill — clients with a prompt picker (Claude Desktop "Attach from MCP")
    // will list these for the user to invoke directly.
    for (const skill of skills) {
      server.registerPrompt(
        skill.name,
        {
          title: skill.name,
          description: skill.description,
        },
        () => ({
          description: skill.description,
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text:
                  `Use the following \`${skill.name}\` skill guide as authoritative reference for the next action. ` +
                  `Prefer the documented patterns over freeform CLI invocations. When calling the underlying API, ` +
                  `route through the \`gws_call\` MCP tool exposed by this server.\n\n---\n\n${skill.body}`,
              },
            },
          ],
        }),
      );
    }
  }

  return server;
}
