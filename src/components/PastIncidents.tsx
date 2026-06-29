import { useMemo } from "react";
import { CheckCircle2 } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDuration, type Incident } from "@/lib/incidents";
import { cn } from "@/lib/utils";

type DayGroup = {
  key: string;
  label: string;
  incidents: Incident[];
};

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Statuspage-style "Past Incidents" feed: a day-by-day calendar where each date
 * shows its incidents (or an all-clear note). Defaults to the last 14 days.
 */
export function PastIncidents({
  incidents,
  days = 14,
}: {
  incidents: Incident[];
  days?: number;
}) {
  const groups = useMemo<DayGroup[]>(() => {
    const byDay = new Map<string, Incident[]>();
    for (const i of incidents) {
      const k = dayKey(new Date(i.startedAt));
      const arr = byDay.get(k);
      if (arr) arr.push(i);
      else byDay.set(k, [i]);
    }
    const out: DayGroup[] = [];
    for (let n = 0; n < days; n++) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - n);
      const k = dayKey(d);
      out.push({
        key: k,
        label: d.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        incidents: (byDay.get(k) ?? []).sort(
          (a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
        ),
      });
    }
    return out;
  }, [incidents, days]);

  return (
    <section className="mt-12">
      <h2 className="text-lg font-bold text-ink sm:text-2xl">Past Incidents</h2>
      <p className="mt-1 text-sm text-muted">
        Day-by-day history of detected outages over the last {days} days.
      </p>

      <div className="mt-5 space-y-5">
        {groups.map((g) => (
          <div
            key={g.key}
            className="border-b border-line pb-5 last:border-b-0 last:pb-0"
          >
            <h3 className="text-sm font-semibold text-ink">{g.label}</h3>
            {g.incidents.length === 0 ? (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                <CheckCircle2 className="h-3.5 w-3.5 text-success-ink" />
                No incidents reported.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {g.incidents.map((i) => {
                  const ongoing = !i.resolvedAt;
                  return (
                    <li
                      key={i.id}
                      className="rounded-xl border border-line bg-card p-3.5 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink">
                          {i.serviceName} outage
                        </span>
                        <StatusBadge
                          level={ongoing ? "major" : "operational"}
                        />
                        <span
                          className={cn(
                            "ml-auto text-xs font-semibold tabular-nums",
                            ongoing ? "text-warn-ink" : "text-muted",
                          )}
                        >
                          {ongoing
                            ? `Ongoing · ${formatDuration(i.startedAt)}`
                            : `Resolved · ${formatDuration(i.startedAt, i.resolvedAt)}`}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-muted">
                        {ongoing
                          ? `Automated probe detected ${i.serviceName} was unreachable. We're monitoring recovery.`
                          : `${i.serviceName} was unreachable and has since recovered.`}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
