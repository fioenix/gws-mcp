import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";

// Use a deterministic fixture skills dir so CI does not depend on ~/.agents/skills.
const here = dirname(fileURLToPath(import.meta.url));
const skillsDir = resolve(here, "fixtures", "skills");

const child = spawn("node", ["dist/index.js", "stdio"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, GWS_MCP_SKILLS_DIR: skillsDir, GWS_MCP_SKILLS_PREFIX: "gws-" },
});
let out = "";
let stderr = "";
child.stdout.on("data", (b) => (out += b.toString("utf8")));
child.stderr.on("data", (b) => (stderr += b.toString("utf8")));

function send(obj) {
  child.stdin.write(JSON.stringify(obj) + "\n");
}

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "s", version: "0" } },
});
send({ jsonrpc: "2.0", method: "notifications/initialized" });
send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
send({ jsonrpc: "2.0", id: 3, method: "resources/list" });
send({ jsonrpc: "2.0", id: 4, method: "prompts/list" });
send({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "gws_list_skills", arguments: {} } });
send({
  jsonrpc: "2.0",
  id: 6,
  method: "tools/call",
  params: { name: "gws_get_skill", arguments: { name: "gws-fixture-drive" } },
});
send({ jsonrpc: "2.0", id: 7, method: "resources/read", params: { uri: "gws-skill://gws-fixture-sheets" } });
send({ jsonrpc: "2.0", id: 8, method: "prompts/get", params: { name: "gws-fixture-drive" } });

setTimeout(() => {
  child.kill("SIGTERM");
  const responses = out
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const byId = new Map(responses.filter((r) => r.id).map((r) => [r.id, r]));

  const tools = byId.get(2)?.result?.tools || [];
  const resources = byId.get(3)?.result?.resources || [];
  const prompts = byId.get(4)?.result?.prompts || [];
  const listText = byId.get(5)?.result?.content?.[0]?.text || "";
  const driveText = byId.get(6)?.result?.content?.[0]?.text || "";
  const sheetsRaw = byId.get(7)?.result?.contents?.[0]?.text || "";
  const promptResp = byId.get(8)?.result;

  console.log("stderr:", stderr.split("\n").filter(Boolean).slice(-3).join(" | "));
  console.log("tools:", tools.map((t) => t.name).join(", "));
  console.log("resources:", resources.map((r) => r.uri).join(", "));
  console.log("prompts:", prompts.map((p) => p.name).join(", "));

  assert.equal(tools.length, 6, "expected 6 tools");
  const toolNames = tools.map((t) => t.name).sort();
  assert.deepEqual(toolNames, [
    "gws_call",
    "gws_get_skill",
    "gws_help",
    "gws_list_services",
    "gws_list_skills",
    "gws_schema",
  ]);

  // 2 fixture skills → 2 skill resources + 1 _index + 1 gws://services = 4
  assert.equal(resources.length, 4, "expected 4 resources (services + index + 2 fixture skills)");
  const uris = resources.map((r) => r.uri).sort();
  assert.deepEqual(uris, [
    "gws-skill://_index",
    "gws-skill://gws-fixture-drive",
    "gws-skill://gws-fixture-sheets",
    "gws://services",
  ]);

  assert.equal(prompts.length, 2, "expected 2 fixture prompts");

  assert.ok(listText.includes("gws-fixture-drive"), "gws_list_skills shows fixture-drive");
  assert.ok(listText.includes("gws-fixture-sheets"), "gws_list_skills shows fixture-sheets");

  assert.ok(driveText.includes("gws-fixture-drive"), "gws_get_skill returns fixture body");
  assert.ok(driveText.length > 50, `drive body too small (${driveText.length})`);

  assert.ok(sheetsRaw.startsWith("---"), "resource sheets returns raw markdown with frontmatter");

  assert.equal(promptResp?.messages?.length, 1, "prompt returns one message");
  assert.equal(promptResp?.messages?.[0]?.role, "user");

  console.log("\nOK — smoke-skills passes with deterministic fixtures");
  process.exit(0);
}, 1500);
