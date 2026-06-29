import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ExternalLink,
  Activity,
  Gauge,
  Hash,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Bell,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { chartPalette, useTheme } from "@/lib/theme";
import {
  synthLatencySeries,
  synthLatencyStats,
  synthUptimeSeries,
} from "@/lib/synth";
import { formatDuration, formatTime, type Incident } from "@/lib/incidents";
import type { TimeFrame } from "@/lib/reports";

export type DetailService = {
  id: string;
  name: string;
  url: string;
  status: "online" | "offline";
  httpStatus: number;
  latency: number;
};

export function ServiceDetailModal({
  service,
  incidents,
  onClose,
  onSubscribe,
}: {
  service: DetailService | null;
  incidents: Incident[];
  onClose: () => void;
  onSubscribe?: (serviceId: string) => void;
}) {
  const [tf, setTf] = useState<TimeFrame>("24H");
  const { theme } = useTheme();
  const palette = chartPalette(theme);

  useEffect(() => {
    if (!service) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [service, onClose]);

  const stats = useMemo(
    () => (service ? synthLatencyStats(service) : null),
    [service?.id, service?.latency],
  );
  const uptime = useMemo(
    () => (service ? synthUptimeSeries(service, tf) : null),
    [service?.id, service?.status, tf],
  );
  const latency = useMemo(
    () => (service ? synthLatencySeries(service, tf) : null),
    [service?.id, service?.latency, tf],
  );

  const svcIncidents = useMemo(
    () => (service ? incidents.filter((i) => i.serviceId === service.id) : []),
    [incidents, service?.id],
  );

  const isOnline = service?.status === "online";

  return (
    <AnimatePresence>
      {service && stats && uptime && latency && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 grid place-items-end bg-[oklch(0.1_0.02_200_/_0.6)] backdrop-blur-md sm:place-items-center sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="glass flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl shadow-2xl sm:rounded-3xl"
            role="dialog"
            aria-modal="true"
            aria-label={`${service.name} details`}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-line bg-elevated p-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${isOnline ? "bg-success" : "bg-danger"} ${isOnline ? "" : "animate-pulse"}`}
                  />
                  <h3 className="truncate text-lg font-bold text-ink">
                    {service.name}
                  </h3>
                </div>
                <a
                  href={service.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs text-link hover:underline"
                >
                  <span className="truncate">{service.url}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    isOnline
                      ? "bg-success-bg text-success-ink"
                      : "bg-danger-bg text-danger-ink"
                  }`}
                >
                  {isOnline ? "Operational" : "Down"}
                </span>
                <button
                  onClick={onClose}
                  className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-muted-surface hover:text-ink"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-5">
              {/* Stat tiles */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  icon={<Activity className="h-4 w-4" />}
                  label="Status"
                  value={isOnline ? "Online" : "Offline"}
                  tone={isOnline ? "good" : "bad"}
                />
                <Stat
                  icon={<Gauge className="h-4 w-4" />}
                  label="Response"
                  value={`${service.latency}ms`}
                />
                <Stat
                  icon={<Hash className="h-4 w-4" />}
                  label="HTTP"
                  value={service.httpStatus ? String(service.httpStatus) : "—"}
                />
                <Stat
                  icon={<ShieldCheck className="h-4 w-4" />}
                  label={`Uptime ${tf}`}
                  value={`${uptime.uptime.toFixed(1)}%`}
                  tone="good"
                />
              </div>

              {/* Timeframe toggle */}
              <div className="mt-5 flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">History</span>
                <Toggle value={tf} onChange={setTf} />
              </div>

              {/* Uptime chart */}
              <ChartBlock
                title="Uptime"
                subtitle={`${uptime.outages} dip${uptime.outages === 1 ? "" : "s"} in window`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={uptime.points}
                    margin={{ top: 6, right: 6, bottom: 0, left: -18 }}
                  >
                    <defs>
                      <linearGradient id="md-up" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor={palette.upFill}
                          stopOpacity={0.55}
                        />
                        <stop
                          offset="100%"
                          stopColor={palette.upFill}
                          stopOpacity={0.04}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke={palette.grid}
                      strokeDasharray="2 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="t"
                      tick={{ fontSize: 10, fill: palette.axis }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 10, fill: palette.axis }}
                      axisLine={false}
                      tickLine={false}
                      width={34}
                    />
                    <Tooltip
                      cursor={{
                        stroke: palette.cursor,
                        strokeDasharray: "3 3",
                      }}
                      contentStyle={tooltipStyle(palette)}
                      formatter={(v: number) => [`${v}%`, "uptime"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke={palette.up}
                      strokeWidth={2}
                      fill="url(#md-up)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartBlock>

              {/* Latency chart + percentiles */}
              <ChartBlock
                title="Response time"
                subtitle={`avg ${latency.avg}ms`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={latency.points}
                    margin={{ top: 6, right: 6, bottom: 0, left: -10 }}
                  >
                    <defs>
                      <linearGradient id="md-lat" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor={palette.players}
                          stopOpacity={0.5}
                        />
                        <stop
                          offset="100%"
                          stopColor={palette.players}
                          stopOpacity={0.04}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke={palette.grid}
                      strokeDasharray="2 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="t"
                      tick={{ fontSize: 10, fill: palette.axis }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: palette.axis }}
                      axisLine={false}
                      tickLine={false}
                      width={42}
                      unit="ms"
                    />
                    <Tooltip
                      cursor={{
                        stroke: palette.cursor,
                        strokeDasharray: "3 3",
                      }}
                      contentStyle={tooltipStyle(palette)}
                      formatter={(v: number) => [`${v}ms`, "latency"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke={palette.players}
                      strokeWidth={2}
                      fill="url(#md-lat)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartBlock>

              <div className="mt-3 grid grid-cols-3 gap-3">
                <Percentile label="p50" value={stats.p50} />
                <Percentile label="p95" value={stats.p95} />
                <Percentile label="p99" value={stats.p99} />
              </div>

              {/* Incident history */}
              <div className="mt-6">
                <h4 className="text-sm font-semibold text-ink">
                  Incident history
                </h4>
                {svcIncidents.length === 0 ? (
                  <div className="mt-2 flex items-center gap-2 rounded-lg border border-line bg-elevated p-4 text-sm text-muted">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    No incidents recorded for this service.
                  </div>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {svcIncidents.slice(0, 6).map((i) => {
                      const ongoing = !i.resolvedAt;
                      return (
                        <li
                          key={i.id}
                          className="flex items-center gap-3 rounded-lg border border-line bg-elevated p-3"
                        >
                          <span
                            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${ongoing ? "bg-warn-bg text-warn-ink" : "bg-success-bg text-success-ink"}`}
                          >
                            {ongoing ? (
                              <AlertTriangle className="h-3.5 w-3.5" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-1.5 text-xs text-muted">
                              <Clock className="h-3 w-3" />
                              {formatTime(i.startedAt)}
                              {i.resolvedAt && (
                                <span>→ {formatTime(i.resolvedAt)}</span>
                              )}
                            </p>
                          </div>
                          <div className="text-right">
                            <span
                              className={`text-[11px] font-semibold ${ongoing ? "text-warn-ink" : "text-success-ink"}`}
                            >
                              {ongoing ? "Ongoing" : "Resolved"}
                            </span>
                            <div className="text-[11px] tabular-nums text-muted">
                              {formatDuration(i.startedAt, i.resolvedAt)}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 border-t border-line bg-elevated p-4">
              <span className="text-xs text-muted">
                Live — refreshes every 5s
              </span>
              <button
                onClick={() => onSubscribe?.(service.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-brand-foreground hover:opacity-95"
              >
                <Bell className="h-4 w-4" /> Alert me if this goes down
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function tooltipStyle(palette: ReturnType<typeof chartPalette>) {
  return {
    borderRadius: 10,
    border: `1px solid ${palette.tooltipBorder}`,
    background: palette.tooltipBg,
    color: palette.tooltipText,
    fontSize: 12,
    boxShadow: "0 8px 24px oklch(0 0 0 / 0.18)",
  } as const;
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  const color =
    tone === "good"
      ? "text-success-ink"
      : tone === "bad"
        ? "text-danger-ink"
        : "text-ink";
  return (
    <div className="rounded-xl border border-line bg-elevated p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-lg font-bold tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  );
}

function Percentile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-elevated p-3 text-center">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-base font-bold tabular-nums text-ink">
        {value}ms
      </div>
    </div>
  );
}

function ChartBlock({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 rounded-xl border border-line bg-elevated p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold text-ink">{title}</span>
        {subtitle && <span className="text-xs text-muted">{subtitle}</span>}
      </div>
      <div className="mt-2 h-40 w-full">{children}</div>
    </div>
  );
}

function Toggle({
  value,
  onChange,
}: {
  value: TimeFrame;
  onChange: (t: TimeFrame) => void;
}) {
  const opts: TimeFrame[] = ["24H", "7D", "30D"];
  return (
    <div className="inline-flex rounded-lg bg-muted-surface p-0.5">
      {opts.map((o) => {
        const active = o === value;
        return (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
              active
                ? "bg-card text-ink shadow-sm"
                : "text-muted hover:text-ink"
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
