\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set BOSS   '11111111-1111-1111-1111-111111111111'
\set DRIVER '22222222-2222-2222-2222-222222222222'
\set RIVAL  '33333333-3333-3333-3333-333333333333'

-- === the dispatcher raises a delivery ======================================
set role authenticated;
select act_as(:'BOSS');
select id as org from public.orgs \gset

insert into public.jobs (org_id, created_by, address, product_count, cash_to_collect, customer_name)
values (:'org', :'BOSS', '24 Harbour Road, Cape Town', 12, 250.00, 'Ada Customer')
returning id as job \gset

-- The do-blocks below read the id from a session setting.
select set_config('test.job', :'job', false);

select check_that('a new delivery starts unassigned', status = 'unassigned') from public.jobs where id = :'job';
select check_that('the delivery carries a readable reference', reference ~ '^D[0-9]{5}$') from public.jobs where id = :'job';
select check_that('the product count is stored', product_count = 12) from public.jobs where id = :'job';
select check_that('the cash to collect is stored', cash_to_collect = 250.00) from public.jobs where id = :'job';

-- === a driver cannot see another team's work ===============================
select act_as(:'RIVAL');
select check_that('a driver outside the team sees nothing', count(*) = 0) from public.jobs;

-- === the driver cannot see it until it is theirs ===========================
select act_as(:'DRIVER');
select check_that('an unassigned delivery is not visible to drivers', count(*) = 0) from public.jobs;

-- === assignment ============================================================
select act_as(:'BOSS');
select check_that('the dispatcher assigns the delivery',
                  (public.assign_job(:'job', :'DRIVER')).status = 'assigned');

select act_as(:'DRIVER');
select check_that('the assigned driver can now see it', count(*) = 1) from public.jobs where id = :'job';

-- === a driver may not touch a delivery that is not theirs ==================
select act_as(:'RIVAL');
do $$ begin
  perform public.accept_job(current_setting('test.job')::uuid);
  raise exception 'FAIL: a stranger accepted the delivery';
exception
  when sqlstate '42501' then raise notice 'pass  a driver cannot accept a delivery assigned to someone else';
  when sqlstate 'P0002' then raise notice 'pass  a delivery outside the team is not even visible to act on';
end $$;

-- === a driver may not promote themselves ===================================
select act_as(:'DRIVER');
do $$ begin
  begin
    update public.profiles set role = 'boss' where id = auth.uid();
  exception when insufficient_privilege then
    raise notice 'pass  a driver is refused the role change outright';
    return;
  end;
  if (select role from public.profiles where id = auth.uid()) = 'boss' then
    raise exception 'FAIL: a driver made themselves a dispatcher';
  end if;
  raise notice 'pass  a driver cannot promote themselves to dispatcher';
end $$;

-- === a driver may not edit the money or the count ==========================
do $$
declare v_cash numeric;
begin
  begin
    update public.jobs set cash_to_collect = 0 where id = current_setting('test.job')::uuid;
  exception when insufficient_privilege then
    raise notice 'pass  a driver is refused a direct write to the delivery';
    return;
  end;
  select cash_to_collect into v_cash from public.jobs where id = current_setting('test.job')::uuid;
  if v_cash <> 250.00 then
    raise exception 'FAIL: a driver rewrote the cash to collect';
  end if;
  raise notice 'pass  a driver cannot rewrite the cash to collect';
end $$;
