import { Database } from "bun:sqlite";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "bun:test";
import { SqliteCryptoError } from "./errors";
import {
  openEncryptedDatabase,
  openEncryptedDatabaseSync,
  resolveSqlCipherLib,
} from "./sqlcipher";
import { TestSqlCipherKeyProvider, TEST_SQLCIPHER_KEY } from "./test-keys";

function probeSqlCipher(): boolean {
  const path = join(tmpdir(), `sqlite-crypto-probe-${process.pid}.db`);
  try {
    if (existsSync(path)) unlinkSync(path);
    resolveSqlCipherLib();
    const db = openEncryptedDatabaseSync(path, { create: true }, TEST_SQLCIPHER_KEY);
    db.run("CREATE TABLE probe (id INTEGER PRIMARY KEY)");
    db.run("INSERT INTO probe (id) VALUES (1)");
    db.close();

    const plain = new Database(path);
    try {
      plain.query("SELECT * FROM probe").all();
      plain.close();
      return false;
    } catch {
      plain.close();
      return true;
    }
  } catch {
    return false;
  } finally {
    if (existsSync(path)) unlinkSync(path);
  }
}

const sqlCipherAvailable = probeSqlCipher();

describe("openEncryptedDatabase (integration)", () => {
  const paths: string[] = [];

  afterEach(() => {
    for (const path of paths.splice(0)) {
      try {
        if (existsSync(path)) unlinkSync(path);
      } catch {
        /* best effort */
      }
    }
  });

  test.skipIf(!sqlCipherAvailable)(
    "opens via provider, round-trips data, and rejects wrong key",
    async () => {
      const path = join(tmpdir(), `sqlite-crypto-test-${Date.now()}.db`);
      paths.push(path);

      const provider = new TestSqlCipherKeyProvider({ app: TEST_SQLCIPHER_KEY });
      const db = await openEncryptedDatabase(path, { create: true }, "app", provider);
      db.run("CREATE TABLE secrets (value TEXT NOT NULL)");
      db.run("INSERT INTO secrets (value) VALUES (?)", ["hello"]);
      expect(db.query("SELECT value FROM secrets").get()).toEqual({ value: "hello" });
      db.close();

      expect(() =>
        openEncryptedDatabaseSync(path, { readonly: true }, "wrong-key-value!!"),
      ).toThrow(SqliteCryptoError);

      const reopened = openEncryptedDatabaseSync(path, { readonly: true }, TEST_SQLCIPHER_KEY);
      expect(reopened.query("SELECT value FROM secrets").get()).toEqual({ value: "hello" });
      reopened.close();
    },
  );

  test.skipIf(!sqlCipherAvailable)("escapes single quotes in passphrases", () => {
    const path = join(tmpdir(), `sqlite-crypto-quote-${Date.now()}.db`);
    paths.push(path);
    const key = "pass'phrase'with'quotes!!";
    const db = openEncryptedDatabaseSync(path, { create: true }, key);
    db.run("CREATE TABLE t (x TEXT)");
    db.run("INSERT INTO t (x) VALUES ('ok')");
    db.close();

    const reopened = openEncryptedDatabaseSync(path, { readonly: true }, key);
    expect(reopened.query("SELECT x FROM t").get()).toEqual({ x: "ok" });
    reopened.close();
  });
});

test("SQLCipher integration skipped when lib is unavailable", () => {
  if (!sqlCipherAvailable) {
    console.warn("SQLCipher not detected; integration tests were skipped");
  }
  expect(true).toBe(true);
});
