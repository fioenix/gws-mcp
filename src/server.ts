import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "./config.js";
import { GwsClient, type GwsCallInput, type GwsExecResult } from "./gws.js";
import { AuditLogger } from "./audit.js";
import type { Skill } from "./skills.js";

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

export function buildServer(cfg: Config, opts: BuildServerOptions = {}): McpServer {
  const skills = opts.skills ?? [];
  const skillsByName = new Map(skills.map((s) => [s.name, s] as const));

  const skillsBlurb = skills.length
    ? `\nThis server also exposes ${skills.length} field-tested "skill" guides covering common workflows. Call \`gws_list_skills\` and \`gws_get_skill name:"gws-drive"\` to read them. They are also available as MCP resources (\`gws-skill://<name>\`) and as MCP prompts that clients with prompt UIs can invoke directly.`
    : "";

  const server = new McpServer(
    { name: "gws-mcp", version: "0.2.0" },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: skills.length ? {} : undefined,
      },
      instructions: [
        "This MCP server wraps the locally-installed `gws` Google Workspace CLI.",
        "Authentication happens on the host machine via gws (OAuth tokens stored in the host keyring); this server never sees credentials.",
        "Recommended flow:",
        "  1. Call `gws_list_services` to see what is enabled.",
        "  2. Call `gws_help` with `args:[\"<service>\"]` or `args:[\"<service>\",\"<resource>\"]` to discover methods.",
        "  3. Call `gws_schema` with `service.resource.method` (e.g. `drive.files.list`) to get parameter and body shapes.",
        "  4. Call `gws_call` with the structured args.",
        "Outputs are JSON by default — set `format` to `table`/`yaml`/`csv` only when the user asks for human-readable output.",
        "For paginated list calls, set `pageAll: true` to auto-paginate into NDJSON.",
        "Destructive operations (delete/send) may be blocked by host policy and will return an error.",
        skillsBlurb,
      ]
        .join("\n")
        .trim(),
    },
  );

  const gws = new GwsClient(cfg);
  const audit = new AuditLogger(cfg.safety.auditLog);

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
        return execToContent(result);
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
