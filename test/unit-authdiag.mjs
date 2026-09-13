import assert from "node:assert/strict";
import { classifyAuthError, renderDiagnosis } from "../dist/authdiag.js";

// 1. the real error text this work started from
assert.equal(
  classifyAuthError("error[auth]: Authentication failed: Failed to get token: Server error: invalid_grant: reauth related error (invalid_rapt)"),
  "reauth_required",
);
// a reauth error also matches the generic /error\[auth\]/ rule — the specific one must win
assert.equal(classifyAuthError("invalid_grant: Token has been expired or revoked."), "reauth_required");

// 2. the other classes are distinguished, not lumped together
assert.equal(
  classifyAuthError("403: Caller does not have permission serviceusage.services.use on project fioenix"),
  "quota_project",
);
assert.equal(
  classifyAuthError("Request had insufficient authentication scopes. ACCESS_TOKEN_SCOPE_INSUFFICIENT"),
  "insufficient_scope",
);
assert.equal(classifyAuthError('"credential_source": "none"'), "missing_credentials");
assert.equal(classifyAuthError("error[auth]: something odd"), "unauthenticated");

// 3. a non-auth failure must not be dressed up as one
assert.equal(classifyAuthError("Error 404: File not found: abc123"), null);
assert.equal(classifyAuthError(""), null);

// 3b. REGRESSION: a bare 401 and the loose phrase "quota project" occur in ordinary
//     API errors. Attaching credential advice to those sends the agent to fix
//     something that is not broken.
assert.equal(classifyAuthError("Invalid value at 'data.values[401]' (TYPE_INT64)"), null);
assert.equal(classifyAuthError("Invalid requests[0].insertText: index 401 must be less than end"), null);
assert.equal(classifyAuthError("File not found: Budget 401 Plan.xlsx"), null);
assert.equal(classifyAuthError("The user has exceeded their Drive storage quota project limits"), null);

// ...while auth-shaped 401s and real quota-project errors still land
assert.equal(classifyAuthError('{"error":{"code":401,"message":"Request had invalid credentials"}}'), "unauthenticated");
assert.equal(classifyAuthError("HTTP 401 Unauthorized"), "unauthenticated");
assert.equal(
  classifyAuthError("Grant the caller the roles/serviceusage.serviceUsageConsumer role"),
  "quota_project",
);
assert.equal(classifyAuthError("quotaProject fioenix is not enabled"), "quota_project");

const profile = {
  name: "work",
  account: "phuongtd@yody.vn",
  project: "fioenix",
  credentialsFile: "/p/work/gcloud/application_default_credentials.json",
  configDir: "/p/work/gws",
  credentialsExist: true,
  configDirExists: true,
  clientSecret: "/p/work/client_secret.json",
  scopesFile: "/p/work/scopes",
  active: true,
};

// 4. a reauth diagnosis names the profile, the file, and a runnable command —
//    and tells the agent to stop retrying
const text = renderDiagnosis({
  kind: "reauth_required",
  profile,
  credentialsFile: profile.credentialsFile,
  configDir: profile.configDir,
  healthyAlternatives: [{ name: "personal", account: "tangduyphuong@gmail.com" }],
});
assert.match(text, /profile\s+: work/);
assert.match(text, /phuongtd@yody\.vn/);
assert.match(text, /\/p\/work\/gcloud\/application_default_credentials\.json/);
assert.match(text, /cause\s+: reauth_required/);
assert.match(text, /NOT something the agent can fix/);
assert.match(text, /gcp login work/);
assert.match(text, /--client-id-file=\/p\/work\/client_secret\.json/);
assert.match(text, /personal \(tangduyphuong@gmail\.com\)/);
assert.match(text, /do not switch identity on your own/i);

// 5. quota-project advice must not send the user to a browser login
const quota = renderDiagnosis({
  kind: "quota_project",
  profile,
  credentialsFile: profile.credentialsFile,
  configDir: profile.configDir,
});
assert.match(quota, /GOOGLE_WORKSPACE_PROJECT_ID/);
assert.doesNotMatch(quota, /gcp login/);

console.log("unit-authdiag: ok");
