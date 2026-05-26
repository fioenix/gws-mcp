# Contributing to gws-mcp

Thanks for your interest. This project is small on purpose — a thin, auditable bridge between an MCP client and the `gws` CLI. We keep it small by being deliberate about what we accept.

## Ground rules

- **Be excellent to one another.** See the [Code of Conduct](./CODE_OF_CONDUCT.md).
- **Surgical changes only.** Touch what the change requires; don't refactor or re-style adjacent code in the same PR.
- **Behaviour is contract.** If you change observable behaviour (tool schemas, env vars, CLI flags, error messages), update `README.md`, `README.vi.md`, `.env.example`, and `CHANGELOG.md` in the same PR.

## Development setup

```bash
git clone https://github.com/fioenix/gws-mcp.git
cd gws-mcp
npm install
npm run build
npm link
```

You also need the host `gws` CLI installed and authenticated:

```bash
gws --version
gws drive files list --params '{"pageSize":1}'   # smoke test auth
```

## Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run the server in stdio mode straight from `src/` via `tsx` (no build step). |
| `npm run dev:http` | Same, but HTTP transport. |
| `npm run build` | Compile TypeScript to `dist/`. |
| `npm run typecheck` | `tsc --noEmit` — must pass before merge. |
| `npm run clean` | Remove `dist/`. |

## Tests

We use plain `node` scripts under `test/` — no test framework needed. **All of these must pass** before opening a PR:

```bash
npm run build
node test/unit-encode.mjs
node test/integration-batchupdate.mjs
node test/integration-regression.mjs
node test/smoke-skills.mjs

# HTTP path
GWS_MCP_AUTH_TOKEN=test gws-mcp http &
node test/smoke-http.mjs
kill %1
```

CI runs the same set on Node 20 and Node 22.

## Adding a tool / resource / prompt

1. Add it to `src/server.ts`. Use `z.<type>()` for input validation — avoid `z.unknown()` unless the value is genuinely free-form; downstream clients use the JSON Schema to decide how to serialise arguments.
2. Mirror the audit-log call shape used by existing tools.
3. Add an entry to the appropriate table in both README files.
4. If the tool dispatches to `gws`, prefer composing on top of `GwsClient` rather than re-implementing shell-out.

## Adding an env var

1. Read it inside `loadConfig` in `src/config.ts`.
2. Document it in `.env.example` *and* in both README files.

## Commit style

[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), short imperative subject:

```
feat(skills): mount ~/.agents/skills as MCP resources and prompts
fix(gws_call): pass --json body through verbatim when caller pre-stringified
chore(deps): bump @modelcontextprotocol/sdk to 1.30.0
```

Atomic commits — one logical change per commit. If your branch ends up with many small commits, that is fine; we squash on merge only when the branch is messy.

## Pull request checklist

- [ ] `npm run typecheck` passes.
- [ ] `npm run build` succeeds.
- [ ] All tests in `test/` pass locally.
- [ ] Public API change → both README files and `CHANGELOG.md` updated.
- [ ] New env var → `.env.example` updated.
- [ ] Security-relevant change → noted in PR description.

## Releasing (maintainers)

1. Update `CHANGELOG.md`: move `[Unreleased]` entries under the new version with today's date.
2. Bump `version` in `package.json`.
3. `git tag v<version> -m "Release v<version>"` and push tag.
4. (Optional) Publish to npm: `npm publish --access public`.
