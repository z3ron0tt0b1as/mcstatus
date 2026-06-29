import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import { levelMeta, type StatusLevel } from "@/lib/status";
import { cn } from "@/lib/utils";

const ICONS: Record<StatusLevel, LucideIcon> = {
  operational: CheckCircle2,
  degraded: Activity,
  partial: AlertTriangle,
  major: AlertOctagon,
  unknown: HelpCircle,
};

/** A small animated status dot with an optional ping for non-healthy states. */
export function StatusDot({
  level,
  size = 10,
  pulse,
  className,
}: {
  level: StatusLevel;
  size?: number;
  pulse?: boolean;
  className?: string;
}) {
  const meta = levelMeta(level);
  const animate = pulse ?? (level !== "operational" && level !== "unknown");
  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ height: size, width: size }}
    >
      {animate && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-70",
            meta.dot,
          )}
        />
      )}
      <span
        className={cn("relative inline-flex rounded-full", meta.dot)}
        style={{ height: size, width: size }}
      />
    </span>
  );
}

/** Soft pill badge for a status level. */
export function StatusBadge({
  level,
  full = false,
  withIcon = true,
  className,
}: {
  level: StatusLevel;
  /** Use the long label ("Major Outage") instead of the short one. */
  full?: boolean;
  withIcon?: boolean;
  className?: string;
}) {
  const meta = levelMeta(level);
  const Icon = ICONS[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        meta.badge,
        className,
      )}
    >
      {withIcon ? (
        <Icon className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <StatusDot level={level} size={6} />
      )}
      {full ? meta.label : meta.short}
    </span>
  );
}
