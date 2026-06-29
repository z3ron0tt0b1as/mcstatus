import { useMemo, useState } from "react";
import { synthDailyUptime, type DayLevel, type DayUptime } from "@/lib/synth";
import { cn } from "@/lib/utils";

/** bg-* token per day-level for the uptime bars. */
const BAR_BG: Record<DayLevel, string> = {
  operational: "bg-success",
  degraded: "bg-warn",
  partial: "bg-partial",
  major: "bg-danger",
  nodata: "bg-muted-surface",
};

const LEVEL_LABEL: Record<DayLevel, string> = {
  operational: "Operational",
  degraded: "Degraded",
  partial: "Partial outage",
  major: "Major outage",
  nodata: "No data",
};

/**
 * Statuspage-style 90-day daily uptime strip. Each bar is one day, coloured by
 * that day's worst status. Hover/focus a bar for the date and uptime %.
 */
export function UptimeBars({
  service,
  days = 90,
  className,
}: {
  service: { id: string; status: "online" | "offline"; latency: number };
  days?: number;
  className?: string;
}) {
  const { days: history, uptime } = useMemo(
    () => synthDailyUptime(service, days),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [service.id, service.status, days],
  );
  const [active, setActive] = useState<DayUptime | null>(null);

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between text-[11px] font-medium text-muted">
        <span>{days}-day uptime</span>
        <span className="tabular-nums font-semibold text-ink">
          {uptime.toFixed(2)}%
        </span>
      </div>

      <div className="relative mt-1.5" onMouseLeave={() => setActive(null)}>
        {/* Tooltip */}
        {active && (
          <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-line bg-elevated px-2.5 py-1.5 text-[11px] shadow-md">
            <div className="font-semibold text-ink">{active.label}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-muted">
              <span
                className={cn(
                  "inline-block h-2 w-2 rounded-sm",
                  BAR_BG[active.level],
                )}
              />
              {LEVEL_LABEL[active.level]} · {active.uptime.toFixed(2)}%
            </div>
          </div>
        )}

        <div className="flex h-7 items-stretch gap-[2px]">
          {history.map((d) => (
            <button
              key={d.date}
              type="button"
              onMouseEnter={() => setActive(d)}
              onFocus={() => setActive(d)}
              onClick={(e) => e.stopPropagation()}
              aria-label={`${d.label}: ${LEVEL_LABEL[d.level]}, ${d.uptime.toFixed(2)}% uptime`}
              className={cn(
                "min-w-0 flex-1 rounded-[2px] opacity-90 transition hover:opacity-100 hover:scale-y-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                BAR_BG[d.level],
              )}
            />
          ))}
        </div>
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted">
        <span>{days} days ago</span>
        <span>Today</span>
      </div>
    </div>
  );
}
