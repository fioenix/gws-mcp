import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * `gcp` is a zsh *function* defined in a file sourced from ~/.zshrc, so a
 * non-interactive shell has nothing to run. Sourcing the file explicitly is
 * enough — its helpers and the `(N/)` glob qualifier work fine without an
 * interactive shell (verified on zsh 5.9 / macOS 15).
 */
export const GCP_SUBCOMMANDS = ["ls", "who", "use", "login"] as const;
export type GcpSubcommand = (typeof GCP_SUBCOMMANDS)[number];

export interface GcpResult {
  ok: boolean;
  executed: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  note?: string;
}

export function buildGcpScript(scriptPath: string, args: string[]): string {
  const quoted = args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ");
  return `source ${JSON.stringify(scriptPath)} && gcp ${quoted}`;
}

export class GcpBridge {
  constructor(
    private readonly scriptPath: string,
    private readonly enabled: boolean,
    private readonly timeoutMs: number,
  ) {}

  get available(): boolean {
    return this.enabled && existsSync(this.scriptPath);
  }

  unavailableReason(): string {
    if (!this.enabled) return "The gcp bridge is disabled on this host (GWS_MCP_GCP_BRIDGE=0).";
    return `No gcp profile script at ${this.scriptPath} (override with GWS_MCP_GCP_PROFILE_SH).`;
  }

  /** The command a human would type — used for `login`, which needs a browser. */
  manualCommand(args: string[]): string {
    return `zsh -c ${JSON.stringify(buildGcpScript(this.scriptPath, args))}`;
  }

  async run(sub: GcpSubcommand, rest: string[]): Promise<GcpResult> {
    if (!this.available) {
      return { ok: false, executed: false, stdout: "", stderr: this.unavailableReason(), exitCode: null };
    }

    // `gcp login` opens a browser and blocks on a human. Hand back the command
    // instead of holding the tool call open until it times out.
    if (sub === "login") {
      return {
        ok: true,
        executed: false,
        stdout: "",
        stderr: "",
        exitCode: null,
        note:
          "`gcp login` opens a browser — the agent cannot complete it. Ask the user to run:\n\n" +
          `  ${this.manualCommand([sub, ...rest])}\n\n` +
          "or, from an interactive terminal, simply:\n\n" +
          `  gcp ${[sub, ...rest].join(" ")}`,
      };
    }

    const script = buildGcpScript(this.scriptPath, [sub, ...rest]);
    return await new Promise<GcpResult>((resolve) => {
      const child = spawn("zsh", ["-c", script], { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      let err = "";
      const timer = setTimeout(() => child.kill("SIGKILL"), this.timeoutMs);
      timer.unref();
      child.stdout.on("data", (c) => (out += c.toString("utf8")));
      child.stderr.on("data", (c) => (err += c.toString("utf8")));
      child.on("error", (e) => {
        clearTimeout(timer);
        resolve({ ok: false, executed: false, stdout: "", stderr: `spawn-error: ${e.message}`, exitCode: null });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ ok: code === 0, executed: true, stdout: out, stderr: err, exitCode: code });
      });
    });
  }
}
