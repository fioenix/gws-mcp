# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Published on npm as [`gws-mcp`](https://www.npmjs.com/package/gws-mcp) — installable via `npm install -g gws-mcp` or `npx gws-mcp`.

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
