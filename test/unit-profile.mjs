import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfile } from "../dist/config.js";

const root = mkdtempSync(join(tmpdir(), "gws-profiles-"));
for (const name of ["work", "personal"]) {
  mkdirSync(join(root, name, "gcloud"), { recursive: true });
  writeFileSync(join(root, name, "gcloud", "application_default_credentials.json"), "{}");
}

// 1. no GWS_PROFILE → nothing happens
let env = { GWS_PROFILE_ROOT: root };
resolveProfile(env);
assert.equal(env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE, undefined);
assert.equal(env.GOOGLE_WORKSPACE_CLI_CONFIG_DIR, undefined);

// 2. GWS_PROFILE expands to both vars
env = { GWS_PROFILE: "work", GWS_PROFILE_ROOT: root };
resolveProfile(env);
assert.equal(
  env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE,
  join(root, "work", "gcloud", "application_default_credentials.json"),
);
assert.equal(env.GOOGLE_WORKSPACE_CLI_CONFIG_DIR, join(root, "work", "gws"));

// 3. each profile resolves to its own config dir — sharing one leaks identity via token cache
const a = { GWS_PROFILE: "work", GWS_PROFILE_ROOT: root };
const b = { GWS_PROFILE: "personal", GWS_PROFILE_ROOT: root };
resolveProfile(a);
resolveProfile(b);
assert.notEqual(a.GOOGLE_WORKSPACE_CLI_CONFIG_DIR, b.GOOGLE_WORKSPACE_CLI_CONFIG_DIR);
assert.notEqual(a.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE, b.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE);

// 4. explicit vars win over the profile
env = {
  GWS_PROFILE: "work",
  GWS_PROFILE_ROOT: root,
  GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE: "/pinned/adc.json",
  GOOGLE_WORKSPACE_CLI_CONFIG_DIR: "/pinned/dir",
};
resolveProfile(env);
assert.equal(env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE, "/pinned/adc.json");
assert.equal(env.GOOGLE_WORKSPACE_CLI_CONFIG_DIR, "/pinned/dir");

// 5. unknown profile throws instead of silently running as the default identity
assert.throws(
  () => resolveProfile({ GWS_PROFILE: "nope", GWS_PROFILE_ROOT: root }),
  /credentials not found/,
);

// 6. whitespace-only profile is treated as unset
env = { GWS_PROFILE: "   ", GWS_PROFILE_ROOT: root };
resolveProfile(env);
assert.equal(env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE, undefined);

console.log("unit-profile: ok");
