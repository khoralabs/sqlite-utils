# @khoralabs/sqlite-crypto

Open SQLCipher-encrypted SQLite databases with [Bun `bun:sqlite`](https://bun.sh/docs/api/sqlite).

Bun ships a standard SQLite build. This package points Bun at a SQLCipher-enabled `libsqlite3`, applies a passphrase, and verifies the database opens before returning a `Database` handle.

## Prerequisites

Install SQLCipher on the host (e.g. `brew install sqlcipher` on macOS). If auto-detection fails, set:

```bash
export SQLCIPHER_CUSTOM_LIB=/path/to/libsqlcipher.dylib   # macOS
# or libsqlcipher.so on Linux
```

Call `resolveSqlCipherLib()` once before opening encrypted databases (the open helpers do this automatically).

## Install

```bash
bun add @khoralabs/sqlite-crypto
```

## Usage

### Direct passphrase

```ts
import { openEncryptedDatabaseSync } from "@khoralabs/sqlite-crypto";

const db = openEncryptedDatabaseSync("secrets.db", { create: true }, process.env.APP_DB_KEY!);
db.run("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)");
```

### Key provider (recommended for apps)

```ts
import {
  EnvSqlCipherKeyProvider,
  openEncryptedDatabase,
} from "@khoralabs/sqlite-crypto";

const provider = new EnvSqlCipherKeyProvider({
  app: "APP_SQLCIPHER_KEY",
  analytics: "ANALYTICS_SQLCIPHER_KEY",
});

const db = await openEncryptedDatabase("app.db", { create: true }, "app", provider);
```

`SqlCipherKeyProvider` resolves passphrases by opaque scope id. `EnvSqlCipherKeyProvider` maps scopes to environment variable names and enforces a minimum key length (16 characters by default). Use `assertSqlCipherKey(provider, scope)` at startup to fail fast on missing keys.

### Errors

Failures throw `SqliteCryptoError` (missing env var, unknown scope, key too short, or SQLCipher library / passphrase mismatch).

## Development

From the [sqlite-utils](https://github.com/khoralabs/sqlite-utils) monorepo root:

```bash
bun install
bun test --cwd packages/sqlite-crypto
```

Integration tests require SQLCipher installed locally; they skip automatically when unavailable.

Licensed under [MIT](LICENSE).
