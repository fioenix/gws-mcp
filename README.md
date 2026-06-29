# gws-mcp

[![npm version](https://img.shields.io/npm/v/gws-mcp?logo=npm&color=cb3837)](https://www.npmjs.com/package/gws-mcp)
[![CI](https://github.com/fioenix/gws-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/fioenix/gws-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)](./package.json)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)

> 🌐 **Languages:** English (this file) · [Tiếng Việt](./README.vi.md)

A Model Context Protocol (MCP) server that wraps the locally-installed [`gws`](https://github.com/googleworkspace/cli) (Google Workspace CLI). It lets **Claude Desktop / Claude Code / Claude Cowork** — or any MCP-capable agent — use Google Workspace through the OAuth credentials stored in your host keyring, without exposing those credentials to the agent itself.

## Why this exists

`gws` keeps OAuth tokens in the user's keyring. Local agents like Claude Desktop *can* spawn `gws` directly via Bash, but then the model has to remember exact CLI syntax (`gws drive files list --params '{"pageSize":10}'`), has no schema introspection, and there is no audit trail. Sandboxed agents (Vercel Sandbox, Docker workers, remote dev containers) cannot reach the host keyring at all.

`gws-mcp` puts a clean, structured MCP interface in front of the CLI:

- **Schema-aware tools** (`gws_schema`, `gws_call`) so the model can look up real parameter shapes before invoking an API.
- **Skill guides** bundled in the package (`skills/gws-*/SKILL.md`) and served lazily via `gws_get_skill` (plus MCP resources and prompts) — task-focused how-tos that never touch user-scoped skill dirs.
- **Safety rails**: service allowlist, method denylist, NDJSON audit log, per-call timeout, output caps, identifier sanitisation.
- **Two transports**: stdio (default, for local clients) and Streamable HTTP with bearer-token auth (for true remote sandboxes).

## Table of contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start — Claude Desktop / Cowork](#quick-start--claude-desktop--cowork)
- [Quick start — Claude Code CLI](#quick-start--claude-code-cli)
- [Tools / Resources / Prompts](#tools--resources--prompts)
- [Skills layer](#skills-layer)
- [Environment variables](#environment-variables)
- [Security](#security)
- [Remote sandboxes (HTTP mode)](#remote-sandboxes-http-mode)
- [Smoke tests](#smoke-tests)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Requirements

- [`gws` CLI](https://github.com/googleworkspace/cli) installed and logged in.
  ```bash
  gws --version                                       # >= 0.22.x
  gws drive files list --params '{"pageSize":1}'      # must return JSON, no auth error
  ```
- Node.js **>= 20**.
- macOS or Linux. Windows is untested.

## Installation

### From npm (recommended)

```bash
npm install -g gws-mcp
```

Or run on demand without installing:

```bash
npx gws-mcp --help
```

### From source

```bash
git clone https://github.com/fioenix/gws-mcp.git
cd gws-mcp
npm install
npm run build
npm link        # exposes `gws-mcp` on your PATH
```

Verify:

```bash
which gws-mcp   # -> /opt/homebrew/bin/gws-mcp or similar
gws-mcp --help
```

## Quick start — Claude Desktop / Cowork

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS (or the equivalent on your platform):

```jsonc
{
  "mcpServers": {
    "gws": {
      "command": "gws-mcp",
      "args": ["stdio"],
      "env": {
        "GWS_MCP_ALLOWED_SERVICES": "drive,sheets,docs,calendar,gmail,tasks",
        "GWS_MCP_DENIED_METHODS": "drive.files.delete,gmail.users.messages.send",
        "GWS_MCP_AUDIT_LOG": "/Users/<you>/.cache/gws-mcp/audit.log"
      }
    }
  }
}
```

If you skipped `npm link`, use an absolute path instead:

```jsonc
{
  "mcpServers": {
    "gws": {
      "command": "node",
      "args": ["/absolute/path/to/gws-mcp/dist/index.js", "stdio"]
    }
  }
}
```

Restart Claude Desktop. The `gws` server should appear with six tools, eight resources, and six prompts (the four core tools plus the skills layer, which loads the six bundled `gws-*` guides by default).

## Quick start — Claude Code CLI

```bash
claude mcp add gws -- gws-mcp stdio
```

## Tools / Resources / Prompts

### Tools

| Tool | Purpose |
|---|---|
| `gws_list_services` | List the Google Workspace services this server is allowed to call. |
| `gws_help` | Run `gws <args…> --help` to discover resources and methods. |
| `gws_schema` | Return the JSON schema for `service.resource.method` — call this **before** `gws_call`. |
| `gws_call` | Generic dispatcher: `service`, `resource`, `method`, `params`, `json`, optional `dryRun`, `pageAll`, etc. |
| `gws_list_skills` | List skill guides bundled with this server (`skills/gws-*`). |
| `gws_get_skill` | Return the full markdown of a skill guide. |

Recommended discovery flow for an LLM:

```
gws_list_services
  → gws_help args:["drive"]                # discover resources
  → gws_schema target:"drive.files.list"   # read parameter shape
  → gws_call service:drive resource:files method:list params:{"pageSize":10}
```

**Safe debugging.** Add `dryRun:true` to `gws_call` to print the HTTP method, URL, and request body the server *would* send to Google, without actually sending it. Essential when authoring complex bodies for `docs.documents.batchUpdate`, `sheets.spreadsheets.batchUpdate`, `calendar.events.insert`, etc.

**JSON encoding note.** Pass `json` as an actual JSON value (object/array). Do **not** pre-stringify it — the server runs `JSON.stringify` exactly once. As a fallback the wrapper detects pre-stringified JSON strings and passes them through verbatim, so it stays safe if an LLM accidentally double-encodes.

### Resources

| URI | Content |
|---|---|
| `gws://services` | JSON list of currently allowed services. |
| `gws-skill://_index` | JSON index of all loaded skills (name, description, version, URI). |
| `gws-skill://<name>` | Raw `SKILL.md` for the named skill, e.g. `gws-skill://gws-drive`. |

### Prompts

Each loaded skill is exposed as an MCP prompt with the same name (`gws-drive`, `gws-sheets`, `gws-tasks`, …). Claude Desktop surfaces these in its prompt picker, so a user can attach a skill guide to the conversation with one click.

## Skills layer

This package bundles six task-focused skill guides under [`skills/`](skills/) —
`gws-sheets`, `gws-slides`, `gws-drive`, `gws-gmail`, `gws-calendar`, `gws-docs`. Each
one encodes the exact CLI shapes, `fields` masks, and shell-composition recipes for the
workflows that come up most (slide thumbnail export, `batchUpdate` from a file, A1 ranges
with non-ASCII tab names, RFC 822 + base64url for Gmail send, …) so the agent stops
re-discovering them with repeated `gws --help`.

The server reads these guides **in place** from its own bundled `skills/` directory — no
install step, and nothing is ever copied into user-scoped dirs like `~/.agents/skills`
(which other agents on the machine would auto-load). The guides stay private to this
server and lazy: an agent starts with just the `gws_*` tools, calls `gws_list_skills` to
see the short one-line index, and `gws_get_skill` to pull a full body **only when it needs
one** — so a skill body never enters the model's context until it's actually used.

To customise the set, edit the markdown under `skills/`, or point `GWS_MCP_SKILLS_DIR` at
your own directory of `gws-*/SKILL.md` guides.

Override behaviour:

| Env | Default | Effect |
|---|---|---|
| `GWS_MCP_SKILLS_DIR` | bundled `skills/` | Directory scanned for `gws-*` skill guides. Defaults to the guides bundled in the package; override to use your own. |
| `GWS_MCP_SKILLS_PREFIX` | `gws-` | Subdir prefix to mount. |
| `GWS_MCP_SKILLS_DISABLED` | unset | Set to `1` to turn the skills layer off entirely. |

## Environment variables

See [`.env.example`](./.env.example) for the full list. The essentials:

| Env | Default | Meaning |
|---|---|---|
| `GWS_MCP_GWS_BIN` | `gws` | Absolute path to the `gws` binary if not on `PATH`. |
| `GWS_MCP_CALL_TIMEOUT_MS` | `60000` | Hard timeout per `gws` invocation. |
| `GWS_MCP_MAX_OUTPUT_BYTES` | `1048576` | Cap on stdout returned to the agent; anything beyond is truncated. |
| `GWS_MCP_ALLOWED_SERVICES` | empty = all | Comma-separated allowlist, e.g. `drive,sheets,docs,calendar`. |
| `GWS_MCP_DENIED_METHODS` | empty | Comma-separated denylist, e.g. `gmail.users.messages.send,drive.files.delete`. |
| `GWS_MCP_AUDIT_LOG` | empty = stderr | NDJSON audit file. Records every tool call. |

HTTP-mode specifics: `GWS_MCP_HTTP_HOST`, `GWS_MCP_HTTP_PORT` (default `8765`), `GWS_MCP_HTTP_PATH` (default `/mcp`), `GWS_MCP_AUTH_TOKEN`, `GWS_MCP_HTTP_INSECURE`, `GWS_MCP_HTTP_CORS_ORIGINS`.

## Security

This server brokers full Google Workspace access for the account that ran `gws auth login` on your host. Treat it accordingly.

1. **Least privilege.** Use `GWS_MCP_ALLOWED_SERVICES` to expose only what an agent actually needs. For example, an analysis session might only need `drive,sheets`.
2. **Deny destructive methods.** A reasonable default: `GWS_MCP_DENIED_METHODS=drive.files.delete,gmail.users.messages.send,calendar.events.delete`.
3. **Keep an audit log.** Set `GWS_MCP_AUDIT_LOG=~/.cache/gws-mcp/audit.log` and you get an NDJSON record of every tool call — invaluable for forensics or compliance.
4. **Never expose the loopback HTTP endpoint with `GWS_MCP_HTTP_INSECURE=1` on a public tunnel.** Always require a bearer token in production.
5. **Treat the bearer token like a Google OAuth token.** Rotate it whenever you change sessions; revoke by restarting the server with a new token.
6. **Upload/output paths are host paths.** Sandboxed agents writing to a path before calling `upload:` won't find that path on the host filesystem; have the agent push bytes through the MCP body instead, or arrange a shared volume.

See [SECURITY.md](./SECURITY.md) for vulnerability disclosure.

## Remote sandboxes (HTTP mode)

Use the Streamable HTTP transport only when your MCP client cannot spawn a child process on the host — e.g. Vercel Sandbox, Docker workers, remote dev containers, or a hosted agent on a different machine.

```bash
export GWS_MCP_AUTH_TOKEN=$(openssl rand -hex 32)
gws-mcp http
# -> [gws-mcp] HTTP transport ready at http://127.0.0.1:8765/mcp
```

Expose the loopback endpoint through a tunnel:

| Tunnel | Command |
|---|---|
| **Cloudflare Tunnel** | `cloudflared tunnel --url http://127.0.0.1:8765` |
| **ngrok** | `ngrok http 8765` |
| **Tailscale** | `GWS_MCP_HTTP_HOST=0.0.0.0 gws-mcp http` and use your tailnet IP |

Client config:

```json
{
  "mcpServers": {
    "gws": {
      "url": "https://<tunnel>/mcp",
      "headers": { "Authorization": "Bearer <GWS_MCP_AUTH_TOKEN>" }
    }
  }
}
```

## Smoke tests

```bash
npm run build

# Stdio handshake + every layer (tools, resources, prompts, skills)
node test/smoke-skills.mjs

# HTTP transport, auth, session, tool call
GWS_MCP_AUTH_TOKEN=test gws-mcp http &
node test/smoke-http.mjs
kill %1

# Unit + integration tests
node test/unit-encode.mjs
node test/integration-batchupdate.mjs
node test/integration-regression.mjs
```

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Tool returns `exit code 2` | Host OAuth token expired. Run `gws auth login` again. |
| `exit code 3` | Invalid `params` or `json` shape. Call `gws_schema` first and compare. |
| `exit code 4` | `gws` could not fetch the discovery doc — check host network access. |
| Claude Desktop does not show the server | Wrong `command` path, or Desktop was not restarted. Check `~/Library/Logs/Claude/mcp*.log`. |
| Stdout is truncated | Raise `GWS_MCP_MAX_OUTPUT_BYTES`, or paginate with `pageAll:true` + a small `pageLimit`. |
| `Request body failed schema validation: $: Expected object` | Caller pre-stringified the body twice. Pass `json` as an actual object. Use `dryRun:true` to inspect what the server is about to send. |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). A few highlights:

- Conventional Commits (`feat:`, `fix:`, `chore:`…), atomic changes.
- `npm run typecheck`, `npm run build`, and all `test/*.mjs` scripts must pass before opening a PR.
- Keep changes surgical. Don't refactor adjacent code in the same commit.

Code of Conduct: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## License

[MIT](./LICENSE). This project is **not** an officially supported Google product.
