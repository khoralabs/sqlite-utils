import { SqliteCryptoError } from "./errors";
import type { SqlCipherKeyProvider } from "./key-provider";

/** Default test passphrase for encrypted SQLite in unit tests (not for production). */
export const TEST_SQLCIPHER_KEY = "test-khora-sqlcipher-key!!";

/** Fixed scope → passphrase map for tests (not for production). */
export class TestSqlCipherKeyProvider implements SqlCipherKeyProvider {
  constructor(private readonly keysByScope: Readonly<Record<string, string>>) {}

  async getSqlCipherKey(scope: string): Promise<string> {
    const key = this.keysByScope[scope];
    if (key === undefined) {
      throw new SqliteCryptoError(`unknown SQLCipher scope: ${scope}`);
    }
    return key;
  }
}
