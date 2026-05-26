#!/usr/bin/env node
import { loadConfig, type Transport } from "./config.js";
import { buildServer } from "./server.js";
import { runStdio } from "./transports/stdio.js";
import { runHttp } from "./transports/http.js";
import { loadSkills, resolveSkillsDir, type Skill } from "./skills.js";

function parseArgs(argv: string[]): { transport?: Transport; help?: boolean } {
  const args = argv.slice(2);
  const out: { transport?: Transport; help?: boolean } = {};
  for (const a of args) {
    if (a === "stdio" || a === "http") out.transport = a;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function printHelp(): void {
  process.stdout.write(
    [
      "gws-mcp — MCP server wrapping the local `gws` Google Workspace CLI",
      "",
      "Usage:",
      "  gws-mcp [stdio|http]            # default: GWS_MCP_TRANSPORT or stdio",
      "  gws-mcp --help",
      "",
      "Modes:",
      "  stdio   For Claude Desktop / Claude Code / Claude Cowork on the same host.",
      "          The MCP client spawns this binary as a child process — no network.",
      "  http    Streamable HTTP for true remote sandboxes (Vercel Sandbox, Docker",
      "          worker, remote dev container). Requires GWS_MCP_AUTH_TOKEN.",
      "",
      "Auth flows through the host's `gws` CLI — this server never sees your OAuth tokens.",
      "See .env.example for all options.",
      "",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv);
  if (cli.help) {
    printHelp();
    return;
  }
  const cfg = loadConfig({ transport: cli.transport });

  let skills: Skill[] = [];
  if (cfg.skills.enabled) {
    const dir = resolveSkillsDir(cfg.skills.dir);
    skills = await loadSkills(dir, cfg.skills.prefix);
    process.stderr.write(`[gws-mcp] loaded ${skills.length} skill(s) from ${dir}\n`);
  }

  if (cfg.transport === "http") {
    await runHttp(() => buildServer(cfg, { skills }), cfg);
    return;
  }
  await runStdio(buildServer(cfg, { skills }));
}

main().catch((err) => {
  process.stderr.write(`[gws-mcp] fatal: ${(err as Error).stack || (err as Error).message}\n`);
  process.exit(1);
});
