# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.1] - 2026-06-29

### Fixed
- MCP `serverInfo.version` is now read from `package.json` instead of a hardcoded string, so the handshake version can no longer drift from the published version (was reporting `0.2.0` in 0.3.0).

## [0.3.0] - 2026-06-29

### Added
- Six bundled, task-focused skill guides under `skills/` — `gws-sheets`, `gws-slides`, `gws-drive`, `gws-gmail`, `gws-calendar`, `gws-docs` — encoding real CLI shapes, `fields` masks, and shell-composition recipes (slide thumbnail export, `batchUpdate` from file, non-ASCII A1 ranges, RFC 822 + base64url Gmail send). Prioritised from telemetry of actual `gws` usage (slides + sheets dominate).

### Changed
- The skills layer now reads from the package's **bundled** `skills/` directory by default instead of `~/.agents/skills`. The guides are served lazily via `gws_get_skill` and are never copied into user-scoped skill dirs (which other agents on the machine would auto-load), keeping them private to this server and out of every session's context. Override with `GWS_MCP_SKILLS_DIR`.

## [0.2.0] - 2026-05-26

### Added
- `gws_list_skills` and `gws_get_skill` tools that read skill guides from `~/.agents/skills/gws-*/SKILL.md`.
- One MCP resource per skill at `gws-skill://<name>`, plus a `gws-skill://_index` summary.
- One MCP prompt per skill, so prompt-aware clients (Claude Desktop) can attach a guide with one click.
- `dryRun` flag on `gws_call` — exposes the `gws --dry-run` semantics so agents can inspect the request body/URL safely.
- Environment knobs `GWS_MCP_SKILLS_DIR`, `GWS_MCP_SKILLS_PREFIX`, `GWS_MCP_SKILLS_DISABLED`.

### Fixed
- **Critical:** `gws_call` no longer double-encodes the `--json` body. When an MCP client pre-stringifies the body (a common LLM behaviour when the JSON Schema lacks a `type` hint), the wrapper now detects the string and passes it through verbatim instead of calling `JSON.stringify` on it again. Resolves `Request body failed schema validation: $: Expected object` from Google for `docs.documents.batchUpdate`, `sheets.spreadsheets.batchUpdate`, `calendar.events.insert`, and any other method with a complex JSON body.
- `params` now accepts both `object` and pre-stringified JSON string for the same defensive reason.

### Tests
- `test/unit-encode.mjs` — locks the encoder behaviour (8 assertions).
- `test/integration-batchupdate.mjs` — end-to-end dry-run via stdio for both object and string inputs.
- `test/integration-regression.mjs` — 6 known-good argv shapes that must not regress.

## [0.1.0] - 2026-05-26

### Added
- Initial release.
- Tools: `gws_list_services`, `gws_help`, `gws_schema`, `gws_call`.
- Resource: `gws://services`.
- Transports: stdio (default) and Streamable HTTP with bearer-token auth, session reuse, CORS, `/healthz`.
- Safety: identifier sanitisation on every argv element, allowlist (`GWS_MCP_ALLOWED_SERVICES`), denylist (`GWS_MCP_DENIED_METHODS`), per-call timeout, stdout cap, NDJSON audit log.

[Unreleased]: https://github.com/fioenix/gws-mcp/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/fioenix/gws-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/fioenix/gws-mcp/releases/tag/v0.1.0
