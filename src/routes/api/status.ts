import { createFileRoute } from "@tanstack/react-router";
import {
  createIncident,
  listOpenIncidents,
  resolveIncident,
  subscribersForService,
  supabaseConfigured,
  type DbIncident,
} from "@/lib/supabase";
import { sendOutageEmail, sendRecoveryEmail } from "@/lib/email";
import { emitIncident } from "@/lib/events";
import {
  MINECRAFT_SERVICES as SERVICES,
  type MinecraftService as Service,
} from "@/lib/minecraft-services";

type ProbeResult = Service & {
  status: "online" | "offline";
  httpStatus: number;
  latency: number;
};

const PROBE_TIMEOUT = 7000; // per attempt
const PROBE_ATTEMPTS = 3; // total tries before declaring a probe failed
const PROBE_BACKOFF = 500; // ms, grows linearly per retry

// A browser-like UA avoids Cloudflare/edge blocks that some Mojang endpoints
// apply to default server agents (which would look like a false outage).
const PROBE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; IsMinecraftDown/1.0; +https://isminecraftdown.example)",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchOnce(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT);
  try {
    return await fetch(url, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
      headers: PROBE_HEADERS,
    });
  } finally {
    clearTimeout(timeout);
  }
}

// Reachability check with retries. ANY HTTP response below 500 (including 3xx
// redirects and 4xx like 401/403/404/429) means the endpoint is up — it
// answered. Only a server error (5xx) or a network/timeout failure on every
// attempt counts as offline. Retrying absorbs transient blips that previously
// produced phantom outages.
async function probe(svc: Service): Promise<ProbeResult> {
  const started = Date.now();
  let lastStatus = 0;

  for (let attempt = 0; attempt < PROBE_ATTEMPTS; attempt++) {
    try {
      const res = await fetchOnce(svc.url);
      if (res.status > 0 && res.status < 500) {
        return {
          ...svc,
          status: "online",
          httpStatus: res.status,
          latency: Date.now() - started,
        };
      }
      lastStatus = res.status; // 5xx — transient server error, retry
    } catch {
      // network error / timeout / abort — retry
    }
    if (attempt < PROBE_ATTEMPTS - 1)
      await sleep(PROBE_BACKOFF * (attempt + 1));
  }

  return {
    ...svc,
    status: "offline",
    httpStatus: lastStatus,
    latency: Date.now() - started,
  };
}

// ---- Status hysteresis -----------------------------------------------------
// Even with retries, we never flip a service to "offline" on a single bad
// snapshot. A service must fail FAIL_STREAK consecutive snapshots before it's
// reported down (recovery is reported immediately). While suppressing a blip we
// keep showing the last good latency/HTTP code so the card stays coherent.
const FAIL_STREAK = 2;
type Smoothed = {
  confirmed: "online" | "offline";
  fails: number;
  lastHttp: number;
  lastLatency: number;
};
const smoothing = new Map<string, Smoothed>();

function smoothStatus(r: ProbeResult): ProbeResult {
  const prev: Smoothed = smoothing.get(r.id) ?? {
    confirmed: "online", // optimistic: assume up until proven otherwise
    fails: 0,
    lastHttp: r.httpStatus,
    lastLatency: r.latency,
  };

  if (r.status === "online") {
    prev.confirmed = "online";
    prev.fails = 0;
    prev.lastHttp = r.httpStatus;
    prev.lastLatency = r.latency;
  } else {
    prev.fails += 1;
    if (prev.fails >= FAIL_STREAK) prev.confirmed = "offline";
  }
  smoothing.set(r.id, prev);

  return prev.confirmed === "online"
    ? {
        ...r,
        status: "online",
        httpStatus: prev.lastHttp,
        latency: prev.lastLatency,
      }
    : { ...r, status: "offline" };
}

function durationLabel(startISO: string): string {
  const sec = Math.max(
    0,
    Math.round((Date.now() - new Date(startISO).getTime()) / 1000),
  );
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Reconciliation runs on the server but is hit by every polling client. Guard
// it with an in-process throttle + lock so we never double-open an incident or
// double-send an email when several requests arrive at once.
const RECONCILE_INTERVAL = 4_000;
let lastReconcile = 0;
let reconciling = false;

async function reconcile(results: ProbeResult[]): Promise<void> {
  if (!supabaseConfigured()) return;
  if (reconciling || Date.now() - lastReconcile < RECONCILE_INTERVAL) return;
  reconciling = true;
  lastReconcile = Date.now();
  try {
    const open = await listOpenIncidents();
    const openByService = new Map<string, DbIncident>();
    for (const inc of open) openByService.set(inc.service_id, inc);

    for (const r of results) {
      const existing = openByService.get(r.id);
      if (r.status === "offline" && !existing) {
        await createIncident(r.id, r.name);
        emitIncident({ action: "open", serviceId: r.id, serviceName: r.name });
        const subs = await subscribersForService(r.id).catch(() => []);
        if (subs.length) {
          await sendOutageEmail(
            subs.map((s) => s.email),
            r.name,
            new Date().toISOString(),
          );
        }
      } else if (r.status === "online" && existing) {
        await resolveIncident(existing.id);
        emitIncident({
          action: "resolve",
          serviceId: r.id,
          serviceName: r.name,
        });
        const subs = await subscribersForService(r.id).catch(() => []);
        if (subs.length) {
          await sendRecoveryEmail(
            subs.map((s) => s.email),
            r.name,
            durationLabel(existing.started_at),
          );
        }
      }
    }
  } catch (err) {
    console.error("incident reconcile failed", err);
  } finally {
    reconciling = false;
  }
}

// Clients poll every ~5s. Cache one probe snapshot for that window and share a
// single in-flight probe across concurrent requests, so we never hit Mojang's
// endpoints more than once per SNAPSHOT_TTL no matter how many viewers there are.
const SNAPSHOT_TTL = 5_000;
type Snapshot = { checkedAt: string; services: ProbeResult[] };
let snapshot: Snapshot | null = null;
let snapshotAt = 0;
let inflight: Promise<Snapshot> | null = null;

// Probe with limited concurrency. Firing all 11 requests at once (especially on
// a cold start) can saturate the connection pool / event loop and make several
// unrelated services time out together — the classic "everything is down" blip.
async function probeAll(): Promise<ProbeResult[]> {
  const CONCURRENCY = 4;
  const results = new Array<ProbeResult>(SERVICES.length);
  let next = 0;
  async function worker() {
    while (next < SERVICES.length) {
      const idx = next++;
      results[idx] = await probe(SERVICES[idx]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, SERVICES.length) }, worker),
  );
  return results;
}

async function refreshSnapshot(): Promise<Snapshot> {
  const raw = await probeAll();
  const services = raw.map(smoothStatus);
  snapshot = { checkedAt: new Date().toISOString(), services };
  snapshotAt = Date.now();
  // Fire-and-forget: don't block the status response on DB / email work.
  void reconcile(services);
  return snapshot;
}

// Stale-while-revalidate: always return the latest snapshot instantly and
// refresh in the background. Because a failing probe can take several seconds
// (retries), we must never make clients wait on it — they keep getting the last
// known good snapshot until the refresh lands.
function getSnapshot(): Promise<Snapshot> {
  const fresh = snapshot && Date.now() - snapshotAt < SNAPSHOT_TTL;
  if (!fresh && !inflight) {
    inflight = refreshSnapshot().finally(() => {
      inflight = null;
    });
  }
  if (snapshot) return Promise.resolve(snapshot);
  return inflight ?? refreshSnapshot();
}

export const Route = createFileRoute("/api/status")({
  server: {
    handlers: {
      GET: async () => {
        const snap = await getSnapshot();
        return Response.json(snap, {
          headers: { "Cache-Control": "no-store" },
        });
      },
    },
  },
});
