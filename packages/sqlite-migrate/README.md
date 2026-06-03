# @khoralabs/sqlite-migrate

SQLite migration utilities for Bun.

## Install

```bash
npm install @khoralabs/sqlite-migrate
```

## Usage

Import from `@khoralabs/sqlite-migrate`. See `src/` for exported APIs.

## Development

From the repository root:

```bash
bun install
bun test --cwd packages/sqlite-migrate
```

## Publishing

Use the **release @khoralabs/sqlite-migrate** GitHub Actions workflow. Set **version** (e.g. `0.1.0`); enable **dry run** first to validate without publishing.
