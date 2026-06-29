import { createFileRoute } from "@tanstack/react-router";

type ServerEntry = {
  id: string;
  name: string;
  host: string;
  edition: "java" | "bedrock";
};

const SERVERS: ServerEntry[] = [
  { id: "hypixel", name: "Hypixel", host: "mc.hypixel.net", edition: "java" },
  { id: "donutsmp", name: "Donut SMP", host: "donutsmp.net", edition: "java" },
  {
    id: "hive",
    name: "Hive Games",
    host: "geo.hivebedrock.network",
    edition: "bedrock",
  },
  {
    id: "cubecraft",
    name: "CubeCraft",
    host: "play.cubecraft.net",
    edition: "bedrock",
  },
];

async function probe(s: ServerEntry) {
  const base =
    s.edition === "bedrock"
      ? "https://api.mcsrvstat.us/bedrock/3/"
      : "https://api.mcsrvstat.us/3/";
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(base + s.host, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error("bad status");
    const data = (await res.json()) as {
      online?: boolean;
      players?: { online?: number; max?: number };
    };
    return {
      ...s,
      online: !!data.online,
      players: data.players?.online ?? 0,
      max: data.players?.max ?? 0,
    };
  } catch {
    return { ...s, online: false, players: 0, max: 0 };
  }
}

// mcsrvstat.us caches for minutes and rate-limits, so cache a snapshot for 15s
// and share a single in-flight request across concurrent viewers even though
// the client polls more frequently.
const SNAPSHOT_TTL = 15_000;
type Snapshot = {
  checkedAt: string;
  servers: Awaited<ReturnType<typeof probe>>[];
};
let snapshot: Snapshot | null = null;
let snapshotAt = 0;
let inflight: Promise<Snapshot> | null = null;

async function refreshSnapshot(): Promise<Snapshot> {
  const servers = await Promise.all(SERVERS.map(probe));
  snapshot = { checkedAt: new Date().toISOString(), servers };
  snapshotAt = Date.now();
  return snapshot;
}

function getSnapshot(): Promise<Snapshot> {
  if (snapshot && Date.now() - snapshotAt < SNAPSHOT_TTL) {
    return Promise.resolve(snapshot);
  }
  if (!inflight) {
    inflight = refreshSnapshot().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export const Route = createFileRoute("/api/servers")({
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
