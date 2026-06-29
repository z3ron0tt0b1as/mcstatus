/**
 * Tiny in-process pub/sub used to push live updates to connected browsers over
 * Server-Sent Events (see src/routes/api/events.ts). Server-only.
 *
 * Single-instance only: events are broadcast to clients connected to *this*
 * process. For a multi-instance deployment, back this with Supabase Realtime or
 * a shared bus (Redis pub/sub) instead.
 */

type Listener = (sseData: string) => void;

const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function broadcast(type: string, payload: unknown): void {
  const data = JSON.stringify({ type, payload, at: Date.now() });
  for (const fn of [...listeners]) {
    try {
      fn(data);
    } catch {
      /* a dead listener will be cleaned up on its own stream cancel */
    }
  }
}

export function emitReport(payload: {
  category: string;
  created_at: string;
}): void {
  broadcast("report", payload);
}

export function emitIncident(payload: {
  action: "open" | "resolve";
  serviceId: string;
  serviceName: string;
}): void {
  broadcast("incident", payload);
}

export function listenerCount(): number {
  return listeners.size;
}
