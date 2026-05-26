/**
 * Web Crypto helpers, identical surface to the worker's crypto.ts.
 * Node 19+ exposes the same `crypto` global, so this file is a copy of
 * governor/server/worker/src/crypto.ts with no logic changes.
 */

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

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
