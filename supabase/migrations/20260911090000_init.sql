-- ===========================================================================
-- Delivery Tracker - initial schema
--
-- Two roles share one database:
--   * boss    creates deliveries, watches the live map, reads completion reports
--   * driver  accepts deliveries, reports an ETA, streams position, completes
--
-- Drivers never UPDATE the jobs table directly. Every state change goes
-- through a security-definer function below so the legal transitions and the
-- ownership checks live in exactly one place.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- --------------------------------------------------------------------------
-- Enumerations
-- --------------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('boss', 'driver');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.job_status as enum (
    'unassigned',  -- created, nobody holds it yet
    'assigned',    -- sent to a driver, awaiting their answer
    'accepted',    -- driver took it, ETA may or may not be in yet
    'declined',    -- driver refused, back to the dispatcher
    'en_route',    -- driver started driving, live tracking is on
    'arrived',     -- driver reached the address
    'completed',   -- goods handed over, cash reconciled
    'cancelled'    -- dispatcher pulled it
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.eta_source as enum ('auto', 'manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.job_event_type as enum (
    'created', 'assigned', 'accepted', 'declined', 'eta_set',
    'trip_started', 'arrived', 'completed', 'cancelled', 'note'
  );
exception when duplicate_object then null; end $$;

-- --------------------------------------------------------------------------
-- Organisations. One boss's company; drivers join with a short code.
-- --------------------------------------------------------------------------
create table if not exists public.orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  join_code   text not null unique,
  currency    text not null default 'USD',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- Profiles. One row per auth user, created automatically on sign-up.
-- --------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  org_id      uuid references public.orgs (id) on delete set null,
  role        public.app_role not null default 'driver',
  full_name   text not null default '',
  phone       text,
  is_active   boolean not null default true,
  push_token  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists profiles_org_idx on public.profiles (org_id, role);

-- --------------------------------------------------------------------------
-- Jobs. One delivery drop.
-- --------------------------------------------------------------------------
create sequence if not exists public.job_reference_seq;

create table if not exists public.jobs (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs (id) on delete cascade,
  reference        text not null default 'D' || lpad(nextval('public.job_reference_seq')::text, 5, '0'),
  created_by       uuid not null references public.profiles (id) on delete restrict,
  assigned_to      uuid references public.profiles (id) on delete set null,

  customer_name    text,
  customer_phone   text,
  address          text not null check (length(btrim(address)) > 0),
  address_lat      double precision check (address_lat between -90 and 90),
  address_lng      double precision check (address_lng between -180 and 180),
  notes            text,

  -- What the dispatcher enters when raising the job.
  product_count    integer not null default 0 check (product_count >= 0),
  cash_to_collect  numeric(12, 2) not null default 0 check (cash_to_collect >= 0),

  status           public.job_status not null default 'unassigned',

  -- Arrival estimate promised by the driver (auto-computed or typed in).
  eta_at           timestamptz,
  eta_minutes      integer check (eta_minutes >= 0),
  eta_source       public.eta_source,
  eta_updated_at   timestamptz,
  decline_reason   text,

  -- What the driver reports back at the door.
  delivered_count  integer check (delivered_count >= 0),
  cash_collected   numeric(12, 2) check (cash_collected >= 0),
  completion_notes text,

  assigned_at      timestamptz,
  accepted_at      timestamptz,
  started_at       timestamptz,
  arrived_at       timestamptz,
  completed_at     timestamptz,
  cancelled_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists jobs_org_status_idx  on public.jobs (org_id, status, created_at desc);
create index if not exists jobs_assigned_idx    on public.jobs (assigned_to, status, created_at desc);
create unique index if not exists jobs_reference_idx on public.jobs (reference);

-- A driver may hold only one live run at a time, which keeps the tracking
-- session unambiguous.
create unique index if not exists jobs_one_active_run_per_driver
  on public.jobs (assigned_to)
  where status = 'en_route';

-- --------------------------------------------------------------------------
-- Audit trail. Every state change appends a row; the dispatcher reads it as
-- the job timeline.
-- --------------------------------------------------------------------------
create table if not exists public.job_events (
  id          bigint generated always as identity primary key,
  job_id      uuid not null references public.jobs (id) on delete cascade,
  org_id      uuid not null references public.orgs (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  type        public.job_event_type not null,
  message     text,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists job_events_job_idx on public.job_events (job_id, created_at);

-- --------------------------------------------------------------------------
-- Live position. One row per driver, overwritten in place; this is what the
-- dispatcher's map subscribes to.
-- --------------------------------------------------------------------------
create table if not exists public.driver_locations (
  driver_id   uuid primary key references public.profiles (id) on delete cascade,
  org_id      uuid not null references public.orgs (id) on delete cascade,
  job_id      uuid references public.jobs (id) on delete set null,
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  accuracy_m  double precision,
  speed_mps   double precision,
  heading_deg double precision,
  battery_pct integer check (battery_pct between 0 and 100),
  recorded_at timestamptz not null,
  updated_at  timestamptz not null default now()
);

create index if not exists driver_locations_org_idx on public.driver_locations (org_id, updated_at desc);

-- --------------------------------------------------------------------------
-- Breadcrumb history, kept per job so a completed run can be replayed.
-- --------------------------------------------------------------------------
create table if not exists public.location_pings (
  id          bigint generated always as identity primary key,
  driver_id   uuid not null references public.profiles (id) on delete cascade,
  org_id      uuid not null references public.orgs (id) on delete cascade,
  job_id      uuid references public.jobs (id) on delete set null,
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  accuracy_m  double precision,
  speed_mps   double precision,
  heading_deg double precision,
  recorded_at timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists location_pings_job_idx    on public.location_pings (job_id, recorded_at);
create index if not exists location_pings_driver_idx on public.location_pings (driver_id, recorded_at desc);

-- --------------------------------------------------------------------------
-- updated_at maintenance
-- --------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists orgs_touch     on public.orgs;
drop trigger if exists profiles_touch on public.profiles;
drop trigger if exists jobs_touch     on public.jobs;

create trigger orgs_touch     before update on public.orgs     for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger jobs_touch     before update on public.jobs     for each row execute function public.touch_updated_at();

-- ===========================================================================
-- Helpers used by the policies. security definer so a policy on profiles can
-- read profiles without recursing through its own RLS.
-- ===========================================================================
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select org_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_boss()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select role = 'boss' from public.profiles where id = auth.uid()), false);
$$;

revoke all on function public.current_org_id()  from public;
revoke all on function public.current_app_role() from public;
revoke all on function public.is_boss()          from public;
grant execute on function public.current_org_id()   to authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_boss()          to authenticated;

-- A profile row is created for every new auth user. full_name and role travel
-- in the sign-up metadata; role is clamped so a client cannot self-promote to
-- boss of an existing org (joining an org always lands as driver).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    'driver'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Short, unambiguous join code. Omits characters that are easy to misread.
create or replace function public.generate_join_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i integer;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.orgs where join_code = candidate);
  end loop;
  return candidate;
end;
$$;

-- ===========================================================================
-- Row level security
-- ===========================================================================
alter table public.orgs             enable row level security;
alter table public.profiles         enable row level security;
alter table public.jobs             enable row level security;
alter table public.job_events       enable row level security;
alter table public.driver_locations enable row level security;
alter table public.location_pings   enable row level security;

-- orgs ----------------------------------------------------------------------
drop policy if exists orgs_select on public.orgs;
create policy orgs_select on public.orgs
  for select to authenticated
  using (id = public.current_org_id());

drop policy if exists orgs_update on public.orgs;
create policy orgs_update on public.orgs
  for update to authenticated
  using (id = public.current_org_id() and public.is_boss())
  with check (id = public.current_org_id() and public.is_boss());

-- profiles ------------------------------------------------------------------
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists profiles_select_org on public.profiles;
create policy profiles_select_org on public.profiles
  for select to authenticated
  using (org_id is not null and org_id = public.current_org_id());

-- A user edits their own name, phone and push token. org_id and role are not
-- writable from the client; both are set by the onboarding functions below.
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and org_id is not distinct from (select p.org_id from public.profiles p where p.id = auth.uid())
    and role   is not distinct from (select p.role   from public.profiles p where p.id = auth.uid())
  );

-- The boss may deactivate or reactivate a driver in their own org.
drop policy if exists profiles_update_by_boss on public.profiles;
create policy profiles_update_by_boss on public.profiles
  for update to authenticated
  using (public.is_boss() and org_id = public.current_org_id() and id <> auth.uid())
  with check (public.is_boss() and org_id = public.current_org_id() and role = 'driver');

-- jobs ----------------------------------------------------------------------
drop policy if exists jobs_select on public.jobs;
create policy jobs_select on public.jobs
  for select to authenticated
  using (
    org_id = public.current_org_id()
    and (public.is_boss() or assigned_to = auth.uid())
  );

drop policy if exists jobs_insert_boss on public.jobs;
create policy jobs_insert_boss on public.jobs
  for insert to authenticated
  with check (
    public.is_boss()
    and org_id = public.current_org_id()
    and created_by = auth.uid()
  );

-- The dispatcher can correct the details of a job that has not been finished.
-- Drivers get no direct UPDATE at all; they go through the RPCs.
drop policy if exists jobs_update_boss on public.jobs;
create policy jobs_update_boss on public.jobs
  for update to authenticated
  using (
    public.is_boss()
    and org_id = public.current_org_id()
    and status not in ('completed', 'cancelled')
  )
  with check (public.is_boss() and org_id = public.current_org_id());

drop policy if exists jobs_delete_boss on public.jobs;
create policy jobs_delete_boss on public.jobs
  for delete to authenticated
  using (
    public.is_boss()
    and org_id = public.current_org_id()
    and status in ('unassigned', 'cancelled')
  );

-- job_events ----------------------------------------------------------------
drop policy if exists job_events_select on public.job_events;
create policy job_events_select on public.job_events
  for select to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_events.job_id
        and j.org_id = public.current_org_id()
        and (public.is_boss() or j.assigned_to = auth.uid())
    )
  );

-- Free-text notes are the only event a client writes directly. Everything else
-- is appended by the state-machine functions.
drop policy if exists job_events_insert_note on public.job_events;
create policy job_events_insert_note on public.job_events
  for insert to authenticated
  with check (
    type = 'note'
    and actor_id = auth.uid()
    and org_id = public.current_org_id()
    and exists (
      select 1 from public.jobs j
      where j.id = job_events.job_id
        and j.org_id = public.current_org_id()
        and (public.is_boss() or j.assigned_to = auth.uid())
    )
  );

-- driver_locations ----------------------------------------------------------
drop policy if exists driver_locations_select on public.driver_locations;
create policy driver_locations_select on public.driver_locations
  for select to authenticated
  using (
    driver_id = auth.uid()
    or (public.is_boss() and org_id = public.current_org_id())
  );

drop policy if exists driver_locations_upsert on public.driver_locations;
create policy driver_locations_upsert on public.driver_locations
  for insert to authenticated
  with check (driver_id = auth.uid() and org_id = public.current_org_id());

drop policy if exists driver_locations_update on public.driver_locations;
create policy driver_locations_update on public.driver_locations
  for update to authenticated
  using (driver_id = auth.uid())
  with check (driver_id = auth.uid() and org_id = public.current_org_id());

-- location_pings ------------------------------------------------------------
drop policy if exists location_pings_select on public.location_pings;
create policy location_pings_select on public.location_pings
  for select to authenticated
  using (
    driver_id = auth.uid()
    or (public.is_boss() and org_id = public.current_org_id())
  );

drop policy if exists location_pings_insert on public.location_pings;
create policy location_pings_insert on public.location_pings
  for insert to authenticated
  with check (driver_id = auth.uid() and org_id = public.current_org_id());

-- ===========================================================================
-- Onboarding
-- ===========================================================================

-- The first user of a company calls this. It creates the org and promotes the
-- caller to boss. Anyone already in an org is rejected.
create or replace function public.create_org(p_name text)
returns public.orgs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org public.orgs;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if (select org_id from public.profiles where id = auth.uid()) is not null then
    raise exception 'You already belong to a team' using errcode = '23505';
  end if;

  insert into public.orgs (name, join_code)
  values (btrim(p_name), public.generate_join_code())
  returning * into v_org;

  update public.profiles
     set org_id = v_org.id, role = 'boss'
   where id = auth.uid();

  return v_org;
end;
$$;

-- A driver joins with the code their boss gives them.
create or replace function public.join_org(p_code text)
returns public.orgs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org public.orgs;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if (select org_id from public.profiles where id = auth.uid()) is not null then
    raise exception 'You already belong to a team' using errcode = '23505';
  end if;

  select * into v_org from public.orgs where join_code = upper(btrim(p_code));
  if not found then
    raise exception 'That team code was not recognised' using errcode = 'P0002';
  end if;

  update public.profiles
     set org_id = v_org.id, role = 'driver'
   where id = auth.uid();

  return v_org;
end;
$$;

create or replace function public.rotate_join_code()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
begin
  if not public.is_boss() then
    raise exception 'Only the dispatcher can change the team code' using errcode = '42501';
  end if;

  v_code := public.generate_join_code();
  update public.orgs set join_code = v_code where id = public.current_org_id();
  return v_code;
end;
$$;

-- ===========================================================================
-- Job state machine
--
-- Legal transitions:
--   unassigned -> assigned                      (boss assigns)
--   assigned   -> accepted | declined           (driver answers)
--   accepted   -> en_route                      (driver starts driving)
--   en_route   -> arrived                       (driver reaches the address)
--   accepted | en_route | arrived -> completed  (driver closes the job)
--   anything except completed -> cancelled      (boss pulls it)
-- ===========================================================================

create or replace function public.assert_job_driver(p_job uuid)
returns public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs;
begin
  select * into v_job from public.jobs where id = p_job;
  if not found then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;
  if v_job.assigned_to is distinct from auth.uid() then
    raise exception 'This job is not assigned to you' using errcode = '42501';
  end if;
  return v_job;
end;
$$;

create or replace function public.assign_job(p_job uuid, p_driver uuid)
returns public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs;
begin
  if not public.is_boss() then
    raise exception 'Only the dispatcher can assign jobs' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles
     where id = p_driver and org_id = public.current_org_id()
       and role = 'driver' and is_active
  ) then
    raise exception 'That driver is not on your team' using errcode = 'P0002';
  end if;

  update public.jobs
     set assigned_to    = p_driver,
         status         = 'assigned',
         assigned_at    = now(),
         accepted_at    = null,
         decline_reason = null
   where id = p_job
     and org_id = public.current_org_id()
     and status in ('unassigned', 'assigned', 'declined')
  returning * into v_job;

  if not found then
    raise exception 'This job can no longer be reassigned' using errcode = '22023';
  end if;

  insert into public.job_events (job_id, org_id, actor_id, type, message, payload)
  values (v_job.id, v_job.org_id, auth.uid(), 'assigned', 'Job sent to driver',
          jsonb_build_object('driver_id', p_driver));

  return v_job;
end;
$$;

create or replace function public.accept_job(p_job uuid)
returns public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs;
begin
  v_job := public.assert_job_driver(p_job);

  if v_job.status <> 'assigned' then
    raise exception 'This job is not waiting on your answer' using errcode = '22023';
  end if;

  update public.jobs
     set status = 'accepted', accepted_at = now(), decline_reason = null
   where id = p_job
  returning * into v_job;

  insert into public.job_events (job_id, org_id, actor_id, type, message)
  values (v_job.id, v_job.org_id, auth.uid(), 'accepted', 'Driver accepted the job');

  return v_job;
end;
$$;

create or replace function public.decline_job(p_job uuid, p_reason text default null)
returns public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs;
begin
  v_job := public.assert_job_driver(p_job);

  if v_job.status not in ('assigned', 'accepted') then
    raise exception 'This job can no longer be declined' using errcode = '22023';
  end if;

  update public.jobs
     set status         = 'declined',
         assigned_to    = null,
         decline_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         accepted_at    = null
   where id = p_job
  returning * into v_job;

  insert into public.job_events (job_id, org_id, actor_id, type, message, payload)
  values (v_job.id, v_job.org_id, auth.uid(), 'declined', 'Driver declined the job',
          jsonb_build_object('reason', p_reason));

  return v_job;
end;
$$;

-- Called both when the driver first commits to an arrival time and repeatedly
-- while driving, as the live estimate is refreshed from their position.
create or replace function public.submit_eta(
  p_job     uuid,
  p_eta_at  timestamptz,
  p_source  public.eta_source default 'manual',
  p_minutes integer default null
)
returns public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs;
begin
  v_job := public.assert_job_driver(p_job);

  if v_job.status not in ('assigned', 'accepted', 'en_route') then
    raise exception 'This job is not open for an arrival time' using errcode = '22023';
  end if;

  if p_eta_at is null then
    raise exception 'An arrival time is required' using errcode = '22023';
  end if;

  update public.jobs
     set eta_at         = p_eta_at,
         eta_source     = p_source,
         eta_minutes    = p_minutes,
         eta_updated_at = now()
   where id = p_job
  returning * into v_job;

  insert into public.job_events (job_id, org_id, actor_id, type, message, payload)
  values (v_job.id, v_job.org_id, auth.uid(), 'eta_set', 'Driver reported an arrival time',
          jsonb_build_object('eta_at', p_eta_at, 'source', p_source, 'minutes', p_minutes));

  return v_job;
end;
$$;

create or replace function public.start_trip(p_job uuid)
returns public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs;
begin
  v_job := public.assert_job_driver(p_job);

  if v_job.status <> 'accepted' then
    raise exception 'Accept the job before starting the trip' using errcode = '22023';
  end if;

  update public.jobs
     set status = 'en_route', started_at = now()
   where id = p_job
  returning * into v_job;

  insert into public.job_events (job_id, org_id, actor_id, type, message)
  values (v_job.id, v_job.org_id, auth.uid(), 'trip_started', 'Driver started the trip');

  return v_job;
end;
$$;

create or replace function public.mark_arrived(p_job uuid)
returns public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs;
begin
  v_job := public.assert_job_driver(p_job);

  if v_job.status <> 'en_route' then
    raise exception 'Start the trip first' using errcode = '22023';
  end if;

  update public.jobs
     set status = 'arrived', arrived_at = now()
   where id = p_job
  returning * into v_job;

  insert into public.job_events (job_id, org_id, actor_id, type, message)
  values (v_job.id, v_job.org_id, auth.uid(), 'arrived', 'Driver arrived at the address');

  return v_job;
end;
$$;

-- The closing report. The counts the driver confirms here are what the
-- dispatcher reconciles against the original order.
create or replace function public.complete_job(
  p_job             uuid,
  p_delivered_count integer default null,
  p_cash_collected  numeric default null,
  p_notes           text default null
)
returns public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs;
begin
  v_job := public.assert_job_driver(p_job);

  if v_job.status not in ('accepted', 'en_route', 'arrived') then
    raise exception 'This job cannot be completed from its current state' using errcode = '22023';
  end if;

  update public.jobs
     set status           = 'completed',
         completed_at     = now(),
         arrived_at       = coalesce(arrived_at, now()),
         delivered_count  = coalesce(p_delivered_count, product_count),
         cash_collected   = coalesce(p_cash_collected, cash_to_collect),
         completion_notes = nullif(btrim(coalesce(p_notes, '')), '')
   where id = p_job
  returning * into v_job;

  insert into public.job_events (job_id, org_id, actor_id, type, message, payload)
  values (v_job.id, v_job.org_id, auth.uid(), 'completed', 'Delivery completed',
          jsonb_build_object(
            'delivered_count', v_job.delivered_count,
            'ordered_count',   v_job.product_count,
            'cash_collected',  v_job.cash_collected,
            'cash_expected',   v_job.cash_to_collect
          ));

  -- The run is over, so the tracking session is detached from the job.
  update public.driver_locations set job_id = null
   where driver_id = auth.uid() and job_id = p_job;

  return v_job;
end;
$$;

create or replace function public.cancel_job(p_job uuid, p_reason text default null)
returns public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs;
begin
  if not public.is_boss() then
    raise exception 'Only the dispatcher can cancel a job' using errcode = '42501';
  end if;

  update public.jobs
     set status = 'cancelled', cancelled_at = now()
   where id = p_job
     and org_id = public.current_org_id()
     and status <> 'completed'
  returning * into v_job;

  if not found then
    raise exception 'This job can no longer be cancelled' using errcode = '22023';
  end if;

  insert into public.job_events (job_id, org_id, actor_id, type, message, payload)
  values (v_job.id, v_job.org_id, auth.uid(), 'cancelled', 'Dispatcher cancelled the job',
          jsonb_build_object('reason', p_reason));

  return v_job;
end;
$$;

-- ===========================================================================
-- Position reporting
--
-- Takes an array so the driver app can flush a backlog collected while it was
-- out of signal in a single round trip. The newest ping also refreshes the
-- live position row that the dispatcher's map watches.
-- ===========================================================================
create or replace function public.report_locations(p_pings jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org    uuid;
  v_count  integer := 0;
  v_latest record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select org_id into v_org from public.profiles where id = auth.uid();
  if v_org is null then
    raise exception 'You are not on a team yet' using errcode = '22023';
  end if;

  if p_pings is null or jsonb_typeof(p_pings) <> 'array' then
    raise exception 'Expected an array of positions' using errcode = '22023';
  end if;

  with incoming as (
    select
      (p ->> 'lat')::double precision          as lat,
      (p ->> 'lng')::double precision          as lng,
      (p ->> 'accuracy_m')::double precision   as accuracy_m,
      (p ->> 'speed_mps')::double precision    as speed_mps,
      (p ->> 'heading_deg')::double precision  as heading_deg,
      (p ->> 'battery_pct')::integer           as battery_pct,
      (p ->> 'recorded_at')::timestamptz       as recorded_at,
      nullif(p ->> 'job_id', '')::uuid         as job_id
    from jsonb_array_elements(p_pings) as p
  ),
  valid as (
    select i.* from incoming i
    where i.lat between -90 and 90
      and i.lng between -180 and 180
      and i.recorded_at is not null
      -- a ping may only be attached to a job that belongs to this driver
      and (
        i.job_id is null
        or exists (select 1 from public.jobs j where j.id = i.job_id and j.assigned_to = auth.uid())
      )
  ),
  inserted as (
    insert into public.location_pings
      (driver_id, org_id, job_id, lat, lng, accuracy_m, speed_mps, heading_deg, recorded_at)
    select auth.uid(), v_org, v.job_id, v.lat, v.lng, v.accuracy_m, v.speed_mps, v.heading_deg, v.recorded_at
    from valid v
    returning 1
  )
  select count(*) into v_count from inserted;

  select * into v_latest
  from (
    select
      (p ->> 'lat')::double precision         as lat,
      (p ->> 'lng')::double precision         as lng,
      (p ->> 'accuracy_m')::double precision  as accuracy_m,
      (p ->> 'speed_mps')::double precision   as speed_mps,
      (p ->> 'heading_deg')::double precision as heading_deg,
      (p ->> 'battery_pct')::integer          as battery_pct,
      (p ->> 'recorded_at')::timestamptz      as recorded_at,
      nullif(p ->> 'job_id', '')::uuid        as job_id
    from jsonb_array_elements(p_pings) as p
  ) s
  where s.recorded_at is not null
    and s.lat between -90 and 90
    and s.lng between -180 and 180
  order by s.recorded_at desc
  limit 1;

  -- Tested against a specific column rather than `v_latest is not null`: a
  -- record is only IS NOT NULL when every field is non-null, and heading,
  -- accuracy and battery are routinely absent, which would silently skip the
  -- live position row and leave the dispatcher's map empty.
  if v_latest.recorded_at is not null then
    insert into public.driver_locations as dl
      (driver_id, org_id, job_id, lat, lng, accuracy_m, speed_mps, heading_deg, battery_pct, recorded_at)
    values
      (auth.uid(), v_org, v_latest.job_id, v_latest.lat, v_latest.lng, v_latest.accuracy_m,
       v_latest.speed_mps, v_latest.heading_deg, v_latest.battery_pct, v_latest.recorded_at)
    on conflict (driver_id) do update
      set org_id      = excluded.org_id,
          job_id      = excluded.job_id,
          lat         = excluded.lat,
          lng         = excluded.lng,
          accuracy_m  = excluded.accuracy_m,
          speed_mps   = excluded.speed_mps,
          heading_deg = excluded.heading_deg,
          battery_pct = coalesce(excluded.battery_pct, dl.battery_pct),
          recorded_at = excluded.recorded_at,
          updated_at  = now()
      -- never let a delayed flush overwrite a fresher fix
      where excluded.recorded_at >= dl.recorded_at;
  end if;

  return v_count;
end;
$$;

-- ===========================================================================
-- Dispatcher read model: every driver with their latest fix and current run.
-- security_invoker keeps the caller's RLS in force through the view.
-- ===========================================================================
create or replace view public.driver_status
with (security_invoker = true) as
select
  p.id                as driver_id,
  p.org_id,
  p.full_name,
  p.phone,
  p.is_active,
  dl.lat,
  dl.lng,
  dl.speed_mps,
  dl.heading_deg,
  dl.battery_pct,
  dl.recorded_at      as position_recorded_at,
  dl.updated_at       as position_updated_at,
  j.id                as job_id,
  j.reference         as job_reference,
  j.address           as job_address,
  j.status            as job_status,
  j.eta_at            as job_eta_at
from public.profiles p
left join public.driver_locations dl on dl.driver_id = p.id
left join lateral (
  select * from public.jobs
   where assigned_to = p.id
     and status in ('assigned', 'accepted', 'en_route', 'arrived')
   order by case status when 'en_route' then 0 when 'arrived' then 1 when 'accepted' then 2 else 3 end,
            created_at
   limit 1
) j on true
where p.role = 'driver';

-- ===========================================================================
-- Grants. security definer functions are locked down and handed only to
-- signed-in users.
-- ===========================================================================
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.create_org(text)',
    'public.join_org(text)',
    'public.rotate_join_code()',
    'public.assign_job(uuid, uuid)',
    'public.accept_job(uuid)',
    'public.decline_job(uuid, text)',
    'public.submit_eta(uuid, timestamptz, public.eta_source, integer)',
    'public.start_trip(uuid)',
    'public.mark_arrived(uuid)',
    'public.complete_job(uuid, integer, numeric, text)',
    'public.cancel_job(uuid, text)',
    'public.report_locations(jsonb)'
  ]
  loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

revoke all on function public.assert_job_driver(uuid) from public;
revoke all on function public.generate_join_code()    from public;
revoke all on function public.handle_new_user()       from public;
revoke all on function public.touch_updated_at()      from public;

grant select on public.driver_status to authenticated;

-- ===========================================================================
-- Realtime. The dispatcher's job board and map are push-driven.
-- ===========================================================================
alter table public.jobs             replica identity full;
alter table public.driver_locations replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.jobs;
exception when duplicate_object then null; end $$;

do $$
begin
  alter publication supabase_realtime add table public.driver_locations;
exception when duplicate_object then null; end $$;

do $$
begin
  alter publication supabase_realtime add table public.job_events;
exception when duplicate_object then null; end $$;

-- ===========================================================================
-- Table privileges.
--
-- Row level security decides which rows a user may touch; these grants decide
-- whether the verb is available at all. Supabase projects usually grant these
-- by default privilege, but stating them here means the migration stands up on
-- any project whose defaults have been tightened.
-- ===========================================================================
grant select, update                 on public.orgs             to authenticated;
grant select, update                 on public.profiles         to authenticated;
grant select, insert, update, delete on public.jobs             to authenticated;
grant select, insert                 on public.job_events       to authenticated;
grant select, insert, update         on public.driver_locations to authenticated;
grant select, insert                 on public.location_pings   to authenticated;

-- The jobs table takes its human-readable reference from this sequence, so an
-- insert needs to be able to advance it.
grant usage on sequence public.job_reference_seq to authenticated;
