import { spawn } from "node:child_process";
import type { Config } from "./config.js";
import { applyOverlay, ProfileManager, type EnvOverlay } from "./profiles.js";
import { augmentPath, missingBinMessage, resolveBin } from "./binpath.js";

export interface GwsCallInput {
  /**
   * Run this one call as a named profile instead of the session default.
   *
   * MCP dispatches tool calls concurrently and defines no ordering between them, so
   * a switch and a call issued in the same batch cannot be ordered by the server.
   * Naming the profile on the call itself is the only way to be certain which
   * identity it runs as.
   */
  profile?: string | null;
  service: string;
  resource: string;
  subResource?: string | null;
  method: string;
  params?: Record<string, unknown> | string | null;
  json?: unknown;
  apiVersion?: string | null;
  format?: "json" | "table" | "yaml" | "csv" | null;
  pageAll?: boolean | null;
  pageLimit?: number | null;
  pageDelayMs?: number | null;
  upload?: string | null;
  uploadContentType?: string | null;
  output?: string | null;
  dryRun?: boolean | null;
}

/**
 * Encode an argument value for `--params` / `--json`.
 *
 * The `gws` CLI expects a single JSON string on the command line. Callers may
 * pass us either:
 *   (a) a JS object/array (preferred) — we serialise with JSON.stringify
 *   (b) a string that is already JSON syntax — pass through verbatim
 *
 * Some MCP clients/LLMs pre-stringify body objects before invoking the tool
 * (because the `z.unknown()` JSON Schema lacks a `type` hint). In that case
 * blindly calling JSON.stringify produced a double-encoded `"{\"foo\":1}"`
 * literal — see bug "docs.documents.batchUpdate $: Expected object". This
 * helper makes the wrapper resilient to both shapes.
 */
export function encodeJsonArg(value: unknown, label: string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) throw new Error(`${label} is an empty string`);
    try {
      JSON.parse(trimmed);
    } catch (e) {
      throw new Error(
        `${label} was passed as a string but is not valid JSON syntax (${(e as Error).message}). ` +
          `Pass it as an object/array instead, or fix the JSON.`,
      );
    }
    return trimmed;
  }
  return JSON.stringify(value);
}

export interface GwsExecResult {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  command: string[];
  durationMs: number;
  parsedJson?: unknown;
}

const VALID_NAME = /^[a-z0-9][a-z0-9._-]*$/i;

function assertSafeIdentifier(label: string, value: string): void {
  if (!value || !VALID_NAME.test(value)) {
    throw new Error(`Invalid ${label}: ${JSON.stringify(value)}`);
  }
}

export interface AuthStatus {
  raw: string;
  parsed: Record<string, unknown> | null;
  /** False only when gws actually reported an invalid token. See `probed`. */
  tokenValid: boolean;
  tokenError: string | null;
  /**
   * Whether `gws auth status` ran and returned parseable JSON.
   *
   * When it did not — gws missing from PATH, a timeout — we know nothing about the
   * token. Reporting that as "invalid" would be inventing a verdict from a failed
   * probe, and sends the user off to re-authenticate credentials that are fine.
   */
  probed: boolean;
}

export class GwsClient {
  constructor(
    private readonly cfg: Config,
    readonly profiles: ProfileManager = new ProfileManager(),
  ) {}

  isServiceAllowed(service: string): boolean {
    const allow = this.cfg.safety.allowedServices;
    if (allow.size === 0) return true;
    return allow.has(service);
  }

  isMethodDenied(input: { service: string; resource: string; subResource?: string | null; method: string }): boolean {
    const parts = [input.service, input.resource, input.subResource, input.method].filter(Boolean);
    const dotted = parts.join(".");
    return this.cfg.safety.deniedMethods.has(dotted);
  }

  buildArgs(input: GwsCallInput): string[] {
    assertSafeIdentifier("service", input.service);
    assertSafeIdentifier("resource", input.resource);
    if (input.subResource) assertSafeIdentifier("subResource", input.subResource);
    assertSafeIdentifier("method", input.method);

    const args: string[] = [input.service, input.resource];
    if (input.subResource) args.push(input.subResource);
    args.push(input.method);

    if (input.params !== undefined && input.params !== null) {
      const hasContent =
        typeof input.params === "string"
          ? input.params.trim().length > 0
          : Object.keys(input.params).length > 0;
      if (hasContent) {
        args.push("--params", encodeJsonArg(input.params, "params"));
      }
    }
    if (input.json !== undefined && input.json !== null) {
      args.push("--json", encodeJsonArg(input.json, "json"));
    }
    if (input.dryRun) {
      args.push("--dry-run");
    }
    if (input.apiVersion) {
      assertSafeIdentifier("apiVersion", input.apiVersion);
      args.push("--api-version", input.apiVersion);
    }
    if (input.format) args.push("--format", input.format);
    if (input.pageAll) {
      args.push("--page-all");
      if (input.pageLimit) args.push("--page-limit", String(input.pageLimit));
      if (input.pageDelayMs) args.push("--page-delay", String(input.pageDelayMs));
    }
    if (input.upload) args.push("--upload", input.upload);
    if (input.uploadContentType) args.push("--upload-content-type", input.uploadContentType);
    if (input.output) args.push("--output", input.output);

    return args;
  }

  /**
   * Child env is rebuilt on every spawn from the profile selected *now*, not from
   * whatever the host exported at startup. That is what makes `gws_profile_use`
   * take effect without restarting the MCP server.
   */
  async exec(args: string[], overlay?: EnvOverlay): Promise<GwsExecResult> {
    const name = this.cfg.gws.bin || "gws";
    const start = Date.now();
    const maxBytes = this.cfg.gws.maxOutputBytes;
    const env = applyOverlay(process.env, overlay ?? this.profiles.envOverlay());
    // Children of gws (and of the gcp helper) look up their own tools too.
    env.PATH = augmentPath(env);

    const bin = resolveBin(name, env);
    if (!bin) {
      return {
        ok: false,
        exitCode: null,
        stdout: "",
        stderr: missingBinMessage(name, "GWS_MCP_GWS_BIN"),
        stdoutTruncated: false,
        command: [name, ...args],
        durationMs: Date.now() - start,
      };
    }

    return await new Promise<GwsExecResult>((resolve) => {
      const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], env });
      const stdoutBufs: Buffer[] = [];
      const stderrBufs: Buffer[] = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let truncated = false;
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 2000).unref();
      }, this.cfg.gws.timeoutMs);
      timer.unref();

      child.stdout.on("data", (chunk: Buffer) => {
        if (stdoutBytes < maxBytes) {
          const remain = maxBytes - stdoutBytes;
          if (chunk.length <= remain) {
            stdoutBufs.push(chunk);
            stdoutBytes += chunk.length;
          } else {
            stdoutBufs.push(chunk.subarray(0, remain));
            stdoutBytes = maxBytes;
            truncated = true;
          }
        } else {
          truncated = true;
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        if (stderrBytes < maxBytes) {
          const remain = maxBytes - stderrBytes;
          stderrBufs.push(chunk.length <= remain ? chunk : chunk.subarray(0, remain));
          stderrBytes += Math.min(chunk.length, remain);
        }
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          ok: false,
          exitCode: null,
          stdout: "",
          stderr: `spawn-error: ${err.message}`,
          stdoutTruncated: false,
          command: [bin, ...args],
          durationMs: Date.now() - start,
        });
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        const stdout = Buffer.concat(stdoutBufs).toString("utf8");
        const stderr = Buffer.concat(stderrBufs).toString("utf8");
        const durationMs = Date.now() - start;
        let parsed: unknown = undefined;
        if (stdout) {
          try {
            parsed = JSON.parse(stdout);
          } catch {
            parsed = undefined;
          }
        }
        resolve({
          ok: code === 0 && !timedOut,
          exitCode: timedOut ? null : code,
          stdout,
          stderr: timedOut ? `timeout after ${this.cfg.gws.timeoutMs}ms\n${stderr}` : stderr,
          stdoutTruncated: truncated,
          command: [bin, ...args],
          durationMs,
          parsedJson: parsed,
        });
      });
    });
  }

  async call(input: GwsCallInput): Promise<GwsExecResult> {
    if (!this.isServiceAllowed(input.service)) {
      throw new Error(
        `Service "${input.service}" is not in the allowed list. Configure GWS_MCP_ALLOWED_SERVICES on the host.`,
      );
    }
    if (this.isMethodDenied(input)) {
      throw new Error(
        `Method "${[input.service, input.resource, input.subResource, input.method].filter(Boolean).join(".")}" is denied by host policy (GWS_MCP_DENIED_METHODS).`,
      );
    }
    const args = this.buildArgs(input);
    const overlay = input.profile ? this.profiles.envOverlayFor(input.profile) : undefined;
    return this.exec(args, overlay);
  }

  async schema(target: string, resolveRefs = false): Promise<GwsExecResult> {
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(target) || !target.includes(".")) {
      throw new Error(`Invalid schema target: ${JSON.stringify(target)} (expected "service.resource.method")`);
    }
    const args = ["schema", target];
    if (resolveRefs) args.push("--resolve-refs");
    return this.exec(args);
  }

  /**
   * `gws auth status` is read-only and reports token validity per config dir, so it
   * is the only safe way to answer "is this profile usable?" without making a call.
   * Pass a profile name to probe one we are not currently running as.
   */
  async authStatus(profile?: string | null): Promise<AuthStatus> {
    const overlay = profile ? this.profiles.envOverlayFor(profile) : undefined;
    const result = await this.exec(["auth", "status"], overlay);
    let parsed: Record<string, unknown> | null = null;
    if (result.parsedJson && typeof result.parsedJson === "object") {
      parsed = result.parsedJson as Record<string, unknown>;
    }
    return {
      raw: result.stdout || result.stderr,
      parsed,
      probed: parsed !== null,
      tokenValid: parsed?.token_valid === true,
      tokenError: typeof parsed?.token_error === "string" ? (parsed.token_error as string) : null,
    };
  }

  async help(extraArgs: string[] = []): Promise<GwsExecResult> {
    for (const a of extraArgs) {
      if (!/^[a-z0-9][a-z0-9._-]*$/i.test(a)) {
        throw new Error(`Invalid help argument: ${JSON.stringify(a)}`);
      }
    }
    return this.exec([...extraArgs, "--help"]);
  }
}
