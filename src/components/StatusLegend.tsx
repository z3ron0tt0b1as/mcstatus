import { levelMeta, type StatusLevel } from "@/lib/status";
import { StatusDot } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";

const LEVELS: { level: StatusLevel; description: string }[] = [
  { level: "operational", description: "Responding normally" },
  { level: "degraded", description: "Slow responses" },
  { level: "partial", description: "Some endpoints down" },
  { level: "major", description: "Service unreachable" },
];

/** A compact key explaining what each status level means to visitors. */
export function StatusLegend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-xl border border-line bg-card px-3.5 py-2.5",
        className,
      )}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        Status key
      </span>
      {LEVELS.map(({ level, description }) => {
        const meta = levelMeta(level);
        return (
          <span key={level} className="inline-flex items-center gap-1.5">
            <StatusDot level={level} size={9} pulse={false} />
            <span className="text-xs font-semibold text-ink">{meta.label}</span>
            <span className="hidden text-[11px] text-muted sm:inline">
              — {description}
            </span>
          </span>
        );
      })}
    </div>
  );
}
