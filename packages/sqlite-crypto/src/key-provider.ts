import { SqliteCryptoError } from "./errors";

/** Resolves SQLCipher passphrase(s) by opaque scope id (e.g. product-specific names in the app layer). */
export type SqlCipherKeyProvider = {
  getSqlCipherKey(scope: string): Promise<string>;
};

const MIN_SQLCIPHER_KEY_LEN = 16;

function readEnvRequired(name: string): string {
  const v = process.env[name]?.trim();
  if (v === undefined || v.length === 0) {
    throw new SqliteCryptoError(`${name} is required`);
  }
  return v;
}

/** Read SQLCipher keys from environment variables keyed by scope. */
export class EnvSqlCipherKeyProvider implements SqlCipherKeyProvider {
  constructor(
    private readonly envByScope: Readonly<Record<string, string>>,
    private readonly minKeyLen = MIN_SQLCIPHER_KEY_LEN,
  ) {}

  async getSqlCipherKey(scope: string): Promise<string> {
    const name = this.envByScope[scope];
    if (name === undefined) {
      throw new SqliteCryptoError(`unknown SQLCipher scope: ${scope}`);
    }
    const key = readEnvRequired(name);
    if (key.length < this.minKeyLen) {
      throw new SqliteCryptoError(`${name} must be at least ${this.minKeyLen} characters`);
    }
    return key;
  }
}

export async function assertSqlCipherKey(
  provider: SqlCipherKeyProvider,
  scope: string,
): Promise<void> {
  await provider.getSqlCipherKey(scope);
}
