import assert from "node:assert/strict";
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

console.log("unit-gcpbridge: ok");
