import { afterEach, describe, expect, test } from "bun:test";
import { SqliteCryptoError } from "./errors";
import { assertSqlCipherKey, EnvSqlCipherKeyProvider } from "./key-provider";
import { TestSqlCipherKeyProvider, TEST_SQLCIPHER_KEY } from "./test-keys";

const ENV_KEYS = ["APP_DB_KEY", "OTHER_SCOPE_KEY"] as const;

afterEach(() => {
  for (const name of ENV_KEYS) {
    delete process.env[name];
  }
});

describe("EnvSqlCipherKeyProvider", () => {
  test("returns a key when env is set and long enough", async () => {
    process.env.APP_DB_KEY = TEST_SQLCIPHER_KEY;
    const provider = new EnvSqlCipherKeyProvider({ app: "APP_DB_KEY" });
    await expect(provider.getSqlCipherKey("app")).resolves.toBe(TEST_SQLCIPHER_KEY);
  });

  test("rejects unknown scope", async () => {
    const provider = new EnvSqlCipherKeyProvider({ app: "APP_DB_KEY" });
    await expect(provider.getSqlCipherKey("missing")).rejects.toThrow(SqliteCryptoError);
  });

  test("rejects missing or empty env var", async () => {
    const provider = new EnvSqlCipherKeyProvider({ app: "APP_DB_KEY" });
    await expect(provider.getSqlCipherKey("app")).rejects.toThrow(/APP_DB_KEY is required/);
  });

  test("rejects keys shorter than minKeyLen", async () => {
    process.env.APP_DB_KEY = "short";
    const provider = new EnvSqlCipherKeyProvider({ app: "APP_DB_KEY" }, 8);
    await expect(provider.getSqlCipherKey("app")).rejects.toThrow(/at least 8 characters/);
  });
});

describe("TestSqlCipherKeyProvider", () => {
  test("returns configured keys and rejects unknown scopes", async () => {
    const provider = new TestSqlCipherKeyProvider({ app: TEST_SQLCIPHER_KEY });
    await expect(provider.getSqlCipherKey("app")).resolves.toBe(TEST_SQLCIPHER_KEY);
    await expect(provider.getSqlCipherKey("other")).rejects.toThrow(SqliteCryptoError);
  });
});

describe("assertSqlCipherKey", () => {
  test("resolves when provider succeeds", async () => {
    const provider = new TestSqlCipherKeyProvider({ app: TEST_SQLCIPHER_KEY });
    await expect(assertSqlCipherKey(provider, "app")).resolves.toBeUndefined();
  });

  test("propagates provider errors", async () => {
    const provider = new TestSqlCipherKeyProvider({});
    await expect(assertSqlCipherKey(provider, "app")).rejects.toThrow(SqliteCryptoError);
  });
});
