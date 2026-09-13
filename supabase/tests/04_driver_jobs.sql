-- Drivers logging their own work.
--
-- The point of these checks is the boundary: a driver may raise a job for
-- themselves, but must not be able to push work onto a colleague, nor quietly
-- rewrite the brief on a job the dispatcher sent out — the end-of-day sheet
-- depends on `cash_to_collect` meaning what the dispatcher said it means.

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

create or replace function pg_temp.driver_jobs_suite()
returns table (num int, check_name text, expectation text, verdict text)
language plpgsql as $$
declare
  boss    uuid := 'cccccccc-0000-0000-0000-000000000001';
  driver  uuid := 'cccccccc-0000-0000-0000-000000000002';
  mate    uuid := 'cccccccc-0000-0000-0000-000000000003';
  v_org uuid; code text; own_job uuid; sent_job uuid; n int; i int := 0;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (boss,   'dj-boss@test',   '{"full_name":"DJ Boss","role":"boss"}'),
    (driver, 'dj-driver@test', '{"full_name":"DJ Driver","role":"driver"}'),
    (mate,   'dj-mate@test',   '{"full_name":"DJ Mate","role":"driver"}');

  perform pg_temp.as_user(boss);
  perform public.create_organization('Driver Jobs Co');
  select id, join_code into v_org, code from public.organizations where name = 'Driver Jobs Co';

  perform pg_temp.as_user(driver);
  perform public.join_organization(code);
  perform pg_temp.as_user(mate);
  perform public.join_organization(code);

  -- ---- a driver may raise their own work ---------------------------------
  perform pg_temp.as_user(driver);
  i:=i+1; num:=i; check_name:='driver CAN raise a job for themselves'; expectation:='allowed';
  verdict := pg_temp.verdict(true, pg_temp.did(format(
    'insert into public.jobs (org_id, created_by, driver_id, origin, status, address, product_count, cash_to_collect) values (%L, auth.uid(), auth.uid(), ''driver'', ''accepted'', ''1 Walk-up Ln'', 2, 40.00)',
    v_org))); return next;

  select id into own_job from public.jobs where address = '1 Walk-up Ln';

  i:=i+1; num:=i; check_name:='...and it starts already accepted'; expectation:='accepted';
  verdict := (select case when status = 'accepted' and origin = 'driver' then 'PASS' else 'FAIL' end
              from public.jobs where id = own_job); return next;

  -- ---- but not work for anybody else -------------------------------------
  i:=i+1; num:=i; check_name:='driver CANNOT raise a job for a colleague'; expectation:='denied';
  verdict := pg_temp.verdict(false, pg_temp.did(format(
    'insert into public.jobs (org_id, created_by, driver_id, origin, status, address, product_count, cash_to_collect) values (%L, auth.uid(), %L, ''driver'', ''accepted'', ''Not yours'', 1, 0)',
    v_org, mate))); return next;

  i:=i+1; num:=i; check_name:='driver CANNOT raise an unassigned job'; expectation:='denied';
  verdict := pg_temp.verdict(false, pg_temp.did(format(
    'insert into public.jobs (org_id, created_by, origin, status, address, product_count, cash_to_collect) values (%L, auth.uid(), ''driver'', ''assigned'', ''Nobody''''s'', 1, 0)',
    v_org))); return next;

  i:=i+1; num:=i; check_name:='driver CANNOT pass their job off as the dispatcher''s'; expectation:='denied';
  verdict := pg_temp.verdict(false, pg_temp.did(format(
    'insert into public.jobs (org_id, created_by, driver_id, origin, status, address, product_count, cash_to_collect) values (%L, auth.uid(), auth.uid(), ''dispatcher'', ''accepted'', ''Faked'', 1, 0)',
    v_org))); return next;

  i:=i+1; num:=i; check_name:='driver CANNOT raise a job on another team'; expectation:='denied';
  verdict := pg_temp.verdict(false, pg_temp.did(
    'insert into public.jobs (org_id, created_by, driver_id, origin, status, address, product_count, cash_to_collect) values (gen_random_uuid(), auth.uid(), auth.uid(), ''driver'', ''accepted'', ''Elsewhere'', 1, 0)')); return next;

  -- ---- the dispatcher still sees and runs everything ----------------------
  perform pg_temp.as_user(boss);
  i:=i+1; num:=i; check_name:='dispatcher sees the driver-raised job'; expectation:='visible';
  select count(*) into n from public.jobs where id = own_job;
  verdict := case when n = 1 then 'PASS' else 'FAIL' end; return next;

  i:=i+1; num:=i; check_name:='dispatcher CAN cancel a driver-raised job'; expectation:='allowed';
  verdict := pg_temp.verdict(true, pg_temp.did(format(
    'update public.jobs set status = ''cancelled'' where id = %L', own_job))); return next;

  -- Put it back for the remaining checks.
  update public.jobs set status = 'accepted' where id = own_job;

  i:=i+1; num:=i; check_name:='a colleague CANNOT see it'; expectation:='0 rows';
  perform pg_temp.as_user(mate);
  select count(*) into n from public.jobs where id = own_job;
  verdict := case when n = 0 then 'PASS' else 'FAIL' end; return next;

  -- ---- the brief on dispatcher work is not the driver's to rewrite -------
  perform pg_temp.as_user(boss);
  insert into public.jobs (org_id, created_by, driver_id, address, customer_name,
                           product_count, cash_to_collect, notes)
  values (v_org, boss, driver, '2 Dispatch Rd', 'Real Customer', 5, 200.00, 'Ring the bell')
  returning id into sent_job;

  perform pg_temp.as_user(driver);

  i:=i+1; num:=i; check_name:='driver CANNOT lower cash due on a dispatcher job'; expectation:='stays $200';
  perform pg_temp.did(format('update public.jobs set cash_to_collect = 10.00 where id = %L', sent_job));
  verdict := (select case when cash_to_collect = 200.00 then 'PASS' else 'FAIL (now ' || cash_to_collect || ')' end
              from public.jobs where id = sent_job); return next;

  i:=i+1; num:=i; check_name:='driver CANNOT change the item count on one'; expectation:='stays 5';
  perform pg_temp.did(format('update public.jobs set product_count = 1 where id = %L', sent_job));
  verdict := (select case when product_count = 5 then 'PASS' else 'FAIL (now ' || product_count || ')' end
              from public.jobs where id = sent_job); return next;

  i:=i+1; num:=i; check_name:='driver CANNOT change the address on one'; expectation:='unchanged';
  perform pg_temp.did(format('update public.jobs set address = ''Somewhere else'' where id = %L', sent_job));
  verdict := (select case when address = '2 Dispatch Rd' then 'PASS' else 'FAIL' end
              from public.jobs where id = sent_job); return next;

  i:=i+1; num:=i; check_name:='driver CANNOT relabel it as their own'; expectation:='stays dispatcher';
  perform pg_temp.did(format('update public.jobs set origin = ''driver'' where id = %L', sent_job));
  verdict := (select case when origin = 'dispatcher' then 'PASS' else 'FAIL' end
              from public.jobs where id = sent_job); return next;

  i:=i+1; num:=i; check_name:='driver CANNOT hand it to a colleague'; expectation:='stays theirs';
  perform pg_temp.did(format('update public.jobs set driver_id = %L where id = %L', mate, sent_job));
  verdict := (select case when driver_id = driver then 'PASS' else 'FAIL' end
              from public.jobs where id = sent_job); return next;

  -- ---- but the work itself still is -------------------------------------
  i:=i+1; num:=i; check_name:='driver CAN still report what they collected'; expectation:='recorded';
  perform pg_temp.did(format(
    'update public.jobs set status = ''completed'', delivered_product_count = 4, cash_collected = 150.00, completion_notes = ''one short'' where id = %L',
    sent_job));
  verdict := (select case when status = 'completed' and cash_collected = 150.00
                           and delivered_product_count = 4 and completed_at is not null
                          then 'PASS' else 'FAIL' end
              from public.jobs where id = sent_job); return next;

  i:=i+1; num:=i; check_name:='...so the shortfall against $200 is still visible'; expectation:='-$50';
  verdict := (select case when cash_to_collect - cash_collected = 50.00 then 'PASS' else 'FAIL' end
              from public.jobs where id = sent_job); return next;

  i:=i+1; num:=i; check_name:='driver CAN correct details on their OWN job'; expectation:='allowed';
  perform pg_temp.did(format(
    'update public.jobs set address = ''1 Walk-up Lane'', cash_to_collect = 45.00 where id = %L', own_job));
  verdict := (select case when address = '1 Walk-up Lane' and cash_to_collect = 45.00
                          then 'PASS' else 'FAIL' end
              from public.jobs where id = own_job); return next;

  -- ---- notifications ------------------------------------------------------
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  update private.push_config
     set functions_url = 'https://example.test/functions/v1/notify-driver', enabled = true;

  perform pg_temp.as_user(driver);
  perform public.register_device_token('ExponentPushToken[dj-driver]', 'android', 'Pixel');
  perform pg_temp.as_user(boss);
  perform public.register_device_token('ExponentPushToken[dj-boss]', 'ios', 'iPhone');

  perform pg_temp.as_user(driver);
  select count(*) into n from net.sent_requests;

  i:=i+1; num:=i; check_name:='a driver-raised job dispatches a driver_created push'; expectation:='1 request';
  insert into public.jobs (org_id, created_by, driver_id, origin, status, address, product_count, cash_to_collect)
  values (v_org, driver, driver, 'driver', 'accepted', '3 Notify St', 1, 10.00);
  verdict := (select case when count(*) = n + 1 then 'PASS' else 'FAIL' end from net.sent_requests); return next;

  i:=i+1; num:=i; check_name:='...as driver_created, not as an assignment'; expectation:='driver_created';
  verdict := (select case when body->>'event' = 'driver_created' then 'PASS'
                          else 'FAIL (' || coalesce(body->>'event', 'null') || ')' end
              from net.sent_requests order by id desc limit 1); return next;
end;
$$;

create temp table driver_job_results as select * from pg_temp.driver_jobs_suite();

select num, check_name, expectation, verdict from driver_job_results order by num;

do $$
declare failed int;
begin
  select count(*) into failed from driver_job_results where verdict <> 'PASS';
  if failed > 0 then
    raise exception '% driver-job check(s) FAILED', failed;
  end if;
  raise notice 'all % driver-job checks passed', (select count(*) from driver_job_results);
end;
$$;
