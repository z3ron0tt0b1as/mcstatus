import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  KeyRound,
  Rocket,
  Users,
  HelpCircle,
  Check,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sun,
  Moon,
  ChevronRight,
  ChevronDown,
  Database,
  Server,
  Gauge,
  Signal,
  TriangleAlert,
  Radio,
  Layers,
  ShieldCheck,
  Swords,
  ScrollText,
  Network,
  Hash,
  Boxes,
  Image as ImageIcon,
  BadgeCheck,
  Globe,
  Search,
  CalendarClock,
  Zap,
  Cuboid,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { AlertsDialog } from "@/components/AlertsDialog";
import {
  ServiceDetailModal,
  type DetailService,
} from "@/components/ServiceDetailModal";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { StatusRing } from "@/components/StatusRing";
import { StatusBadge, StatusDot } from "@/components/StatusBadge";
import { RefreshControl } from "@/components/RefreshControl";
import { Reveal } from "@/components/Reveal";
import { UptimeBars } from "@/components/UptimeBars";
import { StatusLegend } from "@/components/StatusLegend";
import { SystemMetrics } from "@/components/SystemMetrics";
import { PastIncidents } from "@/components/PastIncidents";
import { useTheme, chartPalette } from "@/lib/theme";
import {
  aggregateLevel,
  levelMeta,
  serviceLevel,
  type StatusLevel,
} from "@/lib/status";
import {
  REPORT_CATEGORIES,
  bucketReports,
  totalReports,
  type RawReport,
  type ReportBucket,
  type TimeFrame,
} from "@/lib/reports";
import {
  hash,
  rand,
  tfPoints,
  synthLatencyStats,
  synthUptimeSeries,
} from "@/lib/synth";
import {
  formatDuration,
  formatTime,
  loadIncidents,
  loadSubs,
  reconcileIncidents,
  type Incident,
} from "@/lib/incidents";
import { cn } from "@/lib/utils";

type ApiService = {
  id: string;
  name: string;
  url: string;
  status: "online" | "offline";
  httpStatus: number;
  latency: number;
};
type StatusPayload = { checkedAt: string; services: ApiService[] };

type ServerEntry = {
  id: string;
  name: string;
  host: string;
  edition: "java" | "bedrock";
  online: boolean;
  players: number;
  max: number;
};
type ServersPayload = { checkedAt: string; servers: ServerEntry[] };

type IncidentsPayload = { configured: boolean; incidents: Incident[] };
type ReportsPayload = { configured: boolean; reports: RawReport[] };

const REPORT_ICONS: Record<string, React.ReactNode> = {
  login: <KeyRound className="h-4 w-4" />,
  realms: <Check className="h-4 w-4" />,
  launch: <Rocket className="h-4 w-4" />,
  multi: <Users className="h-4 w-4" />,
  other: <HelpCircle className="h-4 w-4" />,
};

// A distinct icon for every monitored service endpoint.
const SERVICE_ICONS: Record<string, React.ReactNode> = {
  session: <Network className="h-4 w-4" />,
  u2uuid: <Hash className="h-4 w-4" />,
  uuid2profile: <BadgeCheck className="h-4 w-4" />,
  services: <Boxes className="h-4 w-4" />,
  textures: <ImageIcon className="h-4 w-4" />,
  auth: <KeyRound className="h-4 w-4" />,
  profile: <Users className="h-4 w-4" />,
  "bedrock-realms": <Globe className="h-4 w-4" />,
  "java-realms": <Server className="h-4 w-4" />,
  "dungeons-signal": <Swords className="h-4 w-4" />,
  "dungeons-relay": <Radio className="h-4 w-4" />,
};
const serviceIcon = (id: string) =>
  SERVICE_ICONS[id] ?? <Server className="h-4 w-4" />;

// Group the flat service list into status-page style component categories.
const SERVICE_GROUPS: {
  id: string;
  label: string;
  icon: React.ReactNode;
  ids: string[];
}[] = [
  {
    id: "auth",
    label: "Authentication & Profiles",
    icon: <ShieldCheck className="h-4 w-4" />,
    ids: ["auth", "services", "session", "profile", "u2uuid", "uuid2profile"],
  },
  {
    id: "realms",
    label: "Realms",
    icon: <Server className="h-4 w-4" />,
    ids: ["java-realms", "bedrock-realms"],
  },
  {
    id: "files",
    label: "Game Files & Launcher",
    icon: <ScrollText className="h-4 w-4" />,
    ids: ["textures"],
  },
  {
    id: "dungeons",
    label: "Minecraft Dungeons",
    icon: <Swords className="h-4 w-4" />,
    ids: ["dungeons-signal", "dungeons-relay"],
  },
];

type ServiceGroupData = {
  id: string;
  label: string;
  icon: React.ReactNode;
  services: ApiService[];
};

function groupServices(services: ApiService[]): ServiceGroupData[] {
  const byId = new Map(services.map((s) => [s.id, s]));
  const used = new Set<string>();
  const groups: ServiceGroupData[] = [];
  for (const g of SERVICE_GROUPS) {
    const list = g.ids
      .map((id) => byId.get(id))
      .filter((s): s is ApiService => Boolean(s));
    list.forEach((s) => used.add(s.id));
    if (list.length)
      groups.push({ id: g.id, label: g.label, icon: g.icon, services: list });
  }
  const other = services.filter((s) => !used.has(s.id));
  if (other.length) {
    groups.push({
      id: "other",
      label: "Other",
      icon: <Layers className="h-4 w-4" />,
      services: other,
    });
  }
  return groups;
}

const fetchStatus = async (): Promise<StatusPayload> => {
  const r = await fetch("/api/status", { cache: "no-store" });
  if (!r.ok) throw new Error("status fetch failed");
  return r.json();
};
const fetchServers = async (): Promise<ServersPayload> => {
  const r = await fetch("/api/servers", { cache: "no-store" });
  if (!r.ok) throw new Error("servers fetch failed");
  return r.json();
};
const fetchIncidents = async (): Promise<IncidentsPayload> => {
  const r = await fetch("/api/incidents", { cache: "no-store" });
  if (!r.ok) throw new Error("incidents fetch failed");
  return r.json();
};
const fetchReports = async (): Promise<ReportsPayload> => {
  const r = await fetch("/api/reports", { cache: "no-store" });
  if (!r.ok) throw new Error("reports fetch failed");
  return r.json();
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title:
          "Is Minecraft Down? — Live API & Server Status with 30 days history",
      },
      {
        name: "description",
        content:
          "Real-time Minecraft server status monitoring with 30 days of uptime history. Check if Mojang APIs, Java Realms, Bedrock Realms, and popular multiplayer servers like Hypixel are online.",
      },
      {
        property: "og:title",
        content: "Is Minecraft Down? — Live API & Server Status",
      },
      {
        property: "og:description",
        content:
          "Live uptime monitor for every Minecraft service endpoint, refreshed every 5 seconds.",
      },
    ],
  }),
  component: StatusPage,
});

type LiveReport = { id: string; category: string; at: number };

const LIVE = 5_000;
// Client mirror of the server's per-identity report cooldown (5 minutes).
const REPORT_COOLDOWN_MS = 5 * 60_000;

function fmtCountdown(totalSecs: number): string {
  if (totalSecs >= 60) {
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return s ? `${m}m ${s}s` : `${m}m`;
  }
  return `${totalSecs}s`;
}

function StatusPage() {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);
  const [recent, setRecent] = useState<LiveReport[]>([]);
  const [communityTf, setCommunityTf] = useState<TimeFrame>("24H");
  const [javaTf, setJavaTf] = useState<TimeFrame>("24H");
  const [bedrockTf, setBedrockTf] = useState<TimeFrame>("24H");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [preselect, setPreselect] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailService | null>(null);
  const [search, setSearch] = useState("");
  // Start empty so SSR and the first client render match; hydrate from
  // localStorage after mount to avoid a hydration mismatch.
  const [localIncidents, setLocalIncidents] = useState<Incident[]>([]);
  useEffect(() => {
    setLocalIncidents(loadIncidents());
  }, []);
  // Client-side anti-spam: block rapid repeat reports and reflect a countdown.
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [cooldownUntil]);
  const cooldownLeft = Math.max(
    0,
    Math.ceil((cooldownUntil - Date.now()) / 1000),
  );
  const cooling = cooldownLeft > 0;

  // Everything refreshes live every 5s. Keep polling even when the tab is in
  // the background so the page is current the instant the user returns.
  const status = useQuery({
    queryKey: ["status"],
    queryFn: fetchStatus,
    refetchInterval: LIVE,
    refetchIntervalInBackground: true,
  });
  const servers = useQuery({
    queryKey: ["servers"],
    queryFn: fetchServers,
    refetchInterval: LIVE,
    refetchIntervalInBackground: true,
  });
  const incidentsQ = useQuery({
    queryKey: ["incidents"],
    queryFn: fetchIncidents,
    refetchInterval: LIVE,
    refetchIntervalInBackground: true,
  });
  const reportsQ = useQuery({
    queryKey: ["reports"],
    queryFn: fetchReports,
    refetchInterval: LIVE,
    refetchIntervalInBackground: true,
  });

  // Live push channel (SSE). New community reports and incident changes arrive
  // instantly — no waiting for the next poll. EventSource auto-reconnects.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const es = new EventSource("/api/events");
    const markLive = () => setLive(true);
    es.addEventListener("ready", markLive);
    es.onopen = markLive;
    es.onerror = () => setLive(false);
    es.onmessage = (e) => {
      let msg: {
        type: string;
        payload: { category: string; created_at: string };
        at: number;
      };
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.type === "report") {
        // Optimistically fold the pushed report into the chart's data so the
        // bar grows instantly; the next poll reconciles authoritatively.
        queryClient.setQueryData<ReportsPayload>(["reports"], (old) =>
          old?.configured
            ? { ...old, reports: [...old.reports, msg.payload] }
            : old,
        );
        setRecent((r) =>
          [
            {
              id: `${msg.at}-${Math.random()}`,
              category: msg.payload.category,
              at: msg.at,
            },
            ...r,
          ].slice(0, 6),
        );
      } else if (msg.type === "incident") {
        queryClient.invalidateQueries({ queryKey: ["incidents"] });
        queryClient.invalidateQueries({ queryKey: ["status"] });
      }
    };
    return () => es.close();
  }, [queryClient]);

  // Stable reference so derived useMemos don't re-run on every render.
  const services = useMemo(() => status.data?.services ?? [], [status.data]);

  // Reconcile incidents locally for browser notifications + offline fallback.
  const prevRef = useRef<
    { id: string; name: string; status: "online" | "offline" }[] | null
  >(null);
  useEffect(() => {
    if (!status.data) return;
    const next = status.data.services.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
    }));
    const {
      incidents: list,
      newlyDown,
      newlyUp,
    } = reconcileIncidents(prevRef.current, next);
    setLocalIncidents(list);
    const subs = loadSubs();
    if (
      subs.enabled &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      newlyDown
        .filter((s) => subs.serviceIds.includes(s.id))
        .forEach(
          (s) =>
            new Notification("Minecraft service offline", {
              body: `${s.name} just went down.`,
              tag: `down-${s.id}`,
            }),
        );
      newlyUp
        .filter((i) => subs.serviceIds.includes(i.serviceId))
        .forEach(
          (i) =>
            new Notification("Minecraft service recovered", {
              body: `${i.serviceName} is back online after ${formatDuration(i.startedAt, i.resolvedAt)}.`,
              tag: `up-${i.serviceId}`,
            }),
        );
    }
    prevRef.current = next;
  }, [status.data]);

  const incidentsConfigured = incidentsQ.data?.configured ?? false;
  const incidents = incidentsConfigured
    ? (incidentsQ.data?.incidents ?? [])
    : localIncidents;

  const total = services.length;
  const online = services.filter((s) => s.status === "online").length;
  const avgLatency = total
    ? Math.round(services.reduce((a, s) => a + s.latency, 0) / total)
    : 0;
  const overallUptime = total ? (online / total) * 100 : 0;
  const overallLevel: StatusLevel = status.isLoading
    ? "unknown"
    : aggregateLevel(services);
  const openIncidents = incidents.filter((i) => !i.resolvedAt);
  const lastIncident = incidents[0];

  const reportsConfigured = reportsQ.data?.configured ?? false;
  const reportsLastHour = useMemo(() => {
    const data = reportsQ.data?.reports ?? [];
    const cutoff = Date.now() - 3_600_000;
    return data.filter((r) => new Date(r.created_at).getTime() >= cutoff)
      .length;
  }, [reportsQ.data]);

  const submitReport = async (categoryId: string, label: string) => {
    if (Date.now() < cooldownUntil) {
      toast.info(
        `Hold on — you can report again in ${fmtCountdown(cooldownLeft)}.`,
      );
      return;
    }
    // Optimistic local cooldown (server enforces the real 5-minute limit).
    setCooldownUntil(Date.now() + REPORT_COOLDOWN_MS);
    toast.success(`Reported "${label}"`, {
      description: "Thanks for helping the community.",
    });
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: categoryId }),
      });
      if (res.status === 429) {
        const data = (await res.json().catch(() => ({}))) as {
          retryAfterMs?: number;
        };
        const secs = Math.max(
          1,
          Math.ceil((data.retryAfterMs ?? REPORT_COOLDOWN_MS) / 1000),
        );
        setCooldownUntil(Date.now() + secs * 1_000);
        toast.error(`You're reporting too fast — wait ${fmtCountdown(secs)}.`);
        return;
      }
      if (!res.ok) {
        toast.error("Couldn't save your report — try again shortly.");
        return;
      }
      reportsQ.refetch();
    } catch {
      toast.error("Couldn't submit your report");
    }
  };

  const refreshAll = () => {
    status.refetch();
    servers.refetch();
    incidentsQ.refetch();
    reportsQ.refetch();
  };

  const openAlerts = (serviceId?: string) => {
    setPreselect(serviceId ?? null);
    setAlertsOpen(true);
  };

  const q = search.trim().toLowerCase();
  const visibleGroups = useMemo(() => {
    const groups = groupServices(services);
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        services: g.services.filter((s) => s.name.toLowerCase().includes(q)),
      }))
      .filter((g) => g.services.length > 0);
  }, [services, q]);

  return (
    <main className="relative min-h-screen text-ink">
      <div className="app-bg" aria-hidden />
      <div className="app-grid" aria-hidden />

      <Header
        onRefresh={refreshAll}
        refreshing={status.isFetching}
        onAlerts={() => openAlerts()}
        live={live}
        lastUpdated={status.dataUpdatedAt}
      />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line/60">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="grid items-center gap-8 lg:grid-cols-[1.4fr_auto]">
            <div>
              <StatusBanner level={overallLevel} loading={status.isLoading} />
              <h1 className="mt-5 text-balance text-3xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
                <span className="text-gradient-brand">Is Minecraft Down?</span>
                <br />
                <span className="text-ink">Live API &amp; Server Status</span>
              </h1>
              <p className="mt-4 max-w-2xl text-pretty text-sm leading-relaxed text-muted sm:text-base">
                Premium real-time monitoring with{" "}
                <span className="font-semibold text-ink">
                  30 days of uptime history
                </span>
                . Track Minecraft auth servers, Mojang APIs, Java &amp; Bedrock
                Realms and popular servers like Hypixel — refreshed live every 5
                seconds.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <button
                  onClick={() => openAlerts()}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground shadow-sm transition hover:opacity-95 hover:shadow-[0_8px_30px_-8px_var(--glow)]"
                >
                  <Bell className="h-4 w-4" /> Get outage alerts
                </button>
                <a
                  href="#services"
                  className="inline-flex items-center gap-2 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-line-strong"
                >
                  <Layers className="h-4 w-4" /> View all services
                </a>
              </div>

              <dl className="mt-7 grid max-w-lg grid-cols-3 gap-3">
                <HeroStat
                  label="Services up"
                  value={total ? `${online}/${total}` : "—"}
                  tone="success"
                />
                <HeroStat
                  label="Active incidents"
                  value={String(openIncidents.length)}
                  tone={openIncidents.length > 0 ? "warn" : "default"}
                />
                <HeroStat
                  label="Avg response"
                  value={total ? `${avgLatency}ms` : "—"}
                />
              </dl>
            </div>

            <HeroHealth
              level={overallLevel}
              uptime={overallUptime}
              online={online}
              total={total}
              loading={status.isLoading && total === 0}
            />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Overall system health KPIs */}
        <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <KpiCard
            icon={<Server className="h-4 w-4" />}
            label="Monitored Services"
            value={total}
            delay={0}
          />
          <KpiCard
            icon={<Signal className="h-4 w-4" />}
            label="Operational"
            value={online}
            accent="success"
            delay={0.05}
          />
          <KpiCard
            icon={<TriangleAlert className="h-4 w-4" />}
            label="Active Incidents"
            value={openIncidents.length}
            accent={openIncidents.length > 0 ? "warn" : "default"}
            delay={0.1}
          />
          <KpiCard
            icon={<Gauge className="h-4 w-4" />}
            label="Avg Response"
            value={avgLatency}
            suffix="ms"
            sub={
              total
                ? `${overallUptime.toFixed(1)}% systems up`
                : "Awaiting data"
            }
            delay={0.15}
          />
        </section>

        {/* Aggregate uptime & incident metrics */}
        <section className="mt-3">
          <SystemMetrics services={services} incidents={incidents} />
        </section>

        {/* Secondary system stats */}
        <section className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          <MiniStat
            icon={<CalendarClock className="h-4 w-4" />}
            label="Scheduled Maintenance"
            value="None planned"
            tone="muted"
          />
          <MiniStat
            icon={<Zap className="h-4 w-4" />}
            label="Live Connection"
            value={live ? "Connected" : "Reconnecting…"}
            tone={live ? "success" : "muted"}
          />
          <LastIncidentStat
            incident={lastIncident}
            className="col-span-2 lg:col-span-1"
          />
        </section>

        {/* Report an Issue */}
        <Reveal className="mt-8">
          <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 className="text-base font-bold text-ink sm:text-lg">
                Report an Issue
              </h2>
              <span className="text-xs text-muted sm:text-sm">
                — Help the community by reporting problems you're experiencing
              </span>
              {cooling && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted-surface px-2 py-0.5 text-[11px] font-semibold text-muted">
                  <Clock className="h-3 w-3" />
                  Report again in {fmtCountdown(cooldownLeft)}
                </span>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
              {REPORT_CATEGORIES.map((c) => (
                <ReportBtn
                  key={c.id}
                  icon={REPORT_ICONS[c.id]}
                  label={c.label}
                  cooling={cooling}
                  onClick={() => submitReport(c.id, c.label)}
                />
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted">
              To keep data accurate, reports are rate-limited to one every 5
              minutes per person.
            </p>
          </section>
        </Reveal>

        {/* Community Issue Reports */}
        <Reveal className="mt-5">
          <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-base font-bold text-ink sm:text-lg">
                    Community Issue Reports
                  </h2>
                  {live && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success-ink">
                      <Radio className="h-3 w-3" /> Live
                    </span>
                  )}
                </div>
                <BackendBadge
                  live={reportsConfigured}
                  liveLabel={`${reportsLastHour} report${reportsLastHour === 1 ? "" : "s"} in the last hour`}
                  demoLabel="Sample data"
                />
              </div>
              <TfToggle value={communityTf} onChange={setCommunityTf} />
            </div>

            <AnimatePresence>
              {recent.length > 0 && <RecentReportsTicker recent={recent} />}
            </AnimatePresence>

            <div className="mt-4 h-56 sm:h-64">
              <CommunityChart
                tf={communityTf}
                reports={
                  reportsConfigured ? (reportsQ.data?.reports ?? []) : null
                }
                theme={theme}
              />
            </div>
            <Legend />
          </section>
        </Reveal>

        {/* API Status & Uptime Trends */}
        <section id="services" className="mt-12 scroll-mt-20">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
            <div>
              <h2 className="text-lg font-bold text-ink sm:text-2xl">
                API Status &amp; Uptime Trends
              </h2>
              <p className="mt-1 text-sm text-muted">
                Tap any service for latency percentiles and incident history.
              </p>
            </div>
            <SearchBar value={search} onChange={setSearch} />
          </div>

          <StatusLegend className="mt-4" />

          {status.isLoading && services.length === 0 ? (
            <div className="mt-6 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <ServiceSkeleton key={i} />
              ))}
            </div>
          ) : visibleGroups.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-line bg-card p-10 text-center text-sm text-muted">
              No services match “{search}”.
            </div>
          ) : (
            <div className="mt-6 space-y-9">
              {visibleGroups.map((group, gi) => (
                <ServiceGroup
                  key={group.id}
                  group={group}
                  incidents={incidents}
                  theme={theme}
                  checkedAt={status.dataUpdatedAt}
                  onOpen={setDetail}
                  delay={gi * 0.04}
                />
              ))}
            </div>
          )}
        </section>

        {/* Java player counts */}
        <PlayerSection
          title="Minecraft Java Edition Player Counts"
          tf={javaTf}
          onTf={setJavaTf}
          servers={(servers.data?.servers ?? []).filter(
            (s) => s.edition === "java",
          )}
          loading={servers.isLoading}
          theme={theme}
        />

        {/* Bedrock player counts */}
        <PlayerSection
          title="Minecraft Bedrock Edition Player Counts"
          tf={bedrockTf}
          onTf={setBedrockTf}
          servers={(servers.data?.servers ?? []).filter(
            (s) => s.edition === "bedrock",
          )}
          loading={servers.isLoading}
          theme={theme}
        />

        {/* Past incidents grouped by calendar date */}
        <PastIncidents incidents={incidents} />

        {/* Incident Timeline (history at the bottom) */}
        <IncidentTimeline
          incidents={incidents}
          services={services}
          configured={incidentsConfigured}
        />

        <LastUpdated at={status.dataUpdatedAt} />
      </div>

      <AlertsDialog
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        services={services.map((s) => ({ id: s.id, name: s.name }))}
        preselectServiceId={preselect}
      />
      <ServiceDetailModal
        service={detail}
        incidents={incidents}
        onClose={() => setDetail(null)}
        onSubscribe={(id) => {
          setDetail(null);
          openAlerts(id);
        }}
      />
      <Toaster theme={theme} position="bottom-right" richColors />
    </main>
  );
}

/* ---------- Header ---------- */

function Header({
  onRefresh,
  refreshing,
  onAlerts,
  live,
  lastUpdated,
}: {
  onRefresh: () => void;
  refreshing: boolean;
  onAlerts: () => void;
  live: boolean;
  lastUpdated: number;
}) {
  return (
    <header className="glass-strong sticky top-0 z-30 border-b border-line/60">
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-6">
        <a
          href="/"
          className="flex min-w-0 items-center gap-2.5 truncate text-base font-extrabold tracking-tight text-ink"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand to-success text-brand-foreground shadow-[0_6px_20px_-6px_var(--glow)]">
            <Cuboid className="h-5 w-5" />
          </span>
          <span className="truncate">
            Is Minecraft Down?
            <span className="ml-1.5 hidden text-[10px] font-semibold uppercase tracking-wider text-brand sm:inline">
              status
            </span>
          </span>
        </a>
        <nav className="flex shrink-0 items-center gap-1.5 text-sm sm:gap-2">
          <LivePill live={live} />
          <ThemeToggle />
          <button
            onClick={onAlerts}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground transition hover:opacity-95 hover:shadow-[0_8px_24px_-8px_var(--glow)] sm:px-4 sm:text-sm"
          >
            <Bell className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>Follow</span>
          </button>
          <RefreshControl
            lastUpdated={lastUpdated}
            intervalMs={LIVE}
            onRefresh={onRefresh}
            refreshing={refreshing}
          />
        </nav>
      </div>
    </header>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <button
      onClick={toggle}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-muted-surface hover:text-ink"
      aria-label="Toggle theme"
      title="Toggle light / dark"
    >
      {mounted && theme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </button>
  );
}

function LivePill({ live }: { live: boolean }) {
  return (
    <span
      className={cn(
        "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold sm:inline-flex",
        live
          ? "border-success/30 bg-success-bg text-success-ink"
          : "border-line bg-muted-surface text-muted",
      )}
      title={live ? "Live updates connected" : "Reconnecting…"}
    >
      <span className="relative flex h-2 w-2">
        {live && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-70" />
        )}
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            live ? "bg-success" : "bg-muted",
          )}
        />
      </span>
      {live ? "Live" : "Offline"}
    </span>
  );
}

/* ---------- Hero ---------- */

function StatusBanner({
  level,
  loading,
}: {
  level: StatusLevel;
  loading: boolean;
}) {
  const meta = levelMeta(level);
  const label = loading
    ? "Checking services…"
    : level === "operational"
      ? "All systems operational"
      : meta.label;
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn(
        "inline-flex items-center gap-2.5 rounded-full border px-4 py-2 text-sm font-semibold shadow-sm",
        loading ? "border-line bg-card text-muted" : meta.badge,
      )}
    >
      <StatusDot level={loading ? "unknown" : level} pulse={!loading} />
      {label}
    </motion.div>
  );
}

function HeroHealth({
  level,
  uptime,
  online,
  total,
  loading,
}: {
  level: StatusLevel;
  uptime: number;
  online: number;
  total: number;
  loading: boolean;
}) {
  const meta = levelMeta(level);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="glass relative mx-auto w-full max-w-xs rounded-3xl p-6 shadow-[0_20px_60px_-20px_var(--glow)] sm:max-w-sm lg:w-[320px]"
    >
      <div className="flex flex-col items-center">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          Overall System Health
        </span>
        <StatusRing
          percent={loading ? 0 : uptime}
          size={172}
          stroke={12}
          color={meta.color}
          className="mt-4"
        >
          <div className="flex flex-col items-center">
            <span className="text-4xl font-extrabold tabular-nums text-ink">
              {loading ? (
                "—"
              ) : (
                <AnimatedCounter value={uptime} decimals={1} suffix="%" />
              )}
            </span>
            <span className="mt-1 text-[11px] font-medium text-muted">
              systems up
            </span>
          </div>
        </StatusRing>
        <div className="mt-4">
          <StatusBadge level={loading ? "unknown" : level} full />
        </div>
        <div className="mt-4 grid w-full grid-cols-2 gap-2 text-center">
          <div className="rounded-xl border border-line bg-card/60 px-3 py-2">
            <div className="text-lg font-bold tabular-nums text-success-ink">
              {online}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-muted">
              Online
            </div>
          </div>
          <div className="rounded-xl border border-line bg-card/60 px-3 py-2">
            <div className="text-lg font-bold tabular-nums text-ink">
              {total || "—"}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-muted">
              Total
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function HeroStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warn";
}) {
  const valueColor =
    tone === "success"
      ? "text-success-ink"
      : tone === "warn"
        ? "text-warn-ink"
        : "text-ink";
  return (
    <div className="rounded-xl border border-line bg-card/60 px-3 py-2.5">
      <dd className={cn("text-xl font-extrabold tabular-nums", valueColor)}>
        {value}
      </dd>
      <dt className="mt-0.5 text-[11px] font-medium text-muted">{label}</dt>
    </div>
  );
}

/* ---------- Small components ---------- */

function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex w-44 items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 transition focus-within:border-brand sm:w-60">
      <Search className="h-4 w-4 shrink-0 text-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search services…"
        className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
        aria-label="Search services"
      />
    </div>
  );
}

// Stable id per toggle instance so the sliding pill animates within one group.
let _idc = 0;
function useStableId() {
  const ref = useRef<number>(0);
  if (ref.current === 0) ref.current = ++_idc;
  return ref.current;
}

function TfToggle({
  value,
  onChange,
}: {
  value: TimeFrame;
  onChange: (t: TimeFrame) => void;
}) {
  const id = useStableId();
  const opts: TimeFrame[] = ["24H", "7D", "30D"];
  return (
    <div className="inline-flex shrink-0 rounded-lg bg-muted-surface p-0.5">
      {opts.map((o) => {
        const active = o === value;
        return (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={cn(
              "relative rounded-md px-2.5 py-1 text-xs font-semibold transition sm:px-3",
              active ? "text-ink" : "text-muted hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId={`tf-${id}`}
                className="absolute inset-0 rounded-md bg-card shadow-sm"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative">{o}</span>
          </button>
        );
      })}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  suffix,
  accent = "default",
  delay = 0,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  suffix?: string;
  accent?: "default" | "success" | "warn";
  delay?: number;
}) {
  const valueColor =
    accent === "success"
      ? "text-success-ink"
      : accent === "warn"
        ? "text-warn-ink"
        : "text-ink";
  const iconWrap =
    accent === "success"
      ? "bg-success-bg text-success-ink"
      : accent === "warn"
        ? "bg-warn-bg text-warn-ink"
        : "bg-muted-surface text-muted";
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3 }}
      className="rounded-2xl border border-line bg-card p-4 shadow-sm transition hover:border-line-strong hover:shadow-md sm:p-5"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted sm:text-sm">
          {label}
        </span>
        <span
          className={cn("grid h-8 w-8 place-items-center rounded-lg", iconWrap)}
        >
          {icon}
        </span>
      </div>
      <div
        className={cn(
          "mt-2 text-2xl font-extrabold tabular-nums sm:text-3xl",
          valueColor,
        )}
      >
        <AnimatedCounter value={value} suffix={suffix} />
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </motion.div>
  );
}

function MiniStat({
  icon,
  label,
  value,
  tone = "muted",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "muted" | "success";
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4 shadow-sm">
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
          tone === "success"
            ? "bg-success-bg text-success-ink"
            : "bg-muted-surface text-muted",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-xs text-muted">{label}</div>
        <div
          className={cn(
            "truncate text-sm font-bold",
            tone === "success" ? "text-success-ink" : "text-ink",
          )}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function LastIncidentStat({
  incident,
  className,
}: {
  incident?: Incident;
  className?: string;
}) {
  const ongoing = incident && !incident.resolvedAt;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-line bg-card p-4 shadow-sm",
        className,
      )}
    >
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
          ongoing
            ? "bg-warn-bg text-warn-ink"
            : "bg-success-bg text-success-ink",
        )}
      >
        {ongoing ? (
          <AlertTriangle className="h-4 w-4" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}
      </span>
      <div className="min-w-0">
        <div className="text-xs text-muted">Last Incident</div>
        {incident ? (
          <div className="truncate text-sm font-bold text-ink">
            {incident.serviceName}
            <span className="ml-1 font-normal text-muted">
              · {formatTime(incident.startedAt)}
            </span>
          </div>
        ) : (
          <div className="text-sm font-bold text-ink">None on record</div>
        )}
      </div>
    </div>
  );
}

function ReportBtn({
  icon,
  label,
  onClick,
  cooling,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  /**
   * During the cooldown the button stays clickable on purpose: tapping it
   * surfaces the "you can report again in …" notice instead of silently doing
   * nothing. We only dim it and swap the cursor to signal the wait.
   */
  cooling?: boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      aria-disabled={cooling}
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 rounded-xl border border-report-border bg-report-bg px-3 py-3 text-xs font-semibold text-ink transition hover:-translate-y-0.5 hover:bg-report-hover hover:shadow-sm active:translate-y-0 sm:py-4 sm:text-sm",
        cooling && "cursor-not-allowed opacity-50 hover:translate-y-0",
      )}
    >
      <span className="text-danger-ink">{icon}</span>
      <span>{label}</span>
    </motion.button>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted">
      {REPORT_CATEGORIES.map((c) => (
        <span key={c.id} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: c.color }}
          />
          {c.label}
        </span>
      ))}
    </div>
  );
}

function relTime(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function RecentReportsTicker({ recent }: { recent: LiveReport[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="mt-3 flex gap-2 overflow-x-auto rounded-xl border border-line bg-elevated p-2"
    >
      <AnimatePresence initial={false}>
        {recent.map((r) => {
          const cat = REPORT_CATEGORIES.find((c) => c.id === r.category);
          return (
            <motion.span
              key={r.id}
              layout
              initial={{ opacity: 0, x: -12, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-xs font-medium text-ink shadow-sm"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: cat?.color ?? "var(--muted-fg)" }}
              />
              {cat?.label ?? "Report"}
              <span className="text-[10px] text-muted">· {relTime(r.at)}</span>
            </motion.span>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
}

function BackendBadge({
  live,
  liveLabel,
  demoLabel,
}: {
  live: boolean;
  liveLabel: string;
  demoLabel: string;
}) {
  return (
    <span
      className={cn(
        "mt-1 inline-flex items-center gap-1 text-[11px] font-medium",
        live ? "text-success-ink" : "text-muted",
      )}
    >
      <Database className="h-3 w-3" />
      {live ? liveLabel : demoLabel}
    </span>
  );
}

/* ---------- Incident timeline ---------- */

function IncidentTimeline({
  incidents,
  services,
  configured,
}: {
  incidents: Incident[];
  services: ApiService[];
  configured: boolean;
}) {
  const open = incidents.filter((i) => !i.resolvedAt);
  const recent = incidents.slice(0, 8);
  const hasData = services.length > 0 || incidents.length > 0;

  return (
    <section className="mt-12">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-ink sm:text-2xl">
            Incident Timeline
          </h2>
          <BackendBadge
            live={configured}
            liveLabel="Synced via Supabase"
            demoLabel="This device only"
          />
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
            open.length > 0
              ? "bg-warn-bg text-warn-ink"
              : "bg-success-bg text-success-ink",
          )}
        >
          {open.length > 0 ? `${open.length} ongoing` : "All clear"}
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
        {!hasData ? (
          <div className="p-8 text-center text-sm text-muted">
            Loading service status…
          </div>
        ) : recent.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-success-bg">
              <CheckCircle2 className="h-7 w-7 text-success-ink" />
            </span>
            <p className="text-sm font-semibold text-ink">
              No incidents recorded yet.
            </p>
            <p className="text-xs text-muted">
              {configured
                ? "Outages detected by our probe will appear here."
                : "We'll log any outage detected while this page is open."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((i) => (
              <IncidentRow key={i.id} incident={i} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function IncidentRow({ incident: i }: { incident: Incident }) {
  const [open, setOpen] = useState(false);
  const ongoing = !i.resolvedAt;
  return (
    <li>
      <button
        onClick={() => setOpen((o) => !o)}
        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4 text-left transition hover:bg-muted-surface/40 sm:gap-4"
      >
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-full",
            ongoing
              ? "bg-warn-bg text-warn-ink"
              : "bg-success-bg text-success-ink",
          )}
        >
          {ongoing ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink">
            {i.serviceName}
            <StatusBadge level={ongoing ? "major" : "operational"} />
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            <Clock className="h-3 w-3 shrink-0" />
            <span>{formatTime(i.startedAt)}</span>
            {i.resolvedAt && <span>→ {formatTime(i.resolvedAt)}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 text-right">
          <div>
            <div
              className={cn(
                "text-xs font-semibold",
                ongoing ? "text-warn-ink" : "text-success-ink",
              )}
            >
              {ongoing ? "Ongoing" : "Resolved"}
            </div>
            <div className="text-[11px] tabular-nums text-muted">
              {formatDuration(i.startedAt, i.resolvedAt)}
            </div>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted transition",
              open && "rotate-180",
            )}
          />
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-line bg-elevated/50 px-4 py-4 sm:px-16">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-4">
                <Field label="Severity">
                  <StatusBadge level={ongoing ? "major" : "operational"} />
                </Field>
                <Field label="Services Affected">{i.serviceName}</Field>
                <Field label="Started">{formatTime(i.startedAt)}</Field>
                <Field label="Duration">
                  {formatDuration(i.startedAt, i.resolvedAt)}
                </Field>
              </dl>
              <div className="mt-4">
                <span className="text-xs font-semibold text-muted">
                  Updates
                </span>
                <ol className="mt-2 space-y-3 border-l border-line pl-4">
                  {i.resolvedAt && (
                    <TimelineUpdate
                      tone="success"
                      title="Resolved"
                      time={formatTime(i.resolvedAt)}
                      body={`${i.serviceName} recovered and is responding normally again.`}
                    />
                  )}
                  <TimelineUpdate
                    tone={ongoing ? "warn" : "muted"}
                    title={ongoing ? "Investigating" : "Identified"}
                    time={formatTime(i.startedAt)}
                    body={`Automated probe detected ${i.serviceName} was unreachable and opened this incident.`}
                  />
                </ol>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-1 font-semibold text-ink">{children}</dd>
    </div>
  );
}

function TimelineUpdate({
  tone,
  title,
  time,
  body,
}: {
  tone: "success" | "warn" | "muted";
  title: string;
  time: string;
  body: string;
}) {
  const dot =
    tone === "success"
      ? "bg-success"
      : tone === "warn"
        ? "bg-warn"
        : "bg-muted";
  return (
    <li className="relative">
      <span
        className={cn(
          "absolute -left-[1.39rem] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-elevated",
          dot,
        )}
      />
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-xs font-bold text-ink">{title}</span>
        <span className="text-[11px] text-muted">{time}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted">{body}</p>
    </li>
  );
}

/* ---------- Service group ---------- */

function ServiceGroup({
  group,
  incidents,
  theme,
  checkedAt,
  onOpen,
  delay,
}: {
  group: ServiceGroupData;
  incidents: Incident[];
  theme: "light" | "dark";
  checkedAt: number;
  onOpen: (svc: ApiService) => void;
  delay: number;
}) {
  const level = aggregateLevel(group.services);
  const down = group.services.filter((s) => s.status === "offline").length;
  return (
    <Reveal delay={delay}>
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted-surface text-muted">
              {group.icon}
            </span>
            <h3 className="truncate text-sm font-bold text-ink sm:text-base">
              {group.label}
            </h3>
            <span className="shrink-0 rounded-full bg-muted-surface px-1.5 text-[11px] font-semibold text-muted">
              {group.services.length}
            </span>
          </div>
          <StatusBadge level={level} />
          <span className="sr-only">{down} down</span>
        </div>
        <div className="space-y-3">
          {group.services.map((svc) => (
            <ServiceCard
              key={svc.id}
              service={svc}
              incidents={incidents}
              theme={theme}
              checkedAt={checkedAt}
              onOpen={() => onOpen(svc)}
            />
          ))}
        </div>
      </div>
    </Reveal>
  );
}

/* ---------- Service card ---------- */

function ServiceCard({
  service,
  incidents,
  theme,
  checkedAt,
  onOpen,
}: {
  service: ApiService;
  incidents: Incident[];
  theme: "light" | "dark";
  checkedAt: number;
  onOpen: () => void;
}) {
  const [tf, setTf] = useState<TimeFrame>("24H");
  const palette = chartPalette(theme);
  const stats = useMemo(
    () => synthLatencyStats(service),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [service.id, service.latency],
  );
  const history = useMemo(
    () => synthUptimeSeries(service, tf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [service.id, service.status, tf],
  );
  const level = serviceLevel(service);
  const meta = levelMeta(level);
  const isOnline = service.status === "online";
  const openInc = incidents.find(
    (i) => i.serviceId === service.id && !i.resolvedAt,
  );

  return (
    <motion.article
      onClick={onOpen}
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className="group cursor-pointer overflow-hidden rounded-2xl border border-line bg-card p-4 shadow-sm transition hover:border-line-strong hover:shadow-[0_14px_40px_-18px_var(--glow)] sm:p-5"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
              meta.badge,
            )}
          >
            {serviceIcon(service.id)}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-ink sm:text-base">
                {service.name}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
              <StatusDot level={level} size={7} />
              <span className="inline-flex items-center gap-1">
                <Globe className="h-3 w-3" /> Global
              </span>
              <span className="tabular-nums">
                · checked {relTime(checkedAt)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs">
          <span className="hidden rounded-full border border-line bg-canvas px-2 py-0.5 tabular-nums text-muted sm:inline">
            {service.httpStatus || "—"}
          </span>
          <span className="tabular-nums text-muted">{service.latency}ms</span>
          <StatusBadge level={level} />
        </div>
      </div>

      <div
        className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <StatusRing
          percent={history.uptime}
          size={64}
          stroke={6}
          color={meta.color}
          glow={false}
        >
          <span className="text-xs font-bold tabular-nums text-ink">
            {history.uptime.toFixed(1)}
            <span className="text-[8px] text-muted">%</span>
          </span>
        </StatusRing>

        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <TfToggle value={tf} onChange={setTf} />
            <span className="text-[11px] font-medium text-muted">
              {tf} uptime
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
            <span>
              p50 <span className="font-semibold text-ink">{stats.p50}ms</span>
            </span>
            <span>
              p95 <span className="font-semibold text-ink">{stats.p95}ms</span>
            </span>
            <span>
              p99 <span className="font-semibold text-ink">{stats.p99}ms</span>
            </span>
          </div>
        </div>
      </div>

      <div
        className="mt-3 h-14 w-full overflow-hidden rounded-lg sm:h-16"
        onClick={(e) => e.stopPropagation()}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={history.points}
            margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient
                id={`g-${service.id}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={isOnline ? palette.upFill : palette.cursor}
                  stopOpacity={0.6}
                />
                <stop
                  offset="100%"
                  stopColor={isOnline ? palette.upFill : palette.cursor}
                  stopOpacity={0.05}
                />
              </linearGradient>
            </defs>
            <YAxis domain={[0, 100]} hide />
            <Tooltip
              cursor={{ stroke: palette.cursor, strokeDasharray: "3 3" }}
              contentStyle={{
                borderRadius: 10,
                border: `1px solid ${palette.tooltipBorder}`,
                background: palette.tooltipBg,
                color: palette.tooltipText,
                fontSize: 12,
              }}
              formatter={(v: number) => [`${v}%`, "uptime"]}
              labelFormatter={(l) => l || ""}
            />
            <Area
              type="monotone"
              dataKey="v"
              stroke={isOnline ? palette.up : palette.cursor}
              strokeWidth={1.5}
              fill={`url(#g-${service.id})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div
        className="mt-4 border-t border-line pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <UptimeBars service={service} />
      </div>

      {openInc && (
        <div
          className="mt-3 flex items-start gap-2 rounded-lg bg-warn-bg p-2.5 text-xs text-warn-ink"
          onClick={(e) => e.stopPropagation()}
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            Ongoing incident — started {formatTime(openInc.startedAt)} (
            {formatDuration(openInc.startedAt)})
          </span>
        </div>
      )}
    </motion.article>
  );
}

function ServiceSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card p-5">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-muted-surface shimmer" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-1/3 rounded bg-muted-surface shimmer" />
          <div className="h-2.5 w-1/4 rounded bg-muted-surface shimmer" />
        </div>
        <div className="h-6 w-20 rounded-full bg-muted-surface shimmer" />
      </div>
      <div className="mt-4 h-14 rounded-lg bg-muted-surface shimmer" />
    </div>
  );
}

/* ---------- Community chart ---------- */

function synthCommunityBuckets(tf: TimeFrame): ReportBucket[] {
  const { n, labelEvery, mkLabel } = tfPoints(tf);
  const r = rand(hash("community" + tf));
  return Array.from({ length: n }, (_, i) => {
    const trend = Math.pow(i / n, 3);
    const base = trend * 50;
    const noise = r() * 10;
    const row: ReportBucket = {
      t: i % labelEvery === 0 ? mkLabel(i, n) : "",
      total: 0,
      login: Math.round(base * 0.45 + noise * 0.4),
      realms: Math.round(base * 0.15 + r() * 4),
      launch: Math.round(base * 0.25 + r() * 6),
      multi: Math.round(base * 0.1 + r() * 3),
      other: Math.round(base * 0.05 + r() * 2),
    };
    return row;
  });
}

function CommunityChart({
  tf,
  reports,
  theme,
}: {
  tf: TimeFrame;
  reports: RawReport[] | null;
  theme: "light" | "dark";
}) {
  const palette = chartPalette(theme);
  const data = useMemo(
    () => (reports ? bucketReports(reports, tf) : synthCommunityBuckets(tf)),
    [reports, tf],
  );
  const empty = reports !== null && totalReports(data) === 0;

  if (empty) {
    return (
      <div className="grid h-full place-items-center rounded-xl border border-dashed border-line text-center">
        <div className="px-6">
          <p className="text-sm font-medium text-ink">
            No community reports in this window.
          </p>
          <p className="mt-1 text-xs text-muted">
            Be the first to report an issue above.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}>
        <CartesianGrid
          stroke={palette.grid}
          vertical={false}
          strokeDasharray="2 3"
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
          width={32}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ fill: palette.cursor, opacity: 0.4 }}
          contentStyle={{
            borderRadius: 10,
            border: `1px solid ${palette.tooltipBorder}`,
            background: palette.tooltipBg,
            fontSize: 12,
            color: palette.tooltipText,
          }}
        />
        {REPORT_CATEGORIES.map((c, i) => (
          <Bar
            key={c.id}
            dataKey={c.id}
            name={c.label}
            stackId="a"
            fill={c.color}
            radius={
              i === REPORT_CATEGORIES.length - 1 ? [3, 3, 0, 0] : undefined
            }
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ---------- Player counts ---------- */

function PlayerSection({
  title,
  tf,
  onTf,
  servers,
  loading,
  theme,
}: {
  title: string;
  tf: TimeFrame;
  onTf: (t: TimeFrame) => void;
  servers: ServerEntry[];
  loading: boolean;
  theme: "light" | "dark";
}) {
  return (
    <section className="mt-12">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h2 className="truncate text-lg font-bold text-ink sm:text-2xl">
          {title}
        </h2>
        <TfToggle value={tf} onChange={onTf} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {servers.map((s, i) => (
          <Reveal key={s.id} delay={i * 0.05}>
            <ServerCard server={s} tf={tf} theme={theme} />
          </Reveal>
        ))}
        {loading &&
          Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-72 rounded-2xl border border-line bg-card shimmer"
            />
          ))}
      </div>
    </section>
  );
}

function ServerCard({
  server,
  tf,
  theme,
}: {
  server: ServerEntry;
  tf: TimeFrame;
  theme: "light" | "dark";
}) {
  const palette = chartPalette(theme);
  const data = useMemo(() => {
    const { n, labelEvery, mkLabel } = tfPoints(tf);
    const r = rand(hash(server.id + tf));
    const peak = Math.max(server.players * 1.4, server.max * 0.4, 1000);
    return Array.from({ length: n }, (_, i) => {
      const x = i / (n - 1);
      const curve = Math.sin(x * Math.PI * 0.9 + 0.4);
      const noise = (r() - 0.5) * 0.1;
      const v = Math.max(0, Math.round((0.4 + curve * 0.55 + noise) * peak));
      return { t: i % labelEvery === 0 ? mkLabel(i, n) : "", v };
    });
  }, [server.id, server.players, server.max, tf]);

  const peakVal = Math.max(...data.map((d) => d.v));
  const avg = Math.round(data.reduce((a, d) => a + d.v, 0) / data.length);

  return (
    <motion.article
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className="rounded-2xl border border-line bg-card p-4 shadow-sm transition hover:border-line-strong hover:shadow-[0_14px_40px_-18px_var(--glow)] sm:p-5"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <div className="truncate text-base font-bold text-ink sm:text-lg">
            {server.name}
          </div>
          <div className="mt-0.5 truncate text-xs text-link sm:text-sm">
            {server.host}
          </div>
        </div>
        <StatusBadge level={server.online ? "operational" : "major"} />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm">
        <span className="text-muted">
          Players:{" "}
          <span className="font-bold tabular-nums text-ink">
            {server.players}/{server.max || "—"}
          </span>
        </span>
        <span className="text-muted">
          Avg: <span className="font-bold tabular-nums text-ink">{avg}</span>
        </span>
        <span className="text-muted">
          Peak:{" "}
          <span className="font-bold tabular-nums text-ink">{peakVal}</span>
        </span>
      </div>

      <div className="mt-4 h-40 w-full sm:h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 4, bottom: 0, left: -12 }}
          >
            <defs>
              <linearGradient
                id={`sg-${server.id}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={palette.players}
                  stopOpacity={0.6}
                />
                <stop
                  offset="100%"
                  stopColor={palette.players}
                  stopOpacity={0.05}
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
            />
            <Tooltip
              cursor={{ stroke: palette.cursor, strokeDasharray: "3 3" }}
              contentStyle={{
                borderRadius: 10,
                border: `1px solid ${palette.tooltipBorder}`,
                background: palette.tooltipBg,
                fontSize: 12,
                color: palette.tooltipText,
              }}
              formatter={(v: number) => [v.toLocaleString(), "players"]}
            />
            <Area
              type="monotone"
              dataKey="v"
              stroke={palette.players}
              strokeWidth={1.5}
              fill={`url(#sg-${server.id})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.article>
  );
}

/* ---------- Footer ---------- */

function LastUpdated({ at }: { at: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const time = at ? new Date(at).toLocaleTimeString() : "—";
  return (
    <footer className="mt-14 pb-12 text-center text-xs text-muted sm:text-sm">
      <div className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
        </span>
        Last updated: {time} · Live — refreshes every 5s
      </div>
    </footer>
  );
}
