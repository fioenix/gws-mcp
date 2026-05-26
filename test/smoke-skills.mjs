import { spawn } from "node:child_process";

const child = spawn("node", ["dist/index.js", "stdio"], { stdio: ["pipe", "pipe", "pipe"] });
let out = "";
let stderr = "";
child.stdout.on("data", (b) => (out += b.toString("utf8")));
child.stderr.on("data", (b) => (stderr += b.toString("utf8")));

function send(obj) {
  child.stdin.write(JSON.stringify(obj) + "\n");
}

send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "s", version: "0" } } });
send({ jsonrpc: "2.0", method: "notifications/initialized" });
send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
send({ jsonrpc: "2.0", id: 3, method: "resources/list" });
send({ jsonrpc: "2.0", id: 4, method: "prompts/list" });
send({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "gws_list_skills", arguments: {} } });
send({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "gws_get_skill", arguments: { name: "gws-drive" } } });
send({ jsonrpc: "2.0", id: 7, method: "resources/read", params: { uri: "gws-skill://gws-sheets" } });
send({ jsonrpc: "2.0", id: 8, method: "prompts/get", params: { name: "gws-tasks" } });

setTimeout(() => {
  child.kill("SIGTERM");
  const responses = out
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter(Boolean);

  const byId = new Map(responses.filter((r) => r.id).map((r) => [r.id, r]));

  console.log("stderr:", stderr.split("\n").filter(Boolean).slice(-3).join(" | "));
  console.log("tools count:", byId.get(2)?.result?.tools?.length);
  console.log("tools:", byId.get(2)?.result?.tools?.map((t) => t.name).join(", "));
  console.log("resources count:", byId.get(3)?.result?.resources?.length);
  console.log("resources:", byId.get(3)?.result?.resources?.map((r) => r.uri).join(", "));
  console.log("prompts count:", byId.get(4)?.result?.prompts?.length);
  console.log("prompts:", byId.get(4)?.result?.prompts?.map((p) => p.name).join(", "));
  const list = byId.get(5)?.result?.content?.[0]?.text || "";
  console.log("gws_list_skills (head):", list.split("\n").slice(0, 6).join(" | "));
  const drive = byId.get(6)?.result?.content?.[0]?.text || "";
  console.log("gws_get_skill drive size:", drive.length, "head:", drive.slice(0, 100).replace(/\n/g, " | "));
  const res = byId.get(7)?.result?.contents?.[0]?.text || "";
  console.log("resource sheets size:", res.length, "head:", res.slice(0, 80).replace(/\n/g, " | "));
  const prompt = byId.get(8)?.result;
  console.log("prompt gws-tasks messages:", prompt?.messages?.length, "first role:", prompt?.messages?.[0]?.role);
  process.exit(0);
}, 1500);
