export class SqliteCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SqliteCryptoError";
  }
}
