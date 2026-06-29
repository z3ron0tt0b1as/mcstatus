import { useMemo } from "react";
import { Activity, CalendarRange, Timer, TriangleAlert } from "lucide-react";
import { synthDailyUptime } from "@/lib/synth";
import type { Incident } from "@/lib/incidents";
import { cn } from "@/lib/utils";

type Svc = { id: string; status: "online" | "offline"; latency: number };

function avg(nums: number[]): number {
  if (!nums.length) return 100;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function uptimeTone(pct: number): "success" | "warn" | "danger" {
  if (pct >= 99) return "success";
  if (pct >= 97) return "warn";
  return "danger";
}

function fmtDowntime(minutes: number): string {
  if (minutes < 1) return "0m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Aggregate health metrics across every monitored service: rolling uptime over
 * 24h / 7d / 30d, total downtime, and the 30-day incident count.
 */
export function SystemMetrics({
  services,
  incidents,
}: {
  services: Svc[];
  incidents: Incident[];
}) {
  const m = useMemo(() => {
    // Derive window uptimes from the same daily history that powers the
    // 90-day bars so the numbers stay consistent across the page.
    const series = services.map((s) => synthDailyUptime(s, 30).days);
    const windowAvg = (n: number) =>
      avg(
        series.map((days) => {
          const slice = days.slice(-n);
          return avg(slice.map((d) => d.uptime));
        }),
      );
    const u24 = windowAvg(1);
    const u7 = windowAvg(7);
    const u30 = windowAvg(30);
    // Average downtime across services over the 30-day window, in minutes.
    const downtime30 = ((100 - u30) / 100) * 30 * 24 * 60;
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const incidents30 = incidents.filter(
      (i) => new Date(i.startedAt).getTime() >= cutoff,
    ).length;
    return { u24, u7, u30, downtime30, incidents30 };
  }, [services, incidents]);

  const loading = services.length === 0;

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
      <UptimeTile
        icon={<Activity className="h-4 w-4" />}
        label="Uptime · 24h"
        value={m.u24}
        loading={loading}
      />
      <UptimeTile
        icon={<Activity className="h-4 w-4" />}
        label="Uptime · 7d"
        value={m.u7}
        loading={loading}
      />
      <UptimeTile
        icon={<Activity className="h-4 w-4" />}
        label="Uptime · 30d"
        value={m.u30}
        loading={loading}
      />
      <PlainTile
        icon={<Timer className="h-4 w-4" />}
        label="Downtime · 30d"
        value={loading ? "—" : fmtDowntime(m.downtime30)}
        sub="avg per service"
      />
      <PlainTile
        icon={
          m.incidents30 > 0 ? (
            <TriangleAlert className="h-4 w-4" />
          ) : (
            <CalendarRange className="h-4 w-4" />
          )
        }
        label="Incidents · 30d"
        value={loading ? "—" : String(m.incidents30)}
        sub={m.incidents30 === 0 ? "none recorded" : "logged outages"}
        tone={m.incidents30 > 0 ? "warn" : "default"}
        className="col-span-2 lg:col-span-1"
      />
    </div>
  );
}

function UptimeTile({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  loading: boolean;
}) {
  const tone = uptimeTone(value);
  const ink =
    tone === "success"
      ? "text-success-ink"
      : tone === "warn"
        ? "text-warn-ink"
        : "text-danger-ink";
  const wrap =
    tone === "success"
      ? "bg-success-bg text-success-ink"
      : tone === "warn"
        ? "bg-warn-bg text-warn-ink"
        : "bg-danger-bg text-danger-ink";
  return (
    <div className="rounded-2xl border border-line bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span
          className={cn("grid h-8 w-8 place-items-center rounded-lg", wrap)}
        >
          {icon}
        </span>
      </div>
      <div className={cn("mt-2 text-2xl font-extrabold tabular-nums", ink)}>
        {loading ? "—" : `${value.toFixed(2)}%`}
      </div>
    </div>
  );
}

function PlainTile({
  icon,
  label,
  value,
  sub,
  tone = "default",
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "warn";
  className?: string;
}) {
  const wrap =
    tone === "warn"
      ? "bg-warn-bg text-warn-ink"
      : "bg-muted-surface text-muted";
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-card p-4 shadow-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span
          className={cn("grid h-8 w-8 place-items-center rounded-lg", wrap)}
        >
          {icon}
        </span>
      </div>
      <div className="mt-2 text-2xl font-extrabold tabular-nums text-ink">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}
