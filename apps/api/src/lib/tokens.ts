export function createToken(): string {
  return (
    crypto.randomUUID().replaceAll("-", "") +
    crypto.randomUUID().replaceAll("-", "")
  );
}

/** Fast SHA-256 hex for high-entropy bearer secrets. Not a password hash. */
export function hashToken(value: string): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex");
}
