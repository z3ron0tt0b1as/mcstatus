export type ServiceSnapshot = {
  id: string;
  name: string;
  status: "online" | "offline";
};

export type Incident = {
  id: string;
  serviceId: string;
  serviceName: string;
  startedAt: string;
  resolvedAt?: string;
};

const KEY = "imd_incidents_v1";
const SUBS_KEY = "imd_subs_v1";
const MAX = 50;

export function loadIncidents(): Incident[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function save(list: Incident[]) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
}

export function reconcileIncidents(
  prev: ServiceSnapshot[] | null,
  next: ServiceSnapshot[],
): {
  incidents: Incident[];
  newlyDown: ServiceSnapshot[];
  newlyUp: Incident[];
} {
  const list = loadIncidents();
  const newlyDown: ServiceSnapshot[] = [];
  const newlyUp: Incident[] = [];
  const prevMap = new Map((prev ?? []).map((s) => [s.id, s.status]));

  for (const s of next) {
    const before = prevMap.get(s.id);
    const open = list.find((i) => i.serviceId === s.id && !i.resolvedAt);

    if (s.status === "offline" && before !== "offline" && !open) {
      const inc: Incident = {
        id: `${s.id}-${Date.now()}`,
        serviceId: s.id,
        serviceName: s.name,
        startedAt: new Date().toISOString(),
      };
      list.unshift(inc);
      newlyDown.push(s);
    } else if (s.status === "online" && open) {
      open.resolvedAt = new Date().toISOString();
      newlyUp.push(open);
    }
  }
  save(list);
  return { incidents: list, newlyDown, newlyUp };
}

export type Subscriptions = {
  enabled: boolean;
  serviceIds: string[];
  email?: string;
};

export function loadSubs(): Subscriptions {
  if (typeof window === "undefined") return { enabled: false, serviceIds: [] };
  try {
    return (
      JSON.parse(localStorage.getItem(SUBS_KEY) || "") || {
        enabled: false,
        serviceIds: [],
      }
    );
  } catch {
    return { enabled: false, serviceIds: [] };
  }
}

export function saveSubs(s: Subscriptions) {
  localStorage.setItem(SUBS_KEY, JSON.stringify(s));
}

export function formatDuration(startISO: string, endISO?: string) {
  const start = new Date(startISO).getTime();
  const end = endISO ? new Date(endISO).getTime() : Date.now();
  const sec = Math.max(0, Math.round((end - start) / 1000));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
