/**
 * Shared, client-safe metadata for community outage reports and the helpers
 * that turn raw report rows into chartable time buckets. No server imports.
 */

export type TimeFrame = "24H" | "7D" | "30D";

export type ReportCategory = {
  id: string;
  label: string;
  /** Tailwind bg-* token for legend swatches. */
  token: string;
  /** Concrete colour for recharts fills. */
  color: string;
};

export const REPORT_CATEGORIES: ReportCategory[] = [
  {
    id: "login",
    label: "Login Issues",
    token: "bg-cat-login",
    color: "oklch(0.62 0.22 25)",
  },
  {
    id: "realms",
    label: "Realms Down",
    token: "bg-cat-realms",
    color: "oklch(0.58 0.2 350)",
  },
  {
    id: "launch",
    label: "Game Launch",
    token: "bg-cat-launch",
    color: "oklch(0.62 0.18 235)",
  },
  {
    id: "multi",
    label: "Multiplayer",
    token: "bg-cat-multi",
    color: "oklch(0.78 0.16 75)",
  },
  {
    id: "other",
    label: "Other",
    token: "bg-cat-other",
    color: "oklch(0.7 0.07 260)",
  },
];

export const CATEGORY_IDS = REPORT_CATEGORIES.map((c) => c.id);

export type RawReport = { category: string; created_at: string };
export type ReportBucket = { t: string; total: number } & Record<
  string,
  number | string
>;

type BucketSpec = {
  n: number;
  labelEvery: number;
  /** ms span of one bucket. */
  step: number;
  mkLabel: (date: Date) => string;
};

export function bucketSpec(tf: TimeFrame): BucketSpec {
  if (tf === "24H")
    return {
      n: 48,
      labelEvery: 8,
      step: 30 * 60 * 1000,
      mkLabel: (d) => `${String(d.getHours()).padStart(2, "0")}:00`,
    };
  if (tf === "7D")
    return {
      n: 28,
      labelEvery: 4,
      step: 6 * 60 * 60 * 1000,
      mkLabel: (d) => `${d.getMonth() + 1}/${d.getDate()}`,
    };
  return {
    n: 30,
    labelEvery: 5,
    step: 24 * 60 * 60 * 1000,
    mkLabel: (d) => `${d.getMonth() + 1}/${d.getDate()}`,
  };
}

/**
 * Aggregate raw report rows into stacked-bar buckets ending at `now`.
 */
export function bucketReports(
  reports: RawReport[],
  tf: TimeFrame,
): ReportBucket[] {
  const { n, labelEvery, step, mkLabel } = bucketSpec(tf);
  const now = Date.now();
  const start = now - n * step;

  const rows: ReportBucket[] = Array.from({ length: n }, (_, i) => {
    const bucketDate = new Date(start + i * step);
    const base: ReportBucket = {
      t: i % labelEvery === 0 ? mkLabel(bucketDate) : "",
      total: 0,
    };
    for (const c of CATEGORY_IDS) base[c] = 0;
    return base;
  });

  for (const r of reports) {
    const ts = new Date(r.created_at).getTime();
    if (ts < start || ts > now) continue;
    const idx = Math.min(n - 1, Math.floor((ts - start) / step));
    const cat = CATEGORY_IDS.includes(r.category) ? r.category : "other";
    rows[idx][cat] = (rows[idx][cat] as number) + 1;
    rows[idx].total += 1;
  }
  return rows;
}

export function totalReports(buckets: ReportBucket[]): number {
  return buckets.reduce((a, b) => a + b.total, 0);
}
