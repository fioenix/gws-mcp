<!-- Keep this short. Detail belongs in the commit messages and code comments. -->

## Summary

<!-- One or two sentences: what changes and why. -->

## Type of change

- [ ] Bug fix (non-breaking, restores expected behaviour)
- [ ] Feature (non-breaking, adds capability)
- [ ] Breaking change (changes tool schema, env var, or CLI flag)
- [ ] Docs / chore only

## How was this verified?

<!-- Commands you ran. Paste relevant output if it helps. -->

```bash
npm run typecheck
npm run build
node test/unit-encode.mjs
node test/integration-batchupdate.mjs
node test/integration-regression.mjs
node test/smoke-skills.mjs
```

## Checklist

- [ ] Conventional Commit message (`feat:`, `fix:`, `chore:`…).
- [ ] `README.md` and `README.vi.md` updated if observable behaviour changed.
- [ ] `.env.example` updated if env vars changed.
- [ ] `CHANGELOG.md` entry under `[Unreleased]`.
- [ ] No secrets, tokens, or real document IDs in the diff or test output.
