import { createFileRoute } from "@tanstack/react-router";
import { subscribe } from "@/lib/events";

// Server-Sent Events stream. Browsers connect with EventSource("/api/events")
// and receive pushed "report" / "incident" messages the instant they happen —
// no polling, websocket-style liveness.
export const Route = createFileRoute("/api/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const encoder = new TextEncoder();
        let cleanup = () => {};

        const stream = new ReadableStream({
          start(controller) {
            let open = true;
            const refs: {
              hb: ReturnType<typeof setInterval> | null;
              unsub: () => void;
            } = { hb: null, unsub: () => {} };

            const close = () => {
              if (!open) return;
              open = false;
              if (refs.hb) clearInterval(refs.hb);
              refs.unsub();
              try {
                controller.close();
              } catch {
                /* already closed */
              }
            };

            const safeEnqueue = (s: string) => {
              if (!open) return;
              try {
                controller.enqueue(encoder.encode(s));
              } catch {
                close();
              }
            };

            // Tell the client how soon to reconnect, then announce readiness.
            safeEnqueue("retry: 3000\nevent: ready\ndata: {}\n\n");
            refs.unsub = subscribe((data) => safeEnqueue(`data: ${data}\n\n`));
            // Heartbeat comment keeps proxies from closing the idle connection.
            refs.hb = setInterval(() => safeEnqueue(": ping\n\n"), 25_000);

            cleanup = close;
            request.signal?.addEventListener("abort", close);
          },
          cancel() {
            cleanup();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-store, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
