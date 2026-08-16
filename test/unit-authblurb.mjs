import assert from "node:assert/strict";
import { authBlurb } from "../dist/server.js";

// 1. default setup: gws owns its credentials, `gws auth login` is the right answer
const def = authBlurb({});
assert.match(def, /gws auth login/);
assert.doesNotMatch(def, /Do NOT run/);

// 2. ADC mode: name the profile, and rule out the two things agents reach for by reflex
const adc = authBlurb({
  GWS_PROFILE: "work",
  GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE: "/home/u/.config/gcloud/profiles/work/gcloud/adc.json",
});
assert.match(adc, /profile "work"/);
assert.match(adc, /\/home\/u\/.config\/gcloud\/profiles\/work\/gcloud\/adc\.json/);
assert.match(adc, /Do NOT run `gws auth login` or `gws auth setup`/);
assert.match(adc, /Do NOT copy or symlink client_secret\.json/);
assert.match(adc, /invalid_rapt/, "tells the agent what to do on the error it will actually hit");
assert.match(adc, /gws auth status is safe|`gws auth status` is safe/);

// 3. credentials file without a profile: same rules, no profile name invented
const noProfile = authBlurb({ GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE: "/tmp/adc.json" });
assert.match(noProfile, /explicitly configured credentials file/);
assert.doesNotMatch(noProfile, /profile "/);
assert.match(noProfile, /Do NOT run/);

// 4. blank values are treated as unset
assert.equal(authBlurb({ GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE: "   " }), def);

console.log("unit-authblurb: ok");
