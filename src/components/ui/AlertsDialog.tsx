import { useEffect, useState } from "react";
import { X, Bell, Mail, Check } from "lucide-react";
import { loadSubs, saveSubs, type Subscriptions } from "@/lib/incidents";

export function AlertsDialog({
  open,
  onClose,
  services,
}: {
  open: boolean;
  onClose: () => void;
  services: { id: string; name: string }[];
}) {
  const [subs, setSubs] = useState<Subscriptions>({
    enabled: false,
    serviceIds: [],
  });
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubs(loadSubs());
    if (typeof Notification === "undefined") setPermission("unsupported");
    else setPermission(Notification.permission);
    setSaved(false);
  }, [open]);

  if (!open) return null;

  const toggle = (id: string) =>
    setSubs((s) => ({
      ...s,
      serviceIds: s.serviceIds.includes(id)
        ? s.serviceIds.filter((x) => x !== id)
        : [...s.serviceIds, id],
    }));

  const requestNotif = async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setPermission(p);
  };

  const allSelected = subs.serviceIds.length === services.length;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-line bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line p-5">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-brand" />
            <h3 className="text-base font-bold text-ink">Outage Alerts</h3>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-muted-surface hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <section>
            <h4 className="text-sm font-semibold text-ink">
              Browser notifications
            </h4>
            <p className="mt-1 text-xs text-muted">
              Get an instant desktop alert when a subscribed service goes
              offline while this tab is open.
            </p>
            {permission === "unsupported" ? (
              <p className="mt-3 text-xs text-warn-ink">
                Your browser doesn't support notifications.
              </p>
            ) : permission === "granted" ? (
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-success-ink">
                <Check className="h-3.5 w-3.5" /> Notifications enabled
              </p>
            ) : (
              <button
                onClick={requestNotif}
                className="mt-3 inline-flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-xs font-semibold text-brand-foreground hover:opacity-95"
              >
                <Bell className="h-3.5 w-3.5" /> Enable browser notifications
              </button>
            )}
          </section>

          <section>
            <h4 className="text-sm font-semibold text-ink">Email (optional)</h4>
            <div className="mt-2 flex items-center gap-2 rounded-md border border-line bg-canvas px-3 py-2">
              <Mail className="h-4 w-4 text-muted" />
              <input
                type="email"
                value={subs.email ?? ""}
                onChange={(e) =>
                  setSubs((s) => ({ ...s, email: e.target.value }))
                }
                placeholder="you@example.com"
                className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
              />
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Stored locally on this device. Connect a backend to send real
              email alerts.
            </p>
          </section>

          <section>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-ink">
                Services to monitor
              </h4>
              <button
                onClick={() =>
                  setSubs((s) => ({
                    ...s,
                    serviceIds: allSelected ? [] : services.map((x) => x.id),
                  }))
                }
                className="text-xs font-medium text-brand hover:underline"
              >
                {allSelected ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-md border border-line bg-canvas p-2">
              {services.map((s) => {
                const checked = subs.serviceIds.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-ink hover:bg-muted-surface"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(s.id)}
                      className="h-4 w-4 accent-brand"
                    />
                    <span className="truncate">{s.name}</span>
                  </label>
                );
              })}
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line p-4">
          <span className="text-xs text-muted">
            {saved
              ? "Saved"
              : `${subs.serviceIds.length} service${subs.serviceIds.length === 1 ? "" : "s"} selected`}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-line bg-canvas px-3 py-1.5 text-sm font-medium text-ink hover:bg-muted-surface"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                saveSubs({ ...subs, enabled: subs.serviceIds.length > 0 });
                setSaved(true);
                setTimeout(onClose, 600);
              }}
              className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground hover:opacity-95"
            >
              Save preferences
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
