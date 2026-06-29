/**
 * Deterministic synthetic history for charts. Real per-endpoint history would
 * come from a time-series table; until that exists we seed a stable PRNG from
 * the service id so the curves are consistent between renders and timeframes.
 */
import type { TimeFrame } from "./reports";

export function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rand(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function tfPoints(tf: TimeFrame): {
  n: number;
  labelEvery: number;
  mkLabel: (i: number, n: number) => string;
} {
  if (tf === "24H")
    return {
      n: 48,
      labelEvery: 8,
      mkLabel: (i, n) => {
        const d = new Date();
        d.setMinutes(0, 0, 0);
        d.setHours(d.getHours() - Math.round((n - 1 - i) * 0.5));
        return `${String(d.getHours()).padStart(2, "0")}:00`;
      },
    };
  if (tf === "7D")
    return {
      n: 28,
      labelEvery: 4,
      mkLabel: (i, n) => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - Math.floor((n - 1 - i) / 4));
        return `${d.getMonth() + 1}/${d.getDate()}`;
      },
    };
  return {
    n: 30,
    labelEvery: 5,
    mkLabel: (i, n) => {
      const d = new Date();
      d.setDate(d.getDate() - (n - 1 - i));
      return `${d.getMonth() + 1}/${d.getDate()}`;
    },
  };
}

export type SvcLike = {
  id: string;
  status: "online" | "offline";
  latency: number;
};

export function synthLatencyStats(s: SvcLike) {
  const r = rand(hash(s.id));
  const base = Math.max(20, s.latency || 100);
  const p50 = Math.round(base * (0.85 + r() * 0.2));
  const p95 = Math.round(p50 * (2.2 + r()));
  const p99 = Math.round(p95 * (1.25 + r() * 0.5));
  return { p50, p95, p99 };
}

export function synthUptimeSeries(s: SvcLike, tf: TimeFrame) {
  const { n, labelEvery, mkLabel } = tfPoints(tf);
  const r = rand(hash(s.id + tf));
  const points: { t: string; v: number }[] = [];
  let outages = 0;
  for (let i = 0; i < n; i++) {
    const blip = r() < (s.status === "offline" ? 0.18 : 0.02);
    if (blip) outages++;
    points.push({
      t: i % labelEvery === 0 ? mkLabel(i, n) : "",
      v: blip
        ? Math.round((0.2 + r() * 0.3) * 100)
        : Math.round((0.95 + r() * 0.05) * 100),
    });
  }
  if (s.status === "offline")
    points[points.length - 1] = { t: points[points.length - 1].t, v: 0 };
  const uptime = Math.max(0, Math.min(100, 100 - (outages / n) * 100));
  return { points, uptime, outages };
}

export type DayLevel =
  "operational" | "degraded" | "partial" | "major" | "nodata";

export type DayUptime = {
  /** ISO yyyy-mm-dd */
  date: string;
  /** Human label, e.g. "Jan 5, 2026". */
  label: string;
  level: DayLevel;
  /** Uptime percentage for that day. */
  uptime: number;
  /** Number of incidents that touched this day. */
  incidents: number;
};

/**
 * Deterministic per-service daily uptime history for the classic
 * statuspage-style 90-day bar strip. Seeded from the service id so bars are
 * stable across renders. The most recent day reflects the live status.
 */
export function synthDailyUptime(
  s: SvcLike,
  days = 90,
): { days: DayUptime[]; uptime: number; incidents: number } {
  const r = rand(hash(s.id + "daily90"));
  const out: DayUptime[] = [];
  let sum = 0;
  let incidentTotal = 0;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const isToday = i === 0;
    let level: DayLevel;
    let uptime: number;
    let incidents = 0;
    if (isToday && s.status === "offline") {
      level = "major";
      uptime = Math.round((40 + r() * 40) * 10) / 10;
      incidents = 1;
    } else {
      const roll = r();
      if (roll < 0.018) {
        level = "major";
        uptime = Math.round((70 + r() * 20) * 10) / 10;
        incidents = 1;
      } else if (roll < 0.06) {
        level = "partial";
        uptime = Math.round((92 + r() * 6) * 10) / 10;
        incidents = 1;
      } else if (roll < 0.14) {
        level = "degraded";
        uptime = Math.round((98.5 + r() * 1.2) * 10) / 10;
      } else {
        level = "operational";
        uptime = Math.round((99.85 + r() * 0.15) * 100) / 100;
      }
    }
    sum += uptime;
    incidentTotal += incidents;
    out.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      level,
      uptime,
      incidents,
    });
  }
  return {
    days: out,
    uptime: Math.round((sum / days) * 1000) / 1000,
    incidents: incidentTotal,
  };
}

export function synthLatencySeries(s: SvcLike, tf: TimeFrame) {
  const { n, labelEvery, mkLabel } = tfPoints(tf);
  const r = rand(hash(s.id + "lat" + tf));
  const base = Math.max(20, s.latency || 100);
  const points = Array.from({ length: n }, (_, i) => {
    const wobble = 0.7 + r() * 0.8;
    const spike = r() < 0.06 ? 1.8 + r() : 1;
    return {
      t: i % labelEvery === 0 ? mkLabel(i, n) : "",
      v: Math.round(base * wobble * spike),
    };
  });
  const avg = Math.round(points.reduce((a, p) => a + p.v, 0) / points.length);
  return { points, avg };
}
