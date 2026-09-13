\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'boss@example.com',   '{"full_name":"Dana Boss"}'),
  ('22222222-2222-2222-2222-222222222222', 'driver@example.com', '{"full_name":"Sam Driver"}'),
  ('33333333-3333-3333-3333-333333333333', 'rival@example.com',  '{"full_name":"Rio Rival"}');

select check_that('sign-up creates a profile for every user', count(*) = 3) from public.profiles;
select check_that('nobody is a dispatcher until they create a team', bool_and(role = 'driver')) from public.profiles;

-- === onboarding ============================================================
set role authenticated;
select act_as('11111111-1111-1111-1111-111111111111');
select check_that('creating a team promotes the creator to dispatcher',
                  (public.create_org('Morgan Distribution')).name = 'Morgan Distribution');
select check_that('the creator is now a dispatcher', role = 'boss') from public.profiles where id = auth.uid();
reset role;

-- The dispatcher reads the code off their Team screen and tells the driver.
select join_code as code from public.orgs \gset

set role authenticated;
select act_as('22222222-2222-2222-2222-222222222222');
select check_that('a driver joins with the team code', (public.join_org(:'code')).name is not null);
select check_that('a joining user is a driver, not a dispatcher', role = 'driver') from public.profiles where id = auth.uid();

select act_as('33333333-3333-3333-3333-333333333333');
do $$ begin
  perform public.join_org('BADCOD');
  raise exception 'FAIL: an unknown team code was accepted';
exception when sqlstate 'P0002' then raise notice 'pass  an unknown team code is rejected';
end $$;

do $$ begin
  perform public.create_org('Second Team');
  perform public.join_org('ANYTHING');
  raise exception 'FAIL: a user joined a second team';
exception when sqlstate '23505' then raise notice 'pass  a user cannot belong to two teams';
end $$;
reset role;
