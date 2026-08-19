---
name: gws-auth
description: "Diagnose gws authentication: which credential mode the host runs, what invalid_rapt / invalid_grant / 403 quota-project / No OAuth client configured actually mean, and which commands are safe to run versus which ones corrupt the setup."
metadata:
  version: 0.22.5
  openclaw:
    category: productivity
    requires:
      bins:
        - gws
    cliHelp: "gws auth --help"
---

# gws-auth

Read this before touching credentials. `gws` supports two credential modes, and the
fix for an auth error in one mode breaks the other.

Start by finding out which mode you are in:

```bash
gws auth status
```

| `credential_source` / `storage` | Mode |
|---|---|
| `client_secret.json` / `encrypted` | **Own store** — gws holds its own OAuth tokens |
| anything, with `storage: plaintext` and `GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE` set | **ADC** — gws reads a gcloud credentials file |

```bash
env | grep -E 'GOOGLE_WORKSPACE_CLI_(CREDENTIALS_FILE|CONFIG_DIR)|GWS_PROFILE'
```

`gws auth status` is always safe to run. It never writes credentials.

## Never run these when the host is in ADC mode

`gws auth login` and `gws auth setup` belong to the own-store mode. In ADC mode they do
not help and actively damage the setup:

- `gws auth login` asks for an OAuth client that intentionally is not there, then reports
  `No OAuth client configured`. The credentials it would write are not the ones gws reads.
- `gws auth setup` rewrites the OAuth client config. It has been observed to write the
  *filename* into `client_id` (producing `client_secret_1234-abc.apps.googleusercontent.com`),
  which fails later with `invalid_client` / `The OAuth client was not found`.

## Never move client_secret.json into the config dir

In ADC mode `client_secret.json` lives **outside** `GOOGLE_WORKSPACE_CLI_CONFIG_DIR`, and
that is deliberate. If gws finds it inside the config dir, it sends that file's `project_id`
as the quota project, and every call fails:

```
Caller does not have required permission to use project <id>.
Grant the caller the roles/serviceusage.serviceUsageConsumer role...
```

The account only needs `serviceusage.services.use` when a quota project is sent — so the fix
is to stop sending one, not to grant IAM. Copying or symlinking the file "to where gws is
looking" turns a working setup into a 403 on every request.

That file has exactly one job: the `--client-id-file` argument when logging in.

## Error → meaning → who fixes it

| Error | Meaning | Action |
|---|---|---|
| `invalid_rapt`, `reauth related error` | Workspace reauth policy expired the session | Needs a browser — **ask the user**, you cannot do it |
| `invalid_grant: Token has been expired or revoked` | Refresh token dead (revoked, or app in Testing >7 days) | Ask the user to log in again |
| `The OAuth client was deleted` / `was not found`, `invalid_client` | Client gone from the project, or `client_id` corrupted | Check `client_id` in `client_secret.json`; restore the client in Cloud Console |
| `403 ... serviceusage.serviceUsageConsumer` | A quota project is being sent | Remove `client_secret.json` from the config dir; unset `GOOGLE_WORKSPACE_PROJECT_ID` |
| `403 insufficient authentication scopes` | Token lacks the scope for that API | Log in again with the scope added |
| `No OAuth client configured` | Own-store command run in ADC mode | Do not "fix" it; see above |
| `This app is blocked` (browser) | gcloud's shared OAuth client cannot request Workspace scopes | Log in with your own Desktop client via `--client-id-file` |

## Refreshing ADC credentials

Only the user can do this — it opens a browser. Give them the command, do not attempt it:

```bash
CLOUDSDK_CONFIG=<profile>/gcloud gcloud auth application-default login \
  --client-id-file=<profile>/client_secret.json \
  --scopes=openid,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/drive,https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/documents,https://www.googleapis.com/auth/presentations,https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/gmail.modify
```

Scopes must cover every API they intend to call; a missing one surfaces later as 403
insufficient scopes, not as a login failure. `--client-id-file` is required because Google
blocks gcloud's shared client from requesting Workspace scopes.

## Several accounts on one host

`GWS_PROFILE=work` expands to the two vars, so a host config names an account instead of
repeating absolute paths:

```
<root>/<profile>/gcloud/application_default_credentials.json   -> credentials
<root>/<profile>/gws                                           -> config dir
<root>/<profile>/client_secret.json                            -> only for --client-id-file
```

Root defaults to `~/.config/gcloud/profiles`. An unknown profile is a startup error, never a
silent fallback — that would run the agent as whatever identity happens to sit in the default
config dir.

## Gotchas

- Each profile needs its **own** config dir. gws caches tokens there; two profiles sharing one
  directory will read each other's identity and you will confidently report the wrong account.
- `GOOGLE_APPLICATION_CREDENTIALS` outranks both `CLOUDSDK_CONFIG` and the ADC file gws was
  pointed at. A stale value makes every profile switch look like it silently failed.
- Mixing keyring backends across profiles destroys credentials: gws cannot decrypt a store
  written under a different backend, so it deletes it and starts a new one. Keep the backend
  identical everywhere, or stay in ADC mode where there is nothing to encrypt.
- A `--dry-run` call still needs a valid token, so auth errors surface even when no request
  would be sent.
