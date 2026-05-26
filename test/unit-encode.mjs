import assert from "node:assert/strict";
import { GwsClient, encodeJsonArg } from "../dist/gws.js";

const cfg = {
  transport: "stdio",
  http: { host: "", port: 0, path: "", authToken: "", insecure: false, corsOrigins: [] },
  gws: { bin: "gws", timeoutMs: 1000, maxOutputBytes: 1000 },
  safety: { allowedServices: new Set(), deniedMethods: new Set(), auditLog: "" },
  skills: { dir: "", prefix: "gws-", enabled: false },
};
const c = new GwsClient(cfg);

// 1. encodeJsonArg: object input → JSON.stringify once
assert.equal(encodeJsonArg({ requests: [] }, "x"), '{"requests":[]}');
assert.equal(encodeJsonArg({ a: 1, b: "x" }, "x"), '{"a":1,"b":"x"}');
assert.equal(encodeJsonArg([1, 2, 3], "x"), "[1,2,3]");

// 2. encodeJsonArg: string input that IS valid JSON → pass through verbatim
assert.equal(encodeJsonArg('{"requests":[]}', "x"), '{"requests":[]}');
assert.equal(encodeJsonArg('  {"requests":[]}  ', "x"), '{"requests":[]}', "trims whitespace");
assert.equal(encodeJsonArg("[1,2,3]", "x"), "[1,2,3]");

// 3. encodeJsonArg: string that is NOT JSON → throw
assert.throws(() => encodeJsonArg("not json", "json"), /not valid JSON/);
assert.throws(() => encodeJsonArg("", "json"), /empty string/);

// 4. encodeJsonArg: pre-stringified-twice (what bug looked like) → still parses as JSON
//    The outer call still produces single-encoded output. This is by design:
//    if the user manually double-encoded, we can't tell — but their JSON.parse round-trips, so we accept it.
const doubleEncoded = JSON.stringify(JSON.stringify({ requests: [] }));
// doubleEncoded === '"{\\"requests\\":[]}"'
assert.equal(encodeJsonArg(doubleEncoded, "x"), doubleEncoded, "double-encoded string is treated as opaque");

// 5. buildArgs: object body → correct argv (no double encoding)
const argv1 = c.buildArgs({
  service: "docs",
  resource: "documents",
  method: "batchUpdate",
  params: { documentId: "X" },
  json: { requests: [] },
});
assert.deepEqual(argv1, [
  "docs",
  "documents",
  "batchUpdate",
  "--params",
  '{"documentId":"X"}',
  "--json",
  '{"requests":[]}',
]);

// 6. buildArgs: string body (pre-stringified by LLM) → SAME argv as object case
const argv2 = c.buildArgs({
  service: "docs",
  resource: "documents",
  method: "batchUpdate",
  params: '{"documentId":"X"}',
  json: '{"requests":[]}',
});
assert.deepEqual(argv2, argv1, "string and object inputs produce identical argv");

// 7. buildArgs: dryRun flag
const argv3 = c.buildArgs({
  service: "docs",
  resource: "documents",
  method: "batchUpdate",
  params: { documentId: "X" },
  json: { requests: [] },
  dryRun: true,
});
assert.ok(argv3.includes("--dry-run"));

// 8. buildArgs: invalid string body → throws with helpful error
assert.throws(
  () =>
    c.buildArgs({
      service: "docs",
      resource: "documents",
      method: "batchUpdate",
      json: "not json at all",
    }),
  /not valid JSON/,
);

console.log("OK — all 8 assertions pass");
