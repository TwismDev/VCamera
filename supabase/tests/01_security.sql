-- What this proves, in the database rather than in the app:
--   * the happy path works end to end for a dispatcher and a driver;
--   * a driver cannot escalate their own privileges or invent work;
--   * a join code gets someone onto the team but never makes them a boss;
--   * nobody outside the team can see a single row.
--
-- Run with supabase/tests/run.sh. Any FAIL row is a real regression.

\set ON_ERROR_STOP on
\pset pager off

create or replace function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;

-- Runs a statement and reports only whether it was permitted, so each check can
-- state its expectation plainly.
create or replace function pg_temp.did(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function pg_temp.verdict(expected boolean, actual boolean) returns text language sql as $$
  select case when expected = actual then 'PASS' else 'FAIL' end;
$$;

create or replace function pg_temp.suite()
returns table (num int, check_name text, expectation text, verdict text)
language plpgsql as $$
declare
  boss    uuid := '11111111-1111-1111-1111-111111111111';
  driver  uuid := '22222222-2222-2222-2222-222222222222';
  joiner  uuid := '33333333-3333-3333-3333-333333333333';
  outsider uuid := '44444444-4444-4444-4444-444444444444';
  code text; v_org uuid; v_job uuid; n int; i int := 0;
begin
  -- ---- setup: four accounts, two of whom claim to be dispatchers ----------
  insert into auth.users (id, email, raw_user_meta_data) values
    (boss,     'boss@test',     '{"full_name":"Bea Boss","role":"boss"}'),
    (driver,   'driver@test',   '{"full_name":"Dan Driver","role":"driver"}'),
    (joiner,   'joiner@test',   '{"full_name":"Jo Joiner","role":"boss"}'),
    (outsider, 'outsider@test', '{"full_name":"Ollie Outsider","role":"boss"}');

  i:=i+1; num:=i; check_name:='sign-up trigger creates a profile for each user'; expectation:='4 profiles';
  select count(*) into n from public.profiles;
  verdict := case when n = 4 then 'PASS' else 'FAIL' end; return next;

  -- ---- the dispatcher sets up shop ---------------------------------------
  perform pg_temp.as_user(boss);
  i:=i+1; num:=i; check_name:='dispatcher creates a team'; expectation:='allowed';
  verdict := pg_temp.verdict(true, pg_temp.did($q$select public.create_organization('Acme Deliveries')$q$)); return next;

  i:=i+1; num:=i; check_name:='...and really is a boss on it'; expectation:='org set, role=boss';
  verdict := (select case when org_id is not null and role = 'boss' then 'PASS' else 'FAIL' end
              from public.profiles where id = boss); return next;

  select id, join_code into v_org, code from public.organizations limit 1;

  -- ---- the driver joins ---------------------------------------------------
  perform pg_temp.as_user(driver);
  i:=i+1; num:=i; check_name:='driver joins with the team code'; expectation:='allowed';
  verdict := pg_temp.verdict(true, pg_temp.did(format('select public.join_organization(%L)', code))); return next;

  i:=i+1; num:=i; check_name:='driver CANNOT promote self to dispatcher'; expectation:='stays driver';
  perform pg_temp.did('update public.profiles set role = ''boss'' where id = auth.uid()');
  verdict := (select case when role = 'driver' then 'PASS' else 'FAIL' end
              from public.profiles where id = driver); return next;

  i:=i+1; num:=i; check_name:='driver CANNOT change teams by writing to profiles'; expectation:='stays on team';
  perform pg_temp.did('update public.profiles set org_id = null where id = auth.uid()');
  verdict := (select case when org_id = v_org then 'PASS' else 'FAIL' end
              from public.profiles where id = driver); return next;

  i:=i+1; num:=i; check_name:='driver CAN still edit their own name'; expectation:='allowed';
  perform pg_temp.did('update public.profiles set full_name = ''Daniel Driver'' where id = auth.uid()');
  verdict := (select case when full_name = 'Daniel Driver' then 'PASS' else 'FAIL' end
              from public.profiles where id = driver); return next;

  -- ---- a job goes out -----------------------------------------------------
  perform pg_temp.as_user(boss);
  i:=i+1; num:=i; check_name:='dispatcher creates a job'; expectation:='allowed';
  verdict := pg_temp.verdict(true, pg_temp.did(format(
    'insert into public.jobs (org_id, created_by, driver_id, address, product_count, cash_to_collect) values (%L, %L, %L, ''12 Bourke St'', 4, 120.50)',
    v_org, boss, driver))); return next;

  select id into v_job from public.jobs limit 1;

  perform pg_temp.as_user(driver);
  i:=i+1; num:=i; check_name:='accepting stamps accepted_at server-side'; expectation:='stamped';
  perform pg_temp.did(format('update public.jobs set status = ''accepted'' where id = %L', v_job));
  verdict := (select case when accepted_at is not null and status = 'accepted' then 'PASS' else 'FAIL' end
              from public.jobs where id = v_job); return next;

  i:=i+1; num:=i; check_name:='sending an ETA derives eta_at and stamps started_at'; expectation:='both set';
  perform pg_temp.did(format('update public.jobs set status = ''en_route'', eta_minutes = 25, eta_source = ''auto'' where id = %L', v_job));
  verdict := (select case when eta_at is not null and eta_updated_at is not null and started_at is not null
                          then 'PASS' else 'FAIL' end
              from public.jobs where id = v_job); return next;

  i:=i+1; num:=i; check_name:='driver CAN report their own position'; expectation:='allowed';
  verdict := pg_temp.verdict(true, pg_temp.did(format(
    'insert into public.driver_locations (driver_id, org_id, job_id, lat, lng, battery_pct) values (auth.uid(), %L, %L, -37.8, 144.95, 88)',
    v_org, v_job))); return next;

  i:=i+1; num:=i; check_name:='driver CANNOT fake somebody else''s position'; expectation:='denied';
  verdict := pg_temp.verdict(false, pg_temp.did(format(
    'insert into public.driver_locations (driver_id, org_id, lat, lng) values (%L, %L, 0, 0)', boss, v_org))); return next;

  i:=i+1; num:=i; check_name:='driver CANNOT invent a job'; expectation:='denied';
  verdict := pg_temp.verdict(false, pg_temp.did(format(
    'insert into public.jobs (org_id, created_by, address, product_count, cash_to_collect) values (%L, auth.uid(), ''fake'', 1, 0)', v_org))); return next;

  i:=i+1; num:=i; check_name:='completing records the real counts and stamps the time'; expectation:='recorded';
  perform pg_temp.did(format(
    'update public.jobs set status = ''completed'', delivered_product_count = 3, cash_collected = 90.00, completion_notes = ''one box short'' where id = %L', v_job));
  verdict := (select case when status = 'completed' and delivered_product_count = 3
                           and cash_collected = 90.00 and completed_at is not null
                          then 'PASS' else 'FAIL' end
              from public.jobs where id = v_job); return next;

  -- ---- a join code must not hand over the business ------------------------
  perform pg_temp.as_user(joiner);
  i:=i+1; num:=i; check_name:='code-joiner who claimed "dispatcher" lands as a DRIVER'; expectation:='driver';
  perform pg_temp.did(format('select public.join_organization(%L)', code));
  verdict := (select case when role = 'driver' and org_id = v_org then 'PASS' else 'FAIL' end
              from public.profiles where id = joiner); return next;

  i:=i+1; num:=i; check_name:='...so they CANNOT rotate the join code'; expectation:='denied';
  verdict := pg_temp.verdict(false, pg_temp.did('select public.regenerate_join_code()')); return next;

  i:=i+1; num:=i; check_name:='...CANNOT remove a teammate'; expectation:='denied';
  verdict := pg_temp.verdict(false, pg_temp.did(format('select public.remove_member(%L)', driver))); return next;

  i:=i+1; num:=i; check_name:='...CANNOT promote themselves'; expectation:='denied';
  verdict := pg_temp.verdict(false, pg_temp.did(format('select public.set_member_role(%L, ''boss'')', joiner))); return next;

  i:=i+1; num:=i; check_name:='...CANNOT read a job assigned to another driver'; expectation:='0 rows';
  select count(*) into n from public.jobs;
  verdict := case when n = 0 then 'PASS' else 'FAIL' end; return next;

  i:=i+1; num:=i; check_name:='...CANNOT hop to another team while on one'; expectation:='denied';
  verdict := pg_temp.verdict(false, pg_temp.did(format('select public.join_organization(%L)', code))); return next;

  -- ---- and a total stranger sees nothing ----------------------------------
  perform pg_temp.as_user(outsider);
  i:=i+1; num:=i; check_name:='stranger with no code sees no rows anywhere'; expectation:='0 rows';
  select (select count(*) from public.jobs) + (select count(*) from public.organizations)
       + (select count(*) from public.driver_locations) + (select count(*) from public.location_pings)
    into n;
  verdict := case when n = 0 then 'PASS' else 'FAIL' end; return next;

  i:=i+1; num:=i; check_name:='stranger sees only their own profile'; expectation:='1 row';
  select count(*) into n from public.profiles;
  verdict := case when n = 1 then 'PASS' else 'FAIL' end; return next;

  -- ---- dispatcher powers --------------------------------------------------
  perform pg_temp.as_user(boss);
  i:=i+1; num:=i; check_name:='dispatcher CAN promote a member'; expectation:='allowed';
  verdict := pg_temp.verdict(true, pg_temp.did(format('select public.set_member_role(%L, ''boss'')', joiner))); return next;

  i:=i+1; num:=i; check_name:='dispatcher CANNOT change their own role'; expectation:='denied';
  verdict := pg_temp.verdict(false, pg_temp.did(format('select public.set_member_role(%L, ''driver'')', boss))); return next;

  i:=i+1; num:=i; check_name:='dispatcher CAN rotate the join code'; expectation:='allowed';
  verdict := pg_temp.verdict(true, pg_temp.did('select public.regenerate_join_code()')); return next;

  i:=i+1; num:=i; check_name:='rotating the code invalidates the old one'; expectation:='changed';
  verdict := (select case when join_code <> code then 'PASS' else 'FAIL' end
              from public.organizations where id = v_org); return next;

  i:=i+1; num:=i; check_name:='dispatcher CAN remove a driver'; expectation:='allowed';
  verdict := pg_temp.verdict(true, pg_temp.did(format('select public.remove_member(%L)', driver))); return next;

  i:=i+1; num:=i; check_name:='removed driver stops broadcasting immediately'; expectation:='0 locations';
  select count(*) into n from public.driver_locations where driver_id = driver;
  verdict := case when n = 0 then 'PASS' else 'FAIL' end; return next;

  perform pg_temp.as_user(driver);
  i:=i+1; num:=i; check_name:='removed driver sees nothing at all'; expectation:='0 rows';
  select (select count(*) from public.jobs) + (select count(*) from public.driver_locations) into n;
  verdict := case when n = 0 then 'PASS' else 'FAIL' end; return next;
end;
$$;

-- The suite seeds its own accounts, so it is run exactly once and the results
-- are kept for both the report and the pass/fail gate.
create temp table results as select * from pg_temp.suite();

select num, check_name, expectation, verdict from results order by num;

do $$
declare failed int;
begin
  select count(*) into failed from results where verdict <> 'PASS';
  if failed > 0 then
    raise exception '% security check(s) FAILED', failed;
  end if;
  raise notice 'all % security checks passed', (select count(*) from results);
end;
$$;
