# Security Policy

## Supported versions

`gws-mcp` is pre-1.0. Only the latest minor release receives security fixes.

| Version | Supported |
|---|---|
| 0.2.x | ✅ |
| 0.1.x | ❌ — please upgrade |

## Reporting a vulnerability

**Do not open a public issue** for security problems. Instead, use GitHub's private vulnerability reporting:

1. Go to <https://github.com/fioenix/gws-mcp/security/advisories/new>.
2. Describe the issue: what an attacker can do, the affected version, and a minimal reproduction.

We will acknowledge within **72 hours** and aim to ship a fix or mitigation within **14 days** depending on severity.

If GitHub Security Advisories are not available to you, email the maintainer at the address listed on the GitHub profile.

## Scope

In scope:

- Authentication / authorisation bypasses on the HTTP transport.
- Command injection through MCP arguments that bypass identifier validation in `src/gws.ts`.
- Path traversal in `upload`, `output`, or `GWS_MCP_AUDIT_LOG` handling.
- Resource exhaustion (timeouts, output caps, audit log file size, etc.) below the documented thresholds.
- Leakage of `gws` OAuth tokens or credentials through any code path of this project.

Out of scope:

- Vulnerabilities in upstream `gws` (report to <https://github.com/googleworkspace/cli>).
- Vulnerabilities in Node.js or third-party dependencies — please report to their maintainers; we will pick up patched versions via Dependabot.
- A user choosing to set `GWS_MCP_HTTP_INSECURE=1` on a public tunnel. That configuration is documented as unsafe.

## Defense-in-depth checklist for operators

- Run with `GWS_MCP_ALLOWED_SERVICES` and `GWS_MCP_DENIED_METHODS` set as tightly as possible.
- Bind HTTP transport to `127.0.0.1` unless you are behind a trusted tunnel or VPN.
- Always require a bearer token (`GWS_MCP_AUTH_TOKEN`) on HTTP mode; never enable `GWS_MCP_HTTP_INSECURE` on a publicly reachable endpoint.
- Keep `GWS_MCP_AUDIT_LOG` enabled so unusual activity is recoverable.
- Rotate the bearer token whenever you change agent sessions.
