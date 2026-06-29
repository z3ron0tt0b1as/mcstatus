import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bell, Mail, Check, Loader2, ServerCog } from "lucide-react";
import { loadSubs, saveSubs, type Subscriptions } from "@/lib/incidents";

type SaveState = "idle" | "saving" | "saved" | "error";

export function AlertsDialog({
  open,
  onClose,
  services,
  preselectServiceId,
}: {
  open: boolean;
  onClose: () => void;
  services: { id: string; name: string }[];
  preselectServiceId?: string | null;
}) {
  const [subs, setSubs] = useState<Subscriptions>({
    enabled: false,
    serviceIds: [],
  });
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [backend, setBackend] = useState<{
    supabase: boolean;
    email: boolean;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    const loaded = loadSubs();
    if (preselectServiceId && !loaded.serviceIds.includes(preselectServiceId)) {
      loaded.serviceIds = [...loaded.serviceIds, preselectServiceId];
    }
    setSubs(loaded);
    if (typeof Notification === "undefined") setPermission("unsupported");
    else setPermission(Notification.permission);
    setSaveState("idle");

    fetch("/api/subscribe")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (d) => d && setBackend({ supabase: !!d.supabase, email: !!d.email }),
      )
      .catch(() => setBackend(null));
  }, [open, preselectServiceId]);

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

  const allSelected =
    subs.serviceIds.length === services.length && services.length > 0;
  const emailValid =
    !subs.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subs.email);

  const save = async () => {
    const next = { ...subs, enabled: subs.serviceIds.length > 0 };
    saveSubs(next);
    setSaveState("saving");
    try {
      if (next.email && emailValid) {
        const res = await fetch("/api/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: next.email,
            serviceIds: next.serviceIds,
          }),
        });
        if (!res.ok) throw new Error("subscribe failed");
      }
      setSaveState("saved");
      setTimeout(onClose, 700);
    } catch {
      setSaveState("error");
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 grid place-items-end bg-[oklch(0.1_0.02_200_/_0.6)] p-0 backdrop-blur-md sm:place-items-center sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="glass flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl shadow-2xl sm:rounded-3xl"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between border-b border-line bg-elevated p-5">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-soft text-brand">
                  <Bell className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-ink">
                    Outage Alerts
                  </h3>
                  <p className="text-xs text-muted">
                    Know the moment something breaks.
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-muted-surface hover:text-ink"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="scrollbar-thin min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              <section>
                <h4 className="text-sm font-semibold text-ink">
                  Browser notifications
                </h4>
                <p className="mt-1 text-xs text-muted">
                  Instant desktop alert when a subscribed service goes offline
                  while this tab is open.
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
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-brand-foreground hover:opacity-95"
                  >
                    <Bell className="h-3.5 w-3.5" /> Enable browser
                    notifications
                  </button>
                )}
              </section>

              <section>
                <h4 className="text-sm font-semibold text-ink">Email alerts</h4>
                <div
                  className={`mt-2 flex items-center gap-2 rounded-lg border bg-canvas px-3 py-2 ${
                    emailValid ? "border-line" : "border-danger"
                  }`}
                >
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
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
                  {backend?.email ? (
                    <>
                      <ServerCog className="h-3 w-3 text-success" />
                      We'll send a confirmation email, then alert you whenever a
                      selected service goes down or recovers.
                    </>
                  ) : backend?.supabase ? (
                    <>
                      <ServerCog className="h-3 w-3" />
                      Saved to the server. Email delivery isn't configured yet.
                    </>
                  ) : (
                    <>
                      Stored on this device. Add Supabase + Resend keys to send
                      real email.
                    </>
                  )}
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
                        serviceIds: allSelected
                          ? []
                          : services.map((x) => x.id),
                      }))
                    }
                    className="text-xs font-semibold text-brand hover:underline"
                  >
                    {allSelected ? "Clear all" : "Select all"}
                  </button>
                </div>
                <div className="scrollbar-thin mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-line bg-canvas p-2">
                  {services.length === 0 && (
                    <p className="px-2 py-4 text-center text-xs text-muted">
                      Loading services…
                    </p>
                  )}
                  {services.map((s) => {
                    const checked = subs.serviceIds.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink hover:bg-muted-surface"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(s.id)}
                          className="h-4 w-4 accent-[var(--brand)]"
                        />
                        <span className="truncate">{s.name}</span>
                      </label>
                    );
                  })}
                </div>
              </section>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-line bg-elevated p-4">
              <span className="text-xs text-muted">
                {saveState === "error"
                  ? "Couldn't save — try again"
                  : `${subs.serviceIds.length} service${subs.serviceIds.length === 1 ? "" : "s"} selected`}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="rounded-lg border border-line bg-canvas px-3 py-1.5 text-sm font-medium text-ink hover:bg-muted-surface"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={saveState === "saving" || !emailValid}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-sm font-semibold text-brand-foreground hover:opacity-95 disabled:opacity-60"
                >
                  {saveState === "saving" && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  {saveState === "saved" && <Check className="h-3.5 w-3.5" />}
                  {saveState === "saved" ? "Saved" : "Save preferences"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
