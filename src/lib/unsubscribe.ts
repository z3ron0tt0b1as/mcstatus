/**
 * Signed, unguessable unsubscribe tokens for one-click email opt-out.
 * Uses the Web Crypto API (available in both Node and Cloudflare Workers) so
 * the same code works in dev and on the edge. Server-only.
 */

const SECRET =
  process.env.UNSUBSCRIBE_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "imd-unsubscribe-dev-secret";

const encoder = new TextEncoder();
let keyPromise: Promise<CryptoKey> | null = null;

function getKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = crypto.subtle.importKey(
      "raw",
      encoder.encode(SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  }
  return keyPromise;
}

function toBase64Url(bytes: ArrayBuffer): string {
  const b = new Uint8Array(bytes);
  let str = "";
  for (let i = 0; i < b.length; i++) str += String.fromCharCode(b[i]!);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Deterministic token for an email address. */
export async function makeUnsubToken(email: string): Promise<string> {
  const key = await getKey();
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(email.trim().toLowerCase()),
  );
  return toBase64Url(sig);
}

/** Constant-time-ish verification of a token against an email. */
export async function verifyUnsubToken(
  email: string,
  token: string,
): Promise<boolean> {
  if (!token) return false;
  const expected = await makeUnsubToken(email);
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return diff === 0;
}
