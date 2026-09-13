-- Who may read the GPS breadcrumb trail after a run.
--
-- The live pin is one row per driver; the trail is every fix, kept so a
-- dispatcher can replay a completed job. A driver may file and read their own
-- crumbs. A teammate must not watch a colleague's run. A stranger sees nothing.

\set ON_ERROR_STOP on
\pset pager off

create or replace function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;

create or replace function pg_temp.did(p_sql text) returns boolean language plpgsql as $$
begin execute p_sql; return true;
exception when others then return false; end;
$$;

create or replace function pg_temp.verdict(expected boolean, actual boolean) returns text language sql as $$
  select case when expected = actual then 'PASS' else 'FAIL' end;
$$;

create or replace function pg_temp.replay_suite()
returns table (num int, check_name text, expectation text, verdict text)
language plpgsql as $$
declare
  boss    uuid := 'dddddddd-0000-0000-0000-000000000001';
  driver  uuid := 'dddddddd-0000-0000-0000-000000000002';
  mate    uuid := 'dddddddd-0000-0000-0000-000000000003';
  outsider uuid := 'dddddddd-0000-0000-0000-000000000004';
  v_org uuid; code text; v_job uuid; n int; i int := 0;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (boss,     'replay-boss@test',     '{"full_name":"Replay Boss","role":"boss"}'),
    (driver,   'replay-driver@test',   '{"full_name":"Replay Driver","role":"driver"}'),
    (mate,     'replay-mate@test',     '{"full_name":"Replay Mate","role":"driver"}'),
    (outsider, 'replay-outsider@test', '{"full_name":"Replay Outsider","role":"boss"}');

  perform pg_temp.as_user(boss);
  perform public.create_organization('Replay Co');
  select id, join_code into v_org, code from public.organizations where name = 'Replay Co';

  perform pg_temp.as_user(driver);
  perform public.join_organization(code);
  perform pg_temp.as_user(mate);
  perform public.join_organization(code);

  perform pg_temp.as_user(boss);
  insert into public.jobs (org_id, created_by, driver_id, address, product_count, cash_to_collect)
    values (v_org, boss, driver, '1 Replay Rd', 1, 10.00);
  select id into v_job from public.jobs where address = '1 Replay Rd';

  -- ---- filing crumbs ------------------------------------------------------
  perform pg_temp.as_user(driver);
  i:=i+1; num:=i; check_name:='driver CAN append their own breadcrumb'; expectation:='allowed';
  verdict := pg_temp.verdict(true, pg_temp.did(format(
    'insert into public.location_pings (driver_id, org_id, job_id, lat, lng) values (auth.uid(), %L, %L, -37.81, 144.96)',
    v_org, v_job))); return next;

  i:=i+1; num:=i; check_name:='...and a second fix on the same job'; expectation:='allowed';
  verdict := pg_temp.verdict(true, pg_temp.did(format(
    'insert into public.location_pings (driver_id, org_id, job_id, lat, lng) values (auth.uid(), %L, %L, -37.82, 144.97)',
    v_org, v_job))); return next;

  i:=i+1; num:=i; check_name:='driver CANNOT file a crumb under a colleague''s name'; expectation:='denied';
  verdict := pg_temp.verdict(false, pg_temp.did(format(
    'insert into public.location_pings (driver_id, org_id, job_id, lat, lng) values (%L, %L, %L, 0, 0)',
    mate, v_org, v_job))); return next;

  -- ---- reading the trail --------------------------------------------------
  i:=i+1; num:=i; check_name:='assigned driver CAN read their own trail'; expectation:='2 rows';
  select count(*) into n from public.location_pings where job_id = v_job;
  verdict := case when n = 2 then 'PASS' else 'FAIL' end; return next;

  perform pg_temp.as_user(boss);
  i:=i+1; num:=i; check_name:='dispatcher CAN replay a driver''s trail'; expectation:='2 rows';
  select count(*) into n from public.location_pings where job_id = v_job;
  verdict := case when n = 2 then 'PASS' else 'FAIL' end; return next;

  perform pg_temp.as_user(mate);
  i:=i+1; num:=i; check_name:='teammate CANNOT watch a colleague''s run'; expectation:='0 rows';
  select count(*) into n from public.location_pings where job_id = v_job;
  verdict := case when n = 0 then 'PASS' else 'FAIL' end; return next;

  perform pg_temp.as_user(outsider);
  i:=i+1; num:=i; check_name:='stranger sees no breadcrumbs'; expectation:='0 rows';
  select count(*) into n from public.location_pings;
  verdict := case when n = 0 then 'PASS' else 'FAIL' end; return next;

  -- Completing the job must not wipe the trail — that is the whole point.
  perform pg_temp.as_user(driver);
  perform pg_temp.did(format(
    'update public.jobs set status = ''completed'', delivered_product_count = 1, cash_collected = 10.00 where id = %L',
    v_job));

  perform pg_temp.as_user(boss);
  i:=i+1; num:=i; check_name:='trail is still there after the job completes'; expectation:='2 rows';
  select count(*) into n from public.location_pings where job_id = v_job;
  verdict := case when n = 2 then 'PASS' else 'FAIL' end; return next;
end;
$$;

create temp table replay_results as select * from pg_temp.replay_suite();

select num, check_name, expectation, verdict from replay_results order by num;

do $$
declare failed int;
begin
  select count(*) into failed from replay_results where verdict <> 'PASS';
  if failed > 0 then
    raise exception '% replay check(s) FAILED', failed;
  end if;
  raise notice 'all % replay checks passed', (select count(*) from replay_results);
end;
$$;
