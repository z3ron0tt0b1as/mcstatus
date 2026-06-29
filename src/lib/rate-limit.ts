/**
 * Tiny in-memory sliding-window rate limiter for server route handlers.
 * Keyed by an arbitrary string (typically client IP). Process-local — good
 * enough for abuse prevention on a single instance; swap for a shared store
 * (e.g. a Supabase table or Redis) if you run multiple instances.
 */

const store = new Map<string, number[]>();
let lastCleanup = 0;

/** Check a window without recording a hit. */
export function check(
  key: string,
  windowMs: number,
  max: number,
): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const hits = (store.get(key) ?? []).filter((t) => now - t < windowMs);
  store.set(key, hits);
  if (hits.length >= max) {
    return { ok: false, retryAfterMs: Math.max(0, windowMs - (now - hits[0])) };
  }
  return { ok: true, retryAfterMs: 0 };
}

/** Record a hit against a key. */
export function record(key: string): void {
  const hits = store.get(key) ?? [];
  hits.push(Date.now());
  store.set(key, hits);
  cleanup();
}

/** Best-effort eviction of stale keys so the map doesn't grow unbounded. */
function cleanup(maxAgeMs = 600_000): void {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, hits] of store) {
    const kept = hits.filter((t) => now - t < maxAgeMs);
    if (kept.length) store.set(key, kept);
    else store.delete(key);
  }
}

/** Derive a best-effort client IP from request headers. */
export function clientKey(request: Request): string {
  const h = request.headers;
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return (
    h.get("cf-connecting-ip") ||
    h.get("x-real-ip") ||
    h.get("fly-client-ip") ||
    "anon"
  );
}

/**
 * Coarse network bucket for the client IP: an IPv4 /24 or an IPv6 /48. Used as
 * a loose flood ceiling — toggling a single VPN exit IP within a provider's
 * pool tends to stay inside the same bucket, so it can't trivially reset a
 * per-IP cooldown.
 */
export function subnetKey(request: Request): string {
  const ip = clientKey(request);
  if (ip === "anon") return "anon";
  if (ip.includes(":")) {
    // IPv6 — keep the first three hextets (~/48).
    return ip.split(":").slice(0, 3).join(":") + "::/48";
  }
  // IPv4 — keep the first three octets (/24).
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0/24` : ip;
}

const CLIENT_COOKIE = "imd_cid";

/**
 * A stable, http-only browser identity. Survives cookie *clears* only if the
 * browser keeps it, so it's paired with IP/subnet gates: a determined abuser
 * would have to rotate IP *and* drop this cookie on every single report.
 * Returns the id plus a Set-Cookie string to attach when the id was minted.
 */
export function getClientId(request: Request): {
  id: string;
  setCookie?: string;
} {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${CLIENT_COOKIE}=([^;]+)`));
  if (match) return { id: match[1]! };

  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  // 1 year, http-only so page scripts can't read/clear it from JS.
  const setCookie = `${CLIENT_COOKIE}=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`;
  return { id, setCookie };
}
