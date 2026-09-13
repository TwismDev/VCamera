-- The end-of-day sheet totals `cash_collected` over jobs that are completed and
-- whose completion falls inside one local day. These checks pin that contract
-- down in the database: the wrong statuses and the wrong days must not be
-- counted, and one team's takings must never be visible to another.

\set ON_ERROR_STOP on
\pset pager off

create or replace function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;

create or replace function pg_temp.eod_suite()
returns table (num int, check_name text, expectation text, verdict text)
language plpgsql as $$
declare
  boss    uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  driver  uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
  rival   uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_org uuid; v_rival_org uuid; code text; rival_code text;
  today_start timestamptz := date_trunc('day', now());
  today_end   timestamptz := date_trunc('day', now()) + interval '1 day' - interval '1 microsecond';
  collected numeric; expected numeric; n int; i int := 0;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (boss,   'eod-boss@test',   '{"full_name":"Eod Boss","role":"boss"}'),
    (driver, 'eod-driver@test', '{"full_name":"Eod Driver","role":"driver"}'),
    (rival,  'eod-rival@test',  '{"full_name":"Eod Rival","role":"boss"}');

  perform pg_temp.as_user(boss);
  perform public.create_organization('EOD Test Co');
  select id, join_code into v_org, code from public.organizations where name = 'EOD Test Co';

  perform pg_temp.as_user(driver);
  perform public.join_organization(code);

  perform pg_temp.as_user(rival);
  perform public.create_organization('Rival Co');
  select id into v_rival_org from public.organizations where name = 'Rival Co';

  -- Seed the day: two clean deliveries, one short, one still on the road, and
  -- one that was completed yesterday.
  perform pg_temp.as_user(boss);
  insert into public.jobs (org_id, created_by, driver_id, address, customer_name,
                           product_count, cash_to_collect, status,
                           delivered_product_count, cash_collected, completed_at)
  values
    (v_org, boss, driver, '1 Test St', 'Alpha',  2, 100.00, 'completed', 2, 100.00, today_start + interval '9 hours'),
    (v_org, boss, driver, '2 Test St', 'Bravo',  1,  50.00, 'completed', 1,  50.00, today_start + interval '11 hours'),
    (v_org, boss, driver, '3 Test St', 'Charlie',3,  75.00, 'completed', 2,  60.00, today_start + interval '14 hours'),
    (v_org, boss, driver, '4 Test St', 'Delta',  1,  40.00, 'en_route',  null, null, null),
    (v_org, boss, driver, '5 Test St', 'Echo',   1,  30.00, 'completed', 1,  30.00, today_start - interval '3 hours');

  -- The rival's own takings, seeded as the rival (row level security correctly
  -- refuses to let one dispatcher write a job into another team's board).
  perform pg_temp.as_user(rival);
  insert into public.jobs (org_id, created_by, driver_id, address, customer_name,
                           product_count, cash_to_collect, status,
                           delivered_product_count, cash_collected, completed_at)
  values (v_rival_org, rival, null, '9 Rival Rd', 'Rival Customer', 1, 999.00, 'completed', 1, 999.00, today_start + interval '10 hours');

  -- This is exactly the filter the app issues.
  perform pg_temp.as_user(boss);
  select coalesce(sum(cash_collected), 0), coalesce(sum(cash_to_collect), 0), count(*)
    into collected, expected, n
    from public.jobs
   where org_id = v_org and status = 'completed'
     and completed_at between today_start and today_end;

  i:=i+1; num:=i; check_name:='today''s completed jobs are counted'; expectation:='3 jobs';
  verdict := case when n = 3 then 'PASS' else 'FAIL (got ' || n || ')' end; return next;

  i:=i+1; num:=i; check_name:='cash collected totals correctly'; expectation:='$210.00';
  verdict := case when collected = 210.00 then 'PASS' else 'FAIL (got ' || collected || ')' end; return next;

  i:=i+1; num:=i; check_name:='cash due totals correctly'; expectation:='$225.00';
  verdict := case when expected = 225.00 then 'PASS' else 'FAIL (got ' || expected || ')' end; return next;

  i:=i+1; num:=i; check_name:='the shortfall shows up as a difference'; expectation:='-$15.00';
  verdict := case when collected - expected = -15.00 then 'PASS' else 'FAIL (got ' || (collected - expected) || ')' end; return next;

  i:=i+1; num:=i; check_name:='a job still on the road is NOT counted'; expectation:='excluded';
  select count(*) into n from public.jobs
   where org_id = v_org and status = 'completed'
     and completed_at between today_start and today_end and customer_name = 'Delta';
  verdict := case when n = 0 then 'PASS' else 'FAIL' end; return next;

  i:=i+1; num:=i; check_name:='yesterday''s delivery is NOT counted in today'; expectation:='excluded';
  select count(*) into n from public.jobs
   where org_id = v_org and status = 'completed'
     and completed_at between today_start and today_end and customer_name = 'Echo';
  verdict := case when n = 0 then 'PASS' else 'FAIL' end; return next;

  i:=i+1; num:=i; check_name:='yesterday IS counted when that day is selected'; expectation:='$30.00';
  select coalesce(sum(cash_collected), 0) into collected from public.jobs
   where org_id = v_org and status = 'completed'
     and completed_at between today_start - interval '1 day' and today_start - interval '1 microsecond';
  verdict := case when collected = 30.00 then 'PASS' else 'FAIL (got ' || collected || ')' end; return next;

  i:=i+1; num:=i; check_name:='the rival''s takings are invisible to us'; expectation:='not in our total';
  select coalesce(sum(cash_collected), 0) into collected from public.jobs
   where status = 'completed' and completed_at between today_start and today_end;
  verdict := case when collected = 210.00 then 'PASS' else 'FAIL (saw ' || collected || ')' end; return next;

  i:=i+1; num:=i; check_name:='and our takings are invisible to the rival'; expectation:='$999.00 only';
  perform pg_temp.as_user(rival);
  select coalesce(sum(cash_collected), 0) into collected from public.jobs
   where status = 'completed' and completed_at between today_start and today_end;
  verdict := case when collected = 999.00 then 'PASS' else 'FAIL (saw ' || collected || ')' end; return next;

  i:=i+1; num:=i; check_name:='a driver only totals their own deliveries'; expectation:='$210.00';
  perform pg_temp.as_user(driver);
  select coalesce(sum(cash_collected), 0) into collected from public.jobs
   where status = 'completed' and completed_at between today_start and today_end;
  verdict := case when collected = 210.00 then 'PASS' else 'FAIL (saw ' || collected || ')' end; return next;
end;
$$;

create temp table eod_results as select * from pg_temp.eod_suite();

select num, check_name, expectation, verdict from eod_results order by num;

do $$
declare failed int;
begin
  select count(*) into failed from eod_results where verdict <> 'PASS';
  if failed > 0 then
    raise exception '% end-of-day check(s) FAILED', failed;
  end if;
  raise notice 'all % end-of-day checks passed', (select count(*) from eod_results);
end;
$$;
