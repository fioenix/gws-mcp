// Verify the docs.documents.batchUpdate bug is fixed end-to-end:
// 1. LLM passes body as OBJECT → CLI sees {"requests":[]} → dry-run returns body as object
// 2. LLM passes body as STRING → CLI sees {"requests":[]} → dry-run returns body as object
// Both paths must produce identical dry-run output.

import { spawn } from "node:child_process";

function callServer(jsonArg) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["dist/index.js", "stdio"], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let stderr = "";
    child.stdout.on("data", (b) => (out += b.toString("utf8")));
    child.stderr.on("data", (b) => (stderr += b.toString("utf8")));

    const send = (obj) => child.stdin.write(JSON.stringify(obj) + "\n");
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } },
    });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "gws_call",
        arguments: {
          service: "docs",
          resource: "documents",
          method: "batchUpdate",
          params: { documentId: "INTEGRATION_TEST_FAKE" },
          json: jsonArg,
          dryRun: true,
        },
      },
    });

    setTimeout(() => {
      child.kill("SIGTERM");
      const lines = out.split("\n").filter(Boolean);
      const callResp = lines
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .find((r) => r && r.id === 2);
      if (!callResp) return reject(new Error("no tools/call response\nstderr:\n" + stderr));
      resolve(callResp);
    }, 1500);
  });
}

const objectInput = await callServer({ requests: [] });
const stringInput = await callServer('{"requests":[]}');

function bodyFromResponse(resp) {
  const text = resp.result?.content?.[0]?.text ?? "";
  // The dry-run output is wrapped in our success envelope. Find the embedded JSON.
  const idx = text.indexOf("{");
  if (idx < 0) throw new Error(`no JSON in response text: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(text.slice(idx));
  return parsed;
}

const a = bodyFromResponse(objectInput);
const b = bodyFromResponse(stringInput);

console.log("\nObject-input dry-run body:", JSON.stringify(a.body));
console.log("String-input dry-run body:", JSON.stringify(b.body));
console.log("URL:", a.url);
console.log("Method:", a.method);

import assert from "node:assert/strict";
assert.deepEqual(a.body, { requests: [] }, "object-input must produce body as object");
assert.deepEqual(b.body, { requests: [] }, "string-input must produce body as object");
assert.deepEqual(a.body, b.body, "both paths must produce identical body");
assert.equal(a.method, "POST");
assert.ok(a.url.includes("batchUpdate"), "url is batchUpdate");

console.log("\nOK — bug fixed: both object and string inputs produce a JSON object body");
