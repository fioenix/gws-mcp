---
name: gws-fixture-drive
description: "Fixture skill for CI: simulates a Google Drive guide."
metadata:
  version: 0.0.1-fixture
  openclaw:
    category: "productivity"
    requires:
      bins:
        - gws
    cliHelp: "gws drive --help"
---

# gws-fixture-drive

This is a deterministic fixture used by `test/smoke-skills.mjs` to exercise the
skills layer without depending on the host's `~/.agents/skills` directory.

## Example

```bash
gws drive files list --params '{"pageSize":10}'
```
