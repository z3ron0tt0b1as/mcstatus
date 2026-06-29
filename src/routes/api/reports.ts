import { createFileRoute } from "@tanstack/react-router";
import { createReport, listReports, supabaseConfigured } from "@/lib/supabase";
import { CATEGORY_IDS } from "@/lib/reports";
import {
  check,
  clientKey,
  getClientId,
  record,
  subnetKey,
} from "@/lib/rate-limit";
import { emitReport } from "@/lib/events";

// One report per identity per 5 minutes. See buildGates() for how clearing
// cookies or hopping VPNs is defended against.
const COOLDOWN_MS = 5 * 60_000;

/**
 * Layered anti-spam gates. Each report must clear ALL of them. We key the
 * cooldown on three independent identities so no single reset bypasses it:
 *   - IP            (clearing cookies keeps the IP — still throttled)
 *   - client cookie (toggling a VPN keeps the http-only cookie — still throttled)
 *   - /24 subnet    (loose ceiling that absorbs VPN exit-pool hopping)
 * Plus rolling hour/day caps so even slow, persistent rotation is bounded.
 */
function buildGates(
  ids: { ip: string; cid: string; subnet: string },
  category: string,
) {
  const { ip, cid, subnet } = ids;
  return [
    { key: `rep:gap:ip:${ip}`, windowMs: COOLDOWN_MS, max: 1 },
    { key: `rep:gap:cid:${cid}`, windowMs: COOLDOWN_MS, max: 1 },
    { key: `rep:cat:ip:${ip}:${category}`, windowMs: COOLDOWN_MS, max: 1 },
    { key: `rep:cat:cid:${cid}:${category}`, windowMs: COOLDOWN_MS, max: 1 },
    { key: `rep:hour:ip:${ip}`, windowMs: 3_600_000, max: 12 },
    { key: `rep:hour:cid:${cid}`, windowMs: 3_600_000, max: 12 },
    { key: `rep:day:ip:${ip}`, windowMs: 86_400_000, max: 80 },
    // Loose per-/24 ceiling: high enough not to punish big NATs during a real
    // outage, low enough to blunt scripted exit-pool hopping.
    { key: `rep:net:${subnet}`, windowMs: COOLDOWN_MS, max: 20 },
  ];
}

export const Route = createFileRoute("/api/reports")({
  server: {
    handlers: {
      // Recent raw reports (last 30 days) for the community chart.
      GET: async () => {
        if (!supabaseConfigured()) {
          return Response.json(
            { configured: false, reports: [] },
            { headers: { "Cache-Control": "no-store" } },
          );
        }
        try {
          const since = new Date(
            Date.now() - 31 * 24 * 60 * 60 * 1000,
          ).toISOString();
          const reports = await listReports(since);
          return Response.json(
            { configured: true, reports },
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch (err) {
          console.error("GET /api/reports failed", err);
          return Response.json({ configured: true, reports: [], error: true });
        }
      },

      // Submit a community report.
      POST: async ({ request }) => {
        let category = "other";
        let serviceId: string | null = null;
        try {
          const body = (await request.json()) as {
            category?: string;
            serviceId?: string;
          };
          if (body.category && CATEGORY_IDS.includes(body.category))
            category = body.category;
          if (typeof body.serviceId === "string") serviceId = body.serviceId;
        } catch {
          /* ignore malformed body, default to "other" */
        }

        // --- Rate limit: prevent report spam --------------------------------
        const client = getClientId(request);
        const ids = {
          ip: clientKey(request),
          subnet: subnetKey(request),
          cid: client.id,
        };
        const { setCookie } = client;
        // Attach the minted client-cookie (if any) to every response so the
        // identity persists for the next attempt.
        const withCookie = (init: ResponseInit = {}): ResponseInit =>
          setCookie
            ? {
                ...init,
                headers: { ...(init.headers ?? {}), "Set-Cookie": setCookie },
              }
            : init;

        const gates = buildGates(ids, category);
        for (const g of gates) {
          const res = check(g.key, g.windowMs, g.max);
          if (!res.ok) {
            const retryAfter = Math.ceil(res.retryAfterMs / 1000);
            return Response.json(
              {
                ok: false,
                error: "rate_limited",
                retryAfterMs: res.retryAfterMs,
              },
              withCookie({
                status: 429,
                headers: { "Retry-After": String(retryAfter) },
              }),
            );
          }
        }
        for (const g of gates) record(g.key);

        const createdAt = new Date().toISOString();

        if (!supabaseConfigured()) {
          // Accept the report so the UI can optimistically count it, even
          // without a backend wired up. Still push it live to other clients.
          emitReport({ category, created_at: createdAt });
          return Response.json({ ok: true, persisted: false }, withCookie());
        }
        try {
          await createReport(category, serviceId);
          emitReport({ category, created_at: createdAt });
          return Response.json({ ok: true, persisted: true }, withCookie());
        } catch (err) {
          console.error("POST /api/reports failed", err);
          return Response.json(
            { ok: false, persisted: false },
            withCookie({ status: 500 }),
          );
        }
      },
    },
  },
});
