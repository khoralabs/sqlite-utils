# @khoralabs/sqlite-utils

Monorepo of SQLite utilities for Bun.

Licensed under [MIT](LICENSE).

## Packages

| Package | Description |
| --- | --- |
| [@khoralabs/sqlite-migrate](./packages/sqlite-migrate) | SQLite migration runner |
| [@khoralabs/sqlite-crypto](./packages/sqlite-crypto) | SQLCipher database helpers |

## Development

```bash
bun install
```

Run tests for a package:

```bash
bun test --cwd packages/sqlite-migrate
bun test --cwd packages/sqlite-crypto
```

## Publishing

Each package has a manual **release** workflow. Set **version**, run with **dry run** first, then publish for real. Releases stage under `release/<name>/` outside workspaces; the **verify npm publish access** step dry-runs before the real publish.
