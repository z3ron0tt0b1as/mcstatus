-- ============================================================================
--  Is Minecraft Down? — Supabase schema
--  Run this in the Supabase SQL editor (or `supabase db push`) to create the
--  tables that back the incident timeline, community outage reports and email
--  outage subscriptions.
-- ============================================================================

-- Outages detected by the server-side probe (/api/status reconciles these).
create table if not exists public.incidents (
  id           uuid primary key default gen_random_uuid(),
  service_id   text        not null,
  service_name text        not null,
  started_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

create index if not exists incidents_open_idx
  on public.incidents (service_id) where resolved_at is null;
create index if not exists incidents_started_idx
  on public.incidents (started_at desc);

-- Community-submitted issue reports ("Login Issues", "Realms Down", ...).
create table if not exists public.reports (
  id         uuid primary key default gen_random_uuid(),
  category   text        not null,
  service_id text,
  created_at timestamptz not null default now()
);

create index if not exists reports_created_idx
  on public.reports (created_at desc);

-- Email subscriptions for outage alerts.
create table if not exists public.subscriptions (
  id          uuid primary key default gen_random_uuid(),
  email       text        not null unique,
  service_ids text[]      not null default '{}',
  enabled     boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
--  Row level security.
--  The server talks to Supabase with the SERVICE ROLE key, which bypasses RLS,
--  so these policies only matter if you ever expose the anon key to the client.
--  We allow anonymous INSERT into reports (so the client could post directly)
--  and public SELECT on incidents, and lock everything else down.
-- ----------------------------------------------------------------------------
alter table public.incidents      enable row level security;
alter table public.reports        enable row level security;
alter table public.subscriptions  enable row level security;

drop policy if exists "incidents are public" on public.incidents;
create policy "incidents are public"
  on public.incidents for select using (true);

drop policy if exists "anyone can report" on public.reports;
create policy "anyone can report"
  on public.reports for insert with check (true);

drop policy if exists "reports are public" on public.reports;
create policy "reports are public"
  on public.reports for select using (true);
