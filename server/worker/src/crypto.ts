/**
 * Web Crypto helpers. Workers do not ship node:crypto by default; everything
 * here uses the standard `crypto` global available in the Workers runtime.
 */

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate an opaque token: `gv_` + 40 hex chars of randomness (160 bits).
 * The `gv_` prefix is searchable in logs/git so leaked tokens are easy to
 * grep for and revoke.
 */
export function mintTokenString(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `gv_${hex}`;
}

export function newUuid(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
