import { createFileRoute } from "@tanstack/react-router";
import { listIncidents, supabaseConfigured } from "@/lib/supabase";

export const Route = createFileRoute("/api/incidents")({
  server: {
    handlers: {
      GET: async () => {
        if (!supabaseConfigured()) {
          return Response.json(
            { configured: false, incidents: [] },
            { headers: { "Cache-Control": "no-store" } },
          );
        }
        try {
          const rows = await listIncidents(25);
          const incidents = rows.map((r) => ({
            id: r.id,
            serviceId: r.service_id,
            serviceName: r.service_name,
            startedAt: r.started_at,
            resolvedAt: r.resolved_at ?? undefined,
          }));
          return Response.json(
            { configured: true, incidents },
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch (err) {
          console.error("GET /api/incidents failed", err);
          return Response.json(
            { configured: true, incidents: [], error: true },
            { status: 200 },
          );
        }
      },
    },
  },
});
