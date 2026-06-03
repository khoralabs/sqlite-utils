# @khoralabs/sqlite-utils

Monorepo of SQLite utilities for Bun.

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

Each package has a manual **release** workflow in GitHub Actions. Set the **version** input (e.g. `0.1.0`), optionally enable **dry run** to validate without publishing, then run again with dry run off to publish and tag the repo (`sqlite-migrate-v0.1.0`, etc.).
