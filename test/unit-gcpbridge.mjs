import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GcpBridge, buildGcpScript, GCP_SUBCOMMANDS } from "../dist/gcpbridge.js";

// 1. the script sources the helper first — `gcp` is a zsh function, so a
//    non-interactive shell has nothing to call otherwise
const script = buildGcpScript("/Users/x/.config/gcloud/gcp-profile.zsh", ["use", "work"]);
assert.match(script, /^source "\/Users\/x\/\.config\/gcloud\/gcp-profile\.zsh" && gcp 'use' 'work'$/);

// 2. arguments are single-quoted, so a crafted name cannot break out
assert.match(buildGcpScript("/s.zsh", ["use", "a'; rm -rf /; echo '"]), /'a'\\''; rm -rf \/; echo '\\'''/);

// 3. a missing helper script is reported, not silently skipped
const missing = new GcpBridge("/nope/gcp-profile.zsh", true, 1000);
assert.equal(missing.available, false);
const r = await missing.run("ls", []);
assert.equal(r.ok, false);
assert.equal(r.executed, false);
assert.match(r.stderr, /No gcp profile script/);

// 4. the host can turn the bridge off
const off = new GcpBridge("/nope/gcp-profile.zsh", false, 1000);
assert.match(off.unavailableReason(), /disabled on this host/);

assert.deepEqual([...GCP_SUBCOMMANDS], ["ls", "who", "use", "login"]);

// 5. a host can keep read-only diagnostics without letting an agent rewrite the
//    machine-wide ADC symlink via `gcp use`
const readOnly = new GcpBridge("/nope/gcp-profile.zsh", true, 1000, ["ls", "who"]);
assert.equal(readOnly.isAllowed("ls"), true);
assert.equal(readOnly.isAllowed("use"), false);
assert.deepEqual(readOnly.allowedList, ["ls", "who"]);
const denied = await readOnly.run("use", ["work"]);
assert.equal(denied.ok, false);
assert.equal(denied.executed, false, "a denied subcommand must never spawn a shell");
assert.match(denied.stderr, /not permitted on this host/);

// 6. an empty allowlist means "unset", not "deny everything"
assert.deepEqual(new GcpBridge("/s.zsh", true, 1000, []).allowedList, ["ls", "who", "use", "login"]);

// 7. a timeout is reported as a timeout — SIGKILL leaves stderr empty, so without
//    the flag it is indistinguishable from a crash (exit=null, no output)
const slowScript = join(mkdtempSync(join(tmpdir(), "gcp-slow-")), "gcp-profile.zsh");
writeFileSync(slowScript, "gcp() { sleep 5; }\n");
const slow = new GcpBridge(slowScript, true, 150);
const timed = await slow.run("who", []);
assert.equal(timed.ok, false);
assert.equal(timed.exitCode, null);
assert.match(timed.stderr, /timeout after 150ms/);
assert.match(timed.stderr, /GWS_MCP_GCP_TIMEOUT_MS/);

console.log("unit-gcpbridge: ok");
