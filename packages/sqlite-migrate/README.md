# @khoralabs/sqlite-migrate

Semver-ordered SQLite migrations for [Bun `bun:sqlite`](https://bun.sh/docs/api/sqlite).

Define migrations as `(from, to, name)` steps, run them in order, track what applied, and mirror the latest version in `PRAGMA user_version`. Each migration runs in its own transaction; a failure rolls back and stops the run.

## Install

```bash
bun add @khoralabs/sqlite-migrate
```

## Usage

```ts
import { Database } from "bun:sqlite";
import { createMigrationRunner, type Migration } from "@khoralabs/sqlite-migrate";

const migrations: Migration[] = [
  {
    from: "0.1.0",
    to: "0.2.0",
    name: "add-users",
    up(db) {
      db.run("CREATE TABLE users (id TEXT PRIMARY KEY)");
    },
  },
  {
    from: "0.2.0",
    to: "0.3.0",
    name: "add-email",
    up(db) {
      db.run("ALTER TABLE users ADD COLUMN email TEXT");
    },
  },
];

const db = new Database("app.db");
const runner = createMigrationRunner();

const result = await runner.run(db, migrations);
// result.applied   — migrations run this time
// result.skipped   — already recorded
// result.finalVersion — highest `to` semver after the run
```

Use `runner.runSync` when every `up()` is synchronous (the usual case for `bun:sqlite`).

### How it works

- **Tracking table** — defaults to `_schema_migrations` with primary key `(from_version, to_version, name)`. Override with `createMigrationRunner({ tableName: "my_migrations" })`.
- **Ordering** — migrations sort by `from`, then `to`, then `name`. Duplicate keys are deduped.
- **Idempotency** — re-running skips migrations already in the tracking table.
- **`user_version`** — after each applied migration, `PRAGMA user_version` is set from the highest `to` semver (`major * 1_000_000 + minor * 1_000 + patch`, each component capped at 999).

### Semver helpers

Also exports `parseSemver`, `compareSemver`, and `encodeSemverForUserVersion` for custom version logic. Only `MAJOR.MINOR.PATCH` is supported (no pre-release tags).

## Development

From the [sqlite-utils](https://github.com/khoralabs/sqlite-utils) monorepo root:

```bash
bun install
bun test --cwd packages/sqlite-migrate
```

Licensed under [MIT](LICENSE).
