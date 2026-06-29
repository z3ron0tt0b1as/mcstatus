# Backend setup (Supabase + email alerts)

The status page works out of the box with **no configuration** — incidents are
tracked in the browser (localStorage) and the community chart shows sample data.
To make the incident timeline, community reports and outage emails _real_, wire
up Supabase (and optionally Resend for email).

Everything degrades gracefully: each API route reports whether its backend is
configured, and the UI shows an honest "Live" vs "Sample/This device only"
badge accordingly.

## 1. Create the Supabase tables

In your Supabase project open **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql).
It creates three tables:

| Table           | Purpose                                                 |
| --------------- | ------------------------------------------------------- |
| `incidents`     | Outages detected by the server probe (`/api/status`)    |
| `reports`       | Community "Report an Issue" submissions                 |
| `subscriptions` | Email addresses subscribed to per-service outage alerts |

## 2. Set environment variables

Copy `.env.example` to `.env` and fill in:

```bash
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role key from Project Settings → API>
```

The service-role key is **server-only** — it is read in `src/lib/supabase.ts`,
which is imported exclusively from server route handlers, so it never reaches
the browser bundle.

### Optional: email alerts via Resend

```bash
RESEND_API_KEY=<resend api key>
ALERT_FROM_EMAIL=alerts@yourdomain.com   # must be a verified sender
PUBLIC_SITE_URL=https://your-deployment  # used for the link in emails
```

With these set, when the probe opens or resolves an incident for a service, any
subscriber watching that service gets a "🔴 down" / "🟢 recovered" email.

## 3. How it fits together

The page polls every backend **live every 5 seconds**. To avoid hammering the
upstream Mojang/mcsrvstat APIs, the server caches one probe snapshot per window
and shares a single in-flight probe across all concurrent viewers.

- **`/api/status`** caches a 5s probe snapshot and, on each refresh, reconciles
  open incidents in Supabase and fires emails (in-process lock avoids duplicate
  incidents/emails across concurrent clients).
- **`/api/incidents`** feeds the Incident Timeline (falls back to the browser's
  local incident log when Supabase is off).
- **`/api/reports`** GET feeds the Community chart, POST records a report.
  Submissions are **rate-limited per client** (1 / 5s, 8 / min, 40 / hour, and
  one of the same category / 30s) and return `429` when exceeded; the UI shows a
  cooldown.
- **`/api/subscribe`** GET reports capabilities, POST upserts an email
  subscription.

## Data model notes

The per-service uptime/latency sparklines and player-count charts are still
**synthesized deterministically** from a seed (see `src/lib/synth.ts`) because
there is no historical time-series table yet. To make those real, add an
`uptime_samples` table written by a scheduled function and swap the `synth*`
calls for queries — the chart components already take plain `{ t, v }` arrays.
