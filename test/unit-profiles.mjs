import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProfileManager, applyOverlay } from "../dist/profiles.js";

const root = mkdtempSync(join(tmpdir(), "gws-pm-"));
for (const [name, account, project] of [
  ["work", "phuongtd@yody.vn", "fioenix"],
  ["personal", "tangduyphuong@gmail.com", "finolabs"],
]) {
  mkdirSync(join(root, name, "gcloud"), { recursive: true });
  mkdirSync(join(root, name, "gws"), { recursive: true });
  writeFileSync(join(root, name, "gcloud", "application_default_credentials.json"), "{}");
  writeFileSync(join(root, name, "account"), account + "\n");
  writeFileSync(join(root, name, "project"), project + "\n");
}
// A profile whose ADC was never created.
mkdirSync(join(root, "broken"), { recursive: true });

// 1. list() reads account/project and flags the missing ADC
const pm = new ProfileManager({ GWS_PROFILE: "work", GWS_PROFILE_ROOT: root });
const names = pm.list().map((p) => p.name);
assert.deepEqual(names, ["broken", "personal", "work"]);
const work = pm.list().find((p) => p.name === "work");
assert.equal(work.account, "phuongtd@yody.vn");
assert.equal(work.project, "fioenix");
assert.equal(work.active, true);
assert.equal(pm.list().find((p) => p.name === "broken").credentialsExist, false);

// 2. the overlay points gws at this profile's own config dir
const ov = pm.envOverlay();
assert.equal(ov.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE, join(root, "work", "gcloud", "application_default_credentials.json"));
assert.equal(ov.GOOGLE_WORKSPACE_CLI_CONFIG_DIR, join(root, "work", "gws"));
assert.equal(ov.GWS_PROFILE, "work");

// 3. switching changes the overlay in-process — this is what makes gws_profile_use
//    work without restarting the server
pm.use("personal");
assert.equal(pm.active, "personal");
assert.equal(pm.envOverlay().GOOGLE_WORKSPACE_CLI_CONFIG_DIR, join(root, "personal", "gws"));
assert.notEqual(pm.envOverlay().GOOGLE_WORKSPACE_CLI_CONFIG_DIR, ov.GOOGLE_WORKSPACE_CLI_CONFIG_DIR);

// 4. vars that would survive a switch and silently defeat it are cleared
const child = applyOverlay(
  {
    PATH: "/usr/bin",
    GOOGLE_APPLICATION_CREDENTIALS: "/stale/adc.json",
    GOOGLE_WORKSPACE_PROJECT_ID: "some-project",
    GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND: "file",
  },
  pm.envOverlay(),
);
assert.equal(child.GOOGLE_APPLICATION_CREDENTIALS, undefined);
assert.equal(child.GOOGLE_WORKSPACE_PROJECT_ID, undefined);
assert.equal(child.GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND, undefined);
assert.equal(child.PATH, "/usr/bin");
assert.equal(child.GOOGLE_WORKSPACE_CLI_CONFIG_DIR, join(root, "personal", "gws"));

// 5. refuse to switch to something unusable rather than running as the wrong identity
assert.throws(() => pm.use("nope"), /No profile "nope"/);
assert.throws(() => pm.use("broken"), /no credentials/);
assert.equal(pm.active, "personal", "a failed switch must not change the active profile");
assert.throws(() => pm.use("../escape"), /Invalid profile name/);

// 6. host pinned explicit paths with no GWS_PROFILE
const pinned = new ProfileManager({
  GWS_PROFILE_ROOT: root,
  GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE: "/pinned/adc.json",
});
assert.equal(pinned.active, null);
assert.equal(pinned.pinned, true);
assert.deepEqual(pinned.envOverlay(), {});

console.log("unit-profiles: ok");
