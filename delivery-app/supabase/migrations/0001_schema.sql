-- ===========================================================================
-- Delivery Tracker — complete schema.
--
-- Safe to run on a fresh Supabase project, and safe to re-run: every statement
-- is idempotent. Apply from the SQL editor, or with the Supabase CLI.
--
-- The security model in one paragraph: everyone belongs to exactly one team
-- (`organizations`). A dispatcher creates the team and gets a join code;
-- anyone entering that code joins as a DRIVER, never a dispatcher, because the
-- role chosen at sign-up is self-declared and must not confer power over
-- someone else's business. Dispatchers see every job and every driver position
-- on their team; a driver sees only the jobs assigned to them. Row level
-- security enforces all of it in the database, so a tampered client gains
-- nothing.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  join_code   text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  org_id      uuid references public.organizations (id) on delete set null,
  full_name   text not null default '',
  phone       text,
  role        text not null default 'driver' check (role in ('boss', 'driver')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.jobs (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations (id) on delete cascade,
  created_by               uuid not null references public.profiles (id) on delete cascade,
  driver_id                uuid references public.profiles (id) on delete set null,

  -- what the dispatcher enters
  address                  text not null check (length(btrim(address)) > 0),
  address_lat              double precision,
  address_lng              double precision,
  customer_name            text,
  customer_phone           text,
  product_count            integer not null default 0 check (product_count >= 0),
  cash_to_collect          numeric(12, 2) not null default 0 check (cash_to_collect >= 0),
  notes                    text,

  -- lifecycle
  status                   text not null default 'assigned'
                             check (status in ('assigned', 'accepted', 'en_route',
                                               'completed', 'declined', 'cancelled')),
  decline_reason           text,

  -- the driver's ETA
  eta_minutes              integer check (eta_minutes is null or eta_minutes between 0 and 1440),
  eta_at                   timestamptz,
  eta_source               text check (eta_source is null or eta_source in ('auto', 'manual')),
  eta_updated_at           timestamptz,

  -- what actually happened at the door
  delivered_product_count  integer check (delivered_product_count is null or delivered_product_count >= 0),
  cash_collected           numeric(12, 2) check (cash_collected is null or cash_collected >= 0),
  completion_notes         text,

  assigned_at              timestamptz not null default now(),
  accepted_at              timestamptz,
  started_at               timestamptz,
  completed_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists jobs_org_status_idx    on public.jobs (org_id, status, created_at desc);
create index if not exists jobs_driver_status_idx on public.jobs (driver_id, status, created_at desc);

-- Where each driver is right now: one row per driver, overwritten in place.
create table if not exists public.driver_locations (
  driver_id    uuid primary key references public.profiles (id) on delete cascade,
  org_id       uuid not null references public.organizations (id) on delete cascade,
  job_id       uuid references public.jobs (id) on delete set null,
  lat          double precision not null,
  lng          double precision not null,
  accuracy_m   double precision,
  speed_mps    double precision,
  heading_deg  double precision,
  battery_pct  integer,
  recorded_at  timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists driver_locations_org_idx on public.driver_locations (org_id, updated_at desc);

-- The breadcrumb trail, so a run can be replayed after the fact.
create table if not exists public.location_pings (
  id           bigint generated always as identity primary key,
  driver_id    uuid not null references public.profiles (id) on delete cascade,
  org_id       uuid not null references public.organizations (id) on delete cascade,
  job_id       uuid references public.jobs (id) on delete set null,
  lat          double precision not null,
  lng          double precision not null,
  accuracy_m   double precision,
  speed_mps    double precision,
  heading_deg  double precision,
  recorded_at  timestamptz not null default now()
);

create index if not exists location_pings_job_idx    on public.location_pings (job_id, recorded_at);
create index if not exists location_pings_driver_idx on public.location_pings (driver_id, recorded_at desc);

-- ---------------------------------------------------------------------------
-- Security helpers
--
-- SECURITY DEFINER so that policies on `profiles` can read `profiles` without
-- recursing back through the very policy being evaluated.
-- ---------------------------------------------------------------------------

create or replace function public.current_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_boss()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()) = 'boss', false);
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists jobs_touch on public.jobs;
create trigger jobs_touch before update on public.jobs
  for each row execute function public.touch_updated_at();

-- Lifecycle timestamps are stamped here rather than trusted from the client.
create or replace function public.stamp_job_status()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'accepted'  and new.accepted_at  is null then new.accepted_at  := now(); end if;
    if new.status = 'en_route'  and new.started_at   is null then new.started_at   := now(); end if;
    if new.status = 'completed' and new.completed_at is null then new.completed_at := now(); end if;
  end if;

  if new.eta_minutes is distinct from old.eta_minutes then
    new.eta_updated_at := now();
    if new.eta_minutes is not null and new.eta_at is null then
      new.eta_at := now() + make_interval(mins => new.eta_minutes);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists jobs_stamp_status on public.jobs;
create trigger jobs_stamp_status before update on public.jobs
  for each row execute function public.stamp_job_status();

-- A driver may edit their own name and phone. `role` and `org_id` are pinned:
-- the only way those change is through the membership RPCs below, which raise
-- a transaction-local flag this guard honours.
create or replace function public.guard_profile_self_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.membership_change', true), '') = 'on' then
    return new;
  end if;

  new.role   := old.role;
  new.org_id := old.org_id;
  return new;
end;
$$;

drop trigger if exists profiles_guard_self_update on public.profiles;
create trigger profiles_guard_self_update before update on public.profiles
  for each row execute function public.guard_profile_self_update();

-- Every new auth user gets a profile; name and role come from sign-up metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'phone',
    case when new.raw_user_meta_data ->> 'role' = 'boss' then 'boss' else 'driver' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Team membership
-- ---------------------------------------------------------------------------

create or replace function public.create_organization(p_name text)
returns public.organizations language plpgsql security definer set search_path = public as $$
declare
  v_org     public.organizations;
  v_code    text;
  v_current uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  select org_id into v_current from public.profiles where id = auth.uid();
  if v_current is not null then
    raise exception 'You are already on a team. Leave it first.';
  end if;

  -- Six characters from an unambiguous alphabet (no O/0, no I/1).
  loop
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random() * 32) + 1)::int, 1), '')
      into v_code from generate_series(1, 6);
    exit when not exists (select 1 from public.organizations where join_code = v_code);
  end loop;

  insert into public.organizations (name, join_code) values (btrim(p_name), v_code)
  returning * into v_org;

  perform set_config('app.membership_change', 'on', true);
  update public.profiles set org_id = v_org.id, role = 'boss' where id = auth.uid();
  perform set_config('app.membership_change', 'off', true);

  return v_org;
end;
$$;

-- A join code is an invitation onto the team, never a grant of dispatcher
-- powers: whatever role someone claimed at sign-up, joining by code lands them
-- as a driver. Only creating a team, or promotion by an existing dispatcher,
-- makes a boss.
create or replace function public.join_organization(p_code text)
returns public.organizations language plpgsql security definer set search_path = public as $$
declare
  v_org     public.organizations;
  v_current uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  select org_id into v_current from public.profiles where id = auth.uid();
  if v_current is not null then
    raise exception 'You are already on a team. Leave it first.';
  end if;

  select * into v_org from public.organizations where join_code = upper(btrim(p_code));
  if v_org.id is null then raise exception 'No team found with that code'; end if;

  perform set_config('app.membership_change', 'on', true);
  update public.profiles set org_id = v_org.id, role = 'driver' where id = auth.uid();
  perform set_config('app.membership_change', 'off', true);

  return v_org;
end;
$$;

create or replace function public.leave_organization()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  -- Never leave a phone broadcasting to a team it is no longer on.
  delete from public.driver_locations where driver_id = auth.uid();

  perform set_config('app.membership_change', 'on', true);
  update public.profiles set org_id = null where id = auth.uid();
  perform set_config('app.membership_change', 'off', true);
end;
$$;

create or replace function public.remove_member(p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  if not public.is_boss() then raise exception 'Only a dispatcher can remove someone'; end if;
  if p_member = auth.uid() then raise exception 'Use leave_organization to remove yourself'; end if;

  select org_id into v_org from public.profiles where id = auth.uid();
  delete from public.driver_locations where driver_id = p_member and org_id = v_org;

  perform set_config('app.membership_change', 'on', true);
  update public.profiles set org_id = null where id = p_member and org_id = v_org;
  perform set_config('app.membership_change', 'off', true);
end;
$$;

create or replace function public.set_member_role(p_member uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  if not public.is_boss() then raise exception 'Only a dispatcher can change roles'; end if;
  if p_role not in ('boss', 'driver') then raise exception 'Unknown role %', p_role; end if;
  if p_member = auth.uid() then raise exception 'You cannot change your own role'; end if;

  select org_id into v_org from public.profiles where id = auth.uid();
  if v_org is null then raise exception 'You are not on a team'; end if;

  if not exists (select 1 from public.profiles where id = p_member and org_id = v_org) then
    raise exception 'That person is not on your team';
  end if;

  if p_role = 'boss' then
    delete from public.driver_locations where driver_id = p_member;
  end if;

  perform set_config('app.membership_change', 'on', true);
  update public.profiles set role = p_role where id = p_member and org_id = v_org;
  perform set_config('app.membership_change', 'off', true);
end;
$$;

-- Rotate the code after someone leaves, so an old code cannot let them back in.
create or replace function public.regenerate_join_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_org  uuid;
  v_code text;
begin
  if not public.is_boss() then raise exception 'Only a dispatcher can change the join code'; end if;

  select org_id into v_org from public.profiles where id = auth.uid();
  if v_org is null then raise exception 'You are not on a team'; end if;

  loop
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random() * 32) + 1)::int, 1), '')
      into v_code from generate_series(1, 6);
    exit when not exists (select 1 from public.organizations where join_code = v_code);
  end loop;

  update public.organizations set join_code = v_code where id = v_org;
  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function grants
--
-- Trigger functions are reachable by nobody. Helpers and RPCs are reachable by
-- signed-in users only; each RPC does its own authorization check inside.
-- ---------------------------------------------------------------------------

revoke all on function public.handle_new_user()             from public, anon, authenticated;
revoke all on function public.touch_updated_at()            from public, anon, authenticated;
revoke all on function public.stamp_job_status()            from public, anon, authenticated;
revoke all on function public.guard_profile_self_update()   from public, anon, authenticated;

revoke all on function public.current_org_id()              from public, anon;
revoke all on function public.current_user_role()           from public, anon;
revoke all on function public.is_boss()                     from public, anon;
revoke all on function public.create_organization(text)     from public, anon;
revoke all on function public.join_organization(text)       from public, anon;
revoke all on function public.leave_organization()          from public, anon;
revoke all on function public.remove_member(uuid)           from public, anon;
revoke all on function public.set_member_role(uuid, text)   from public, anon;
revoke all on function public.regenerate_join_code()        from public, anon;

grant execute on function public.current_org_id()            to authenticated;
grant execute on function public.current_user_role()         to authenticated;
grant execute on function public.is_boss()                   to authenticated;
grant execute on function public.create_organization(text)   to authenticated;
grant execute on function public.join_organization(text)     to authenticated;
grant execute on function public.leave_organization()        to authenticated;
grant execute on function public.remove_member(uuid)         to authenticated;
grant execute on function public.set_member_role(uuid, text) to authenticated;
grant execute on function public.regenerate_join_code()      to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.organizations    enable row level security;
alter table public.profiles         enable row level security;
alter table public.jobs             enable row level security;
alter table public.driver_locations enable row level security;
alter table public.location_pings   enable row level security;

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select to authenticated
  using (id = public.current_org_id());

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or (org_id is not null and org_id = public.current_org_id()));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists jobs_select on public.jobs;
create policy jobs_select on public.jobs
  for select to authenticated
  using (org_id = public.current_org_id() and (public.is_boss() or driver_id = auth.uid()));

drop policy if exists jobs_insert_boss on public.jobs;
create policy jobs_insert_boss on public.jobs
  for insert to authenticated
  with check (public.is_boss() and org_id = public.current_org_id() and created_by = auth.uid());

drop policy if exists jobs_update on public.jobs;
create policy jobs_update on public.jobs
  for update to authenticated
  using (org_id = public.current_org_id() and (public.is_boss() or driver_id = auth.uid()))
  with check (org_id = public.current_org_id() and (public.is_boss() or driver_id = auth.uid()));

drop policy if exists jobs_delete_boss on public.jobs;
create policy jobs_delete_boss on public.jobs
  for delete to authenticated
  using (public.is_boss() and org_id = public.current_org_id());

drop policy if exists driver_locations_select on public.driver_locations;
create policy driver_locations_select on public.driver_locations
  for select to authenticated
  using (org_id = public.current_org_id());

drop policy if exists driver_locations_upsert on public.driver_locations;
create policy driver_locations_upsert on public.driver_locations
  for insert to authenticated
  with check (driver_id = auth.uid() and org_id = public.current_org_id());

drop policy if exists driver_locations_update on public.driver_locations;
create policy driver_locations_update on public.driver_locations
  for update to authenticated
  using (driver_id = auth.uid())
  with check (driver_id = auth.uid() and org_id = public.current_org_id());

drop policy if exists driver_locations_delete on public.driver_locations;
create policy driver_locations_delete on public.driver_locations
  for delete to authenticated
  using (driver_id = auth.uid());

drop policy if exists location_pings_select on public.location_pings;
create policy location_pings_select on public.location_pings
  for select to authenticated
  using (org_id = public.current_org_id() and (public.is_boss() or driver_id = auth.uid()));

drop policy if exists location_pings_insert on public.location_pings;
create policy location_pings_insert on public.location_pings
  for insert to authenticated
  with check (driver_id = auth.uid() and org_id = public.current_org_id());

-- ---------------------------------------------------------------------------
-- Realtime: the job board and the live map update without polling.
-- ---------------------------------------------------------------------------

alter table public.jobs             replica identity full;
alter table public.driver_locations replica identity full;

do $$
begin
  begin alter publication supabase_realtime add table public.jobs;
  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.driver_locations;
  exception when duplicate_object then null; end;
end
$$;
