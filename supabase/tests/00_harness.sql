-- Minimal stand-in for the parts of a Supabase project the migration depends on.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

-- Supabase exposes the signed-in user's id this way; here it comes from a
-- session setting the tests change to impersonate each user.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;

do $$ begin create publication supabase_realtime; exception when duplicate_object then null; end $$;

-- Supabase grants these on every project; a bare Postgres needs them stated.
grant usage   on schema auth   to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Impersonation used by the tests. Session-scoped, because each psql statement
-- outside an explicit transaction commits on its own.
create or replace function act_as(p_user uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p_user::text, false); end $$;

-- Names each check so a failure says which behaviour broke.
create or replace function check_that(p_label text, p_ok boolean) returns void language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'FAIL: %', p_label;
  end if;
  raise notice 'pass  %', p_label;
end $$;
