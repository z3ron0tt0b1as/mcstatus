/**
 * The five-state status model used across the dashboard. The probe API only
 * reports a binary online/offline per service, so we *derive* the richer
 * statuspage-style levels truthfully:
 *   - offline                     -> major
 *   - online but slow (>= DEGRADED_MS) -> degraded
 *   - online and fast             -> operational
 * Aggregating those across a group/the whole system yields partial outages.
 */

export type StatusLevel =
  "operational" | "degraded" | "partial" | "major" | "unknown";

/** Response time (ms) at or above which an online service is "degraded". */
export const DEGRADED_MS = 1200;

export type LevelMeta = {
  label: string;
  /** Short label for compact badges. */
  short: string;
  /** Tailwind bg-* token for the solid status dot. */
  dot: string;
  /** Tailwind classes for a soft pill badge. */
  badge: string;
  /** Tailwind text colour token. */
  text: string;
  /** Concrete CSS colour (a var reference) for SVG strokes / inline styles. */
  color: string;
  /** Soft background colour var for rings/fills. */
  soft: string;
};

export const LEVEL_META: Record<StatusLevel, LevelMeta> = {
  operational: {
    label: "Operational",
    short: "Operational",
    dot: "bg-success",
    badge: "bg-success-bg text-success-ink",
    text: "text-success-ink",
    color: "var(--success)",
    soft: "var(--success-bg)",
  },
  degraded: {
    label: "Degraded Performance",
    short: "Degraded",
    dot: "bg-warn",
    badge: "bg-warn-bg text-warn-ink",
    text: "text-warn-ink",
    color: "var(--warn)",
    soft: "var(--warn-bg)",
  },
  partial: {
    label: "Partial Outage",
    short: "Partial",
    dot: "bg-partial",
    badge: "bg-partial-bg text-partial-ink",
    text: "text-partial-ink",
    color: "var(--partial)",
    soft: "var(--partial-bg)",
  },
  major: {
    label: "Major Outage",
    short: "Down",
    dot: "bg-danger",
    badge: "bg-danger-bg text-danger-ink",
    text: "text-danger-ink",
    color: "var(--danger)",
    soft: "var(--danger-bg)",
  },
  unknown: {
    label: "Unknown",
    short: "Unknown",
    dot: "bg-muted",
    badge: "bg-muted-surface text-muted",
    text: "text-muted",
    color: "var(--muted-fg)",
    soft: "var(--muted-surface)",
  },
};

export type StatusLike = {
  status: "online" | "offline";
  latency: number;
};

/** Level for a single service. */
export function serviceLevel(s: StatusLike): StatusLevel {
  if (s.status === "offline") return "major";
  if (s.latency >= DEGRADED_MS) return "degraded";
  return "operational";
}

/**
 * Roll up a set of services into a single level. Used for both service groups
 * and the overall system banner.
 */
export function aggregateLevel(services: StatusLike[]): StatusLevel {
  if (services.length === 0) return "unknown";
  const down = services.filter((s) => s.status === "offline").length;
  const degraded = services.filter(
    (s) => s.status === "online" && s.latency >= DEGRADED_MS,
  ).length;
  if (down === services.length) return "major";
  if (down > 0) return "partial";
  if (degraded > 0) return "degraded";
  return "operational";
}

export function levelMeta(level: StatusLevel): LevelMeta {
  return LEVEL_META[level];
}
