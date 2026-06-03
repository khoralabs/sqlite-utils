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

Each package has a manual GitHub Actions workflow. Run with **dry run** enabled first to inspect the tarball; disable dry run when ready to publish to npm.
