import { createFileRoute } from "@tanstack/react-router";
import { supabaseConfigured, upsertSubscription } from "@/lib/supabase";
import { emailConfigured, sendConfirmationEmail } from "@/lib/email";
import { serviceName } from "@/lib/minecraft-services";
import { check, clientKey, record } from "@/lib/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const Route = createFileRoute("/api/subscribe")({
  server: {
    handlers: {
      // Report which backends are wired up so the UI can show honest copy.
      GET: async () =>
        Response.json({
          supabase: supabaseConfigured(),
          email: emailConfigured(),
        }),

      POST: async ({ request }) => {
        // Throttle so this endpoint can't be abused to mail-bomb arbitrary
        // addresses: a few saves per IP per 10 min.
        const ip = clientKey(request);
        const ipGate = check(`sub:ip:${ip}`, 600_000, 6);
        if (!ipGate.ok) {
          return Response.json(
            { ok: false, error: "rate_limited" },
            {
              status: 429,
              headers: {
                "Retry-After": String(Math.ceil(ipGate.retryAfterMs / 1000)),
              },
            },
          );
        }
        record(`sub:ip:${ip}`);

        let email = "";
        let serviceIds: string[] = [];
        try {
          const body = (await request.json()) as {
            email?: string;
            serviceIds?: string[];
          };
          email = (body.email ?? "").trim().toLowerCase();
          if (Array.isArray(body.serviceIds))
            serviceIds = body.serviceIds.filter((s) => typeof s === "string");
        } catch {
          return Response.json(
            { ok: false, error: "bad request" },
            { status: 400 },
          );
        }

        if (!EMAIL_RE.test(email)) {
          return Response.json(
            { ok: false, error: "invalid email" },
            { status: 400 },
          );
        }

        if (!supabaseConfigured()) {
          return Response.json({
            ok: true,
            persisted: false,
            willEmail: false,
          });
        }
        try {
          await upsertSubscription(email, serviceIds);

          // Send a confirmation/welcome email — but only once per email per
          // 10 min so repeated saves don't spam the inbox.
          let willEmail = false;
          if (emailConfigured() && serviceIds.length > 0) {
            willEmail = true;
            const confGate = check(`subconf:${email}`, 600_000, 1);
            if (confGate.ok) {
              record(`subconf:${email}`);
              // Fire-and-forget: don't block the response on mail delivery.
              void sendConfirmationEmail([email], serviceIds.map(serviceName));
            }
          }

          return Response.json({ ok: true, persisted: true, willEmail });
        } catch (err) {
          console.error("POST /api/subscribe failed", err);
          return Response.json({ ok: false, error: "server" }, { status: 500 });
        }
      },
    },
  },
});
