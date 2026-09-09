-- Local-only stand-in for the pieces Supabase provides in a hosted project:
-- the `auth` schema, `auth.uid()`, and the `anon` / `authenticated` roles.
--
-- This is NEVER applied to a real Supabase project — it exists so the schema
-- and its row level security can be tested against a throwaway Postgres.

create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

-- A minimal auth.users, matching the columns this app actually reads.
create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- Supabase derives the current user from the request JWT; tests set the same
-- GUC directly.
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select on auth.users to service_role;

-- The hosted project has this publication already.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

create extension if not exists "pgcrypto";

-- pg_net is a Supabase extension and is absent from a plain Postgres. This stub
-- records what the push trigger *would* have sent, so the dispatch can be
-- asserted on without a network.
create schema if not exists net;

create table if not exists net.sent_requests (
  id      bigint generated always as identity primary key,
  url     text,
  headers jsonb,
  body    jsonb,
  sent_at timestamptz not null default now()
);

create or replace function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb,
  timeout_milliseconds int default 5000
)
returns bigint language plpgsql as $$
declare
  new_id bigint;
begin
  insert into net.sent_requests (url, headers, body)
  values (url, headers, body)
  returning id into new_id;
  return new_id;
end;
$$;

-- Test-only: the suites read this stub back to assert what would have been
-- sent. The real `net` schema on Supabase stays locked down; nothing in the
-- application reads it.
grant usage on schema net to anon, authenticated, service_role;
grant select on net.sent_requests to anon, authenticated, service_role;
