/**
 * Minimal server-side Supabase client built on the PostgREST endpoint.
 *
 * We deliberately avoid the @supabase/supabase-js dependency and talk to the
 * REST API with `fetch` + the service-role key. This file must only ever be
 * imported from server route handlers — the service-role key must never reach
 * the browser bundle.
 */

const RAW_URL = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

export function supabaseConfigured(): boolean {
  return Boolean(RAW_URL && KEY);
}

type SbInit = Omit<RequestInit, "headers"> & {
  prefer?: string;
  headers?: Record<string, string>;
};

async function sb<T = unknown>(
  path: string,
  init: SbInit = {},
): Promise<T | null> {
  if (!RAW_URL || !KEY) throw new Error("Supabase is not configured");
  const { prefer, headers, ...rest } = init;
  const res = await fetch(`${RAW_URL}/rest/v1/${path}`, {
    ...rest,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
      ...headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Supabase ${res.status} on ${path}: ${body}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : null;
}

/* -------------------------------------------------------------------------- */
/*  Incidents                                                                 */
/* -------------------------------------------------------------------------- */

export type DbIncident = {
  id: string;
  service_id: string;
  service_name: string;
  started_at: string;
  resolved_at: string | null;
};

export function listIncidents(limit = 25): Promise<DbIncident[]> {
  return sb<DbIncident[]>(
    `incidents?select=*&order=started_at.desc&limit=${limit}`,
  ).then((r) => r ?? []);
}

export function listOpenIncidents(): Promise<DbIncident[]> {
  return sb<DbIncident[]>(`incidents?select=*&resolved_at=is.null`).then(
    (r) => r ?? [],
  );
}

export function createIncident(
  serviceId: string,
  serviceName: string,
): Promise<DbIncident[] | null> {
  return sb<DbIncident[]>(`incidents`, {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify({
      service_id: serviceId,
      service_name: serviceName,
      started_at: new Date().toISOString(),
    }),
  });
}

export function resolveIncident(id: string): Promise<unknown> {
  return sb(`incidents?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ resolved_at: new Date().toISOString() }),
  });
}

/* -------------------------------------------------------------------------- */
/*  Community reports                                                         */
/* -------------------------------------------------------------------------- */

export type DbReport = { category: string; created_at: string };

export function createReport(
  category: string,
  serviceId?: string | null,
): Promise<unknown> {
  return sb(`reports`, {
    method: "POST",
    body: JSON.stringify({ category, service_id: serviceId ?? null }),
  });
}

export function listReports(sinceISO: string): Promise<DbReport[]> {
  return sb<DbReport[]>(
    `reports?select=category,created_at&created_at=gte.${sinceISO}&order=created_at.asc&limit=10000`,
  ).then((r) => r ?? []);
}

/* -------------------------------------------------------------------------- */
/*  Subscriptions                                                            */
/* -------------------------------------------------------------------------- */

export type DbSubscription = { email: string; service_ids: string[] };

export function upsertSubscription(
  email: string,
  serviceIds: string[],
): Promise<unknown> {
  return sb(`subscriptions?on_conflict=email`, {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify({
      email,
      service_ids: serviceIds,
      enabled: serviceIds.length > 0,
      updated_at: new Date().toISOString(),
    }),
  });
}

export function subscribersForService(
  serviceId: string,
): Promise<DbSubscription[]> {
  return sb<DbSubscription[]>(
    `subscriptions?select=email,service_ids&enabled=is.true&service_ids=cs.{${serviceId}}`,
  ).then((r) => r ?? []);
}

/**
 * Turn off all alerts for an email (one-click unsubscribe). Keeps the row and
 * its service selection so the user can re-enable later — we only flip
 * `enabled` off, which `subscribersForService` already filters on.
 */
export function unsubscribeEmail(email: string): Promise<unknown> {
  return sb(`subscriptions?email=eq.${encodeURIComponent(email)}`, {
    method: "PATCH",
    body: JSON.stringify({
      enabled: false,
      updated_at: new Date().toISOString(),
    }),
  });
}
