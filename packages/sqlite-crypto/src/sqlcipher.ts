import { Database, type DatabaseOptions } from "bun:sqlite";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SqliteCryptoError } from "./errors";
import type { SqlCipherKeyProvider } from "./key-provider";

export const SQLCIPHER_CUSTOM_LIB_ENV = "SQLCIPHER_CUSTOM_LIB";

let didConfigureSqlCipherLib = false;

function tryHomebrewSqlCipherPath(): string | undefined {
  if (process.platform !== "darwin") return undefined;
  try {
    const prefix = execFileSync("brew", ["--prefix", "sqlcipher"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (prefix.length === 0) return undefined;
    const p = join(prefix, "lib", "libsqlcipher.dylib");
    return existsSync(p) ? p : undefined;
  } catch {
    return undefined;
  }
}

/** Point Bun at a SQLCipher-enabled libsqlite3 before opening encrypted databases. */
export function resolveSqlCipherLib(): void {
  if (didConfigureSqlCipherLib) return;
  didConfigureSqlCipherLib = true;

  const fromEnv = process.env[SQLCIPHER_CUSTOM_LIB_ENV]?.trim();
  const candidates: string[] = [];
  if (fromEnv) candidates.push(fromEnv);

  const brew = tryHomebrewSqlCipherPath();
  if (brew !== undefined) candidates.push(brew);

  if (process.platform === "darwin") {
    candidates.push(
      "/opt/homebrew/opt/sqlcipher/lib/libsqlcipher.dylib",
      "/usr/local/opt/sqlcipher/lib/libsqlcipher.dylib",
    );
  }

  if (process.platform === "linux") {
    candidates.push(
      "/usr/lib/x86_64-linux-gnu/libsqlcipher.so.0",
      "/usr/lib/x86_64-linux-gnu/libsqlcipher.so",
      "/usr/lib/aarch64-linux-gnu/libsqlcipher.so.0",
    );
  }

  for (const p of candidates) {
    if (p.length > 0 && existsSync(p)) {
      Database.setCustomSQLite(p);
      return;
    }
  }
}

function escapeSqlCipherKey(key: string): string {
  return key.replace(/'/g, "''");
}

function applySqlCipherKey(db: Database, key: string): void {
  resolveSqlCipherLib();
  try {
    db.run(`PRAGMA key = '${escapeSqlCipherKey(key)}';`);
    db.run("SELECT count(*) FROM sqlite_master;");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new SqliteCryptoError(
      `SQLCipher key application failed. Install SQLCipher and set ${SQLCIPHER_CUSTOM_LIB_ENV}. Original: ${msg}`,
    );
  }
}

export type OpenEncryptedDatabaseOptions = DatabaseOptions;

/**
 * Open a SQLCipher-protected SQLite database.
 */
export function openEncryptedDatabaseSync(
  path: string,
  options: OpenEncryptedDatabaseOptions,
  key: string,
): Database {
  resolveSqlCipherLib();
  const db = new Database(path, options);
  applySqlCipherKey(db, key);
  return db;
}

/**
 * Open a SQLCipher database using keys from `provider`.
 */
export async function openEncryptedDatabase(
  path: string,
  options: OpenEncryptedDatabaseOptions,
  scope: string,
  provider: SqlCipherKeyProvider,
): Promise<Database> {
  const key = await provider.getSqlCipherKey(scope);
  return openEncryptedDatabaseSync(path, options, key);
}
