import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Compact "auto-refresh" control: a ring that fills as the next poll
 * approaches, with a manual refresh on click. Driven by the timestamp of the
 * last successful update so it stays in sync with react-query's interval.
 */
export function RefreshControl({
  lastUpdated,
  intervalMs,
  onRefresh,
  refreshing,
}: {
  lastUpdated: number;
  intervalMs: number;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const elapsed = lastUpdated ? now - lastUpdated : 0;
  const left = Math.max(0, intervalMs - elapsed);
  const secs = Math.max(0, Math.ceil(left / 1000));
  const progress = lastUpdated
    ? Math.min(100, (elapsed / intervalMs) * 100)
    : 0;

  const size = 34;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - progress / 100);

  return (
    <button
      onClick={onRefresh}
      disabled={refreshing}
      title="Refresh now"
      aria-label={`Auto-refreshing, next update in ${secs} seconds. Click to refresh now.`}
      className="group relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition hover:text-ink"
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute -rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="ring-track"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--brand)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.25s linear" }}
        />
      </svg>
      <RefreshCw
        className={cn(
          "h-4 w-4 transition group-hover:text-brand",
          refreshing && "animate-spin text-brand",
        )}
      />
    </button>
  );
}
