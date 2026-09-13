-- Push dispatch: the right events fire, the wrong ones stay quiet, and a push
-- token is private to the person who registered it.
--
-- `net.http_post` is stubbed by the shim, so these assert exactly what the
-- trigger hands to the edge function without sending anything.

\set ON_ERROR_STOP on
\pset pager off

create or replace function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;

-- Push configuration is deliberately out of reach of any signed-in user, so
-- the tests drop back to the owning role to change it.
create or replace function pg_temp.as_admin() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

create or replace function pg_temp.did(p_sql text) returns boolean language plpgsql as $$
begin execute p_sql; return true;
exception when others then return false; end;
$$;

create or replace function pg_temp.push_suite()
returns table (num int, check_name text, expectation text, verdict text)
language plpgsql as $$
declare
  boss   uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  driver uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  other  uuid := 'bbbbbbbb-0000-0000-0000-000000000003';
  v_org uuid; code text; v_job uuid; before_count int; n int; i int := 0;
  last_body jsonb;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (boss,   'push-boss@test',   '{"full_name":"Push Boss","role":"boss"}'),
    (driver, 'push-driver@test', '{"full_name":"Push Driver","role":"driver"}'),
    (other,  'push-other@test',  '{"full_name":"Push Other","role":"driver"}');

  perform pg_temp.as_user(boss);
  perform public.create_organization('Push Test Co');
  select id, join_code into v_org, code from public.organizations where name = 'Push Test Co';

  perform pg_temp.as_user(driver);
  perform public.join_organization(code);
  perform public.register_device_token('ExponentPushToken[driver-handset]', 'android', 'Pixel');

  perform pg_temp.as_user(other);
  perform public.join_organization(code);
  perform public.register_device_token('ExponentPushToken[other-handset]', 'ios', 'iPhone');

  i:=i+1; num:=i; check_name:='a driver sees only their own push token'; expectation:='1 row';
  select count(*) into n from public.device_tokens;
  verdict := case when n = 1 then 'PASS' else 'FAIL (saw ' || n || ')' end; return next;

  -- Push must be switched on for the dispatcher to do anything.
  perform pg_temp.as_admin();
  update private.push_config
     set functions_url = 'https://example.test/functions/v1/notify-driver', enabled = true;

  -- ---- assignment ---------------------------------------------------------
  perform pg_temp.as_user(boss);
  select count(*) into before_count from net.sent_requests;

  insert into public.jobs (org_id, created_by, driver_id, address, product_count, cash_to_collect)
  values (v_org, boss, driver, '12 Bourke St', 4, 120.50)
  returning id into v_job;

  i:=i+1; num:=i; check_name:='assigning a job dispatches one push'; expectation:='1 request';
  select count(*) into n from net.sent_requests;
  verdict := case when n = before_count + 1 then 'PASS' else 'FAIL (' || (n - before_count) || ')' end; return next;

  select body into last_body from net.sent_requests order by id desc limit 1;

  i:=i+1; num:=i; check_name:='...naming the job and the event'; expectation:='job id + assigned';
  verdict := case when last_body->>'job_id' = v_job::text and last_body->>'event' = 'assigned'
                  then 'PASS' else 'FAIL (' || coalesce(last_body::text, 'null') || ')' end; return next;

  i:=i+1; num:=i; check_name:='...carrying the shared secret, not the job details'; expectation:='secret only';
  select headers into last_body from net.sent_requests order by id desc limit 1;
  verdict := case when coalesce(last_body->>'x-webhook-secret', '') <> '' then 'PASS' else 'FAIL' end; return next;

  -- ---- things that must NOT buzz -----------------------------------------
  select count(*) into before_count from net.sent_requests;

  i:=i+1; num:=i; check_name:='an unassigned job dispatches nothing'; expectation:='0 requests';
  insert into public.jobs (org_id, created_by, address, product_count, cash_to_collect)
  values (v_org, boss, 'No driver yet', 1, 0);
  select count(*) into n from net.sent_requests;
  verdict := case when n = before_count then 'PASS' else 'FAIL (' || (n - before_count) || ')' end; return next;

  select count(*) into before_count from net.sent_requests;
  i:=i+1; num:=i; check_name:='a driver accepting does not buzz themselves'; expectation:='0 requests';
  perform pg_temp.as_user(driver);
  update public.jobs set status = 'accepted' where id = v_job;
  select count(*) into n from net.sent_requests;
  verdict := case when n = before_count then 'PASS' else 'FAIL (' || (n - before_count) || ')' end; return next;

  select count(*) into before_count from net.sent_requests;
  i:=i+1; num:=i; check_name:='sending an ETA does not buzz'; expectation:='0 requests';
  update public.jobs set eta_minutes = 20, eta_source = 'auto' where id = v_job;
  select count(*) into n from net.sent_requests;
  verdict := case when n = before_count then 'PASS' else 'FAIL (' || (n - before_count) || ')' end; return next;

  select count(*) into before_count from net.sent_requests;
  i:=i+1; num:=i; check_name:='completing does not buzz'; expectation:='0 requests';
  update public.jobs set status = 'completed', delivered_product_count = 4, cash_collected = 120.50
   where id = v_job;
  select count(*) into n from net.sent_requests;
  verdict := case when n = before_count then 'PASS' else 'FAIL (' || (n - before_count) || ')' end; return next;

  -- ---- reassignment and cancellation --------------------------------------
  perform pg_temp.as_user(boss);
  select count(*) into before_count from net.sent_requests;

  i:=i+1; num:=i; check_name:='handing a job to another driver buzzes them'; expectation:='1 request';
  update public.jobs set driver_id = other where id = v_job;
  select count(*) into n from net.sent_requests;
  verdict := case when n = before_count + 1 then 'PASS' else 'FAIL (' || (n - before_count) || ')' end; return next;

  select count(*) into before_count from net.sent_requests;
  i:=i+1; num:=i; check_name:='cancelling buzzes the assigned driver'; expectation:='1 cancelled event';
  update public.jobs set status = 'cancelled' where id = v_job;
  select body into last_body from net.sent_requests order by id desc limit 1;
  select count(*) into n from net.sent_requests;
  verdict := case when n = before_count + 1 and last_body->>'event' = 'cancelled'
                  then 'PASS' else 'FAIL' end; return next;

  select count(*) into before_count from net.sent_requests;
  i:=i+1; num:=i; check_name:='cancelling twice only buzzes once'; expectation:='0 further requests';
  update public.jobs set status = 'cancelled' where id = v_job;
  select count(*) into n from net.sent_requests;
  verdict := case when n = before_count then 'PASS' else 'FAIL (' || (n - before_count) || ')' end; return next;

  -- ---- the off switch -----------------------------------------------------
  perform pg_temp.as_admin();
  update private.push_config set enabled = false;
  perform pg_temp.as_user(boss);
  select count(*) into before_count from net.sent_requests;

  i:=i+1; num:=i; check_name:='disabling push stops all dispatch'; expectation:='0 requests';
  insert into public.jobs (org_id, created_by, driver_id, address, product_count, cash_to_collect)
  values (v_org, boss, driver, '99 Quiet St', 1, 10.00);
  select count(*) into n from net.sent_requests;
  verdict := case when n = before_count then 'PASS' else 'FAIL (' || (n - before_count) || ')' end; return next;

  perform pg_temp.as_admin();
  update private.push_config set enabled = true;

  -- ---- the secret stays put ----------------------------------------------
  i:=i+1; num:=i; check_name:='a signed-in user CANNOT read the webhook secret'; expectation:='denied';
  perform pg_temp.as_user(driver);
  verdict := case when pg_temp.did('select webhook_secret from private.push_config')
                  then 'FAIL' else 'PASS' end; return next;

  i:=i+1; num:=i; check_name:='a signed-in user CANNOT verify a guessed secret'; expectation:='denied';
  verdict := case when pg_temp.did('select public.verify_push_secret(''guess'')')
                  then 'FAIL' else 'PASS' end; return next;

  i:=i+1; num:=i; check_name:='a signed-in user CANNOT prune others'' tokens'; expectation:='denied';
  verdict := case when pg_temp.did('select public.prune_device_tokens(array[''ExponentPushToken[other-handset]''])')
                  then 'FAIL' else 'PASS' end; return next;

  i:=i+1; num:=i; check_name:='a signed-in user CANNOT fire a push by hand'; expectation:='denied';
  verdict := case when pg_temp.did(format('select public.dispatch_job_push(%L, ''assigned'')', v_job))
                  then 'FAIL' else 'PASS' end; return next;

  i:=i+1; num:=i; check_name:='signing out drops only your own token'; expectation:='other keeps theirs';
  perform public.unregister_device_token('ExponentPushToken[driver-handset]');
  perform pg_temp.as_user(other);
  select count(*) into n from public.device_tokens;
  verdict := case when n = 1 then 'PASS' else 'FAIL (saw ' || n || ')' end; return next;
end;
$$;

create temp table push_results as select * from pg_temp.push_suite();

select num, check_name, expectation, verdict from push_results order by num;

do $$
declare failed int;
begin
  select count(*) into failed from push_results where verdict <> 'PASS';
  if failed > 0 then
    raise exception '% push check(s) FAILED', failed;
  end if;
  raise notice 'all % push checks passed', (select count(*) from push_results);
end;
$$;
