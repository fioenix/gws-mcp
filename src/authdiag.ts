import type { ProfileInfo } from "./profiles.js";

/**
 * What kind of auth failure this is, because the fixes are not interchangeable:
 * a reauth needs a browser, a quota-project 403 needs an env var removed, and a
 * scope gap needs a different --scopes list at login time.
 */
export type AuthErrorKind =
  | "reauth_required"
  | "missing_credentials"
  | "quota_project"
  | "insufficient_scope"
  | "unauthenticated";

/**
 * Ordered: the specific causes must win over the generic "unauthenticated".
 *
 * Every pattern has to require auth-shaped context. A bare `401` or the loose phrase
 * "quota project" also occurs in ordinary API errors — a Sheets `data.values[401]`
 * type error, a Drive "storage quota project limits" message — and attaching
 * credential advice to those sends the agent to fix something that is not broken.
 */
const PATTERNS: [AuthErrorKind, RegExp][] = [
  ["reauth_required", /invalid_rapt|reauth\s+related|invalid_grant|token has been expired or revoked/i],
  [
    "quota_project",
    /serviceusage\.(services\.use|serviceUsageConsumer)|SERVICE_DISABLED|quota[_-]?[Pp]roject|has not been used in project/,
  ],
  ["insufficient_scope", /ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient authentication scopes|insufficient[_ ]scope/i],
  ["missing_credentials", /credentials (file )?not found|no credentials found|No OAuth client configured|credential_source"?\s*[:=]\s*"?none/i],
  [
    "unauthenticated",
    /error\[auth\]|UNAUTHENTICATED|Authentication failed|"code"\s*:\s*401\b|\b401\s+Unauthorized|status(?:Code)?\s*[:=]\s*401\b/i,
  ],
];

export function classifyAuthError(text: string): AuthErrorKind | null {
  if (!text) return null;
  for (const [kind, re] of PATTERNS) {
    if (re.test(text)) return kind;
  }
  return null;
}

export interface DiagnosisInput {
  kind: AuthErrorKind;
  /** Profile the failing call ran as; null when the host pinned raw paths. */
  profile: ProfileInfo | null;
  credentialsFile: string | null;
  configDir: string | null;
  /** Other profiles on this machine whose token is currently valid. */
  healthyAlternatives?: { name: string; account: string | null }[];
}

function loginCommand(profile: ProfileInfo | null): string[] {
  if (!profile) {
    return [
      "  gcloud auth application-default login --client-id-file=<your client_secret.json> --scopes=...",
    ];
  }
  return [
    `  gcp login ${profile.name}`,
    "",
    "  # or, without the gcp helper:",
    `  CLOUDSDK_CONFIG=${profile.credentialsFile.replace(/\/application_default_credentials\.json$/, "")} \\`,
    "    gcloud auth application-default login \\",
    `    --client-id-file=${profile.clientSecret} \\`,
    `    --scopes="$(cat ${profile.scopesFile})"`,
  ];
}

/**
 * Turn a raw Google error into something an agent can act on: which identity was
 * used, which file was read, what class of failure this is, and the exact command
 * with this profile's paths already filled in.
 */
export function renderDiagnosis(d: DiagnosisInput): string {
  const lines: string[] = ["", "--- gws-mcp auth diagnosis ---"];

  lines.push(`profile     : ${d.profile ? d.profile.name : "(none — host pinned explicit paths)"}`);
  if (d.profile?.account) lines.push(`account     : ${d.profile.account}`);
  lines.push(`credentials : ${d.credentialsFile ?? "(gws default)"}`);
  lines.push(`config dir  : ${d.configDir ?? "(gws default)"}`);
  lines.push(`cause       : ${d.kind}`);
  lines.push("");

  switch (d.kind) {
    case "reauth_required":
      lines.push(
        "The refresh token is rejected and only a browser can mint a new one.",
        "This is NOT something the agent can fix — do not retry the call, and do not run",
        "`gws auth login` or `gws auth setup` (different credential store; setup corrupts",
        "the OAuth client config). Ask the user to run, on the host:",
        "",
        ...loginCommand(d.profile),
      );
      break;
    case "missing_credentials":
      lines.push(
        "No usable credentials were found for this profile. Ask the user to run:",
        "",
        ...loginCommand(d.profile),
      );
      break;
    case "quota_project":
      lines.push(
        "Google is billing this call to a quota project the account cannot use.",
        "Usual cause: GOOGLE_WORKSPACE_PROJECT_ID is set, or a client_secret.json was",
        "copied into the gws config dir — gws then sends that file's project.",
        "Fix on the host: unset GOOGLE_WORKSPACE_PROJECT_ID and make sure",
        `${d.configDir ?? "the gws config dir"} contains no client_secret.json.`,
      );
      break;
    case "insufficient_scope":
      lines.push(
        "The token is valid but was not granted the scope this API needs.",
        d.profile
          ? `Add the scope to ${d.profile.scopesFile}, then have the user re-login:`
          : "Add the scope to the login --scopes list, then have the user re-login:",
        "",
        ...loginCommand(d.profile),
      );
      break;
    case "unauthenticated":
      lines.push(
        "Authentication failed without a more specific reason. Run `gws_profile_current`",
        "to see the live token state before retrying.",
      );
      break;
  }

  if (d.healthyAlternatives?.length) {
    lines.push(
      "",
      "Other profiles on this machine currently hold a valid token:",
      ...d.healthyAlternatives.map((p) => `  - ${p.name}${p.account ? ` (${p.account})` : ""}`),
      "Ask the user whether to switch with `gws_profile_use`; do not switch identity on your own.",
    );
  }

  lines.push("--- end diagnosis ---");
  return lines.join("\n");
}
