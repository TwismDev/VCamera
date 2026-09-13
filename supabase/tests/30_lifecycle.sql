\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set BOSS   '11111111-1111-1111-1111-111111111111'
\set DRIVER '22222222-2222-2222-2222-222222222222'

set role authenticated;
select act_as(:'DRIVER');
select set_config('test.job', (select id::text from public.jobs limit 1), false);
select current_setting('test.job') as job \gset

-- === the driver must accept before anything else ===========================
do $$ begin
  perform public.start_trip(current_setting('test.job')::uuid);
  raise exception 'FAIL: the trip started before the job was accepted';
exception when sqlstate '22023' then raise notice 'pass  a trip cannot start before the job is accepted';
end $$;

select check_that('the driver accepts the delivery', (public.accept_job(:'job')).status = 'accepted');

do $$ begin
  perform public.accept_job(current_setting('test.job')::uuid);
  raise exception 'FAIL: the same job was accepted twice';
exception when sqlstate '22023' then raise notice 'pass  a job cannot be accepted twice';
end $$;

-- === the arrival time ======================================================
select check_that('the driver reports an arrival time',
                  (public.submit_eta(:'job', now() + interval '25 minutes', 'manual', 25)).eta_at is not null);
select check_that('the arrival time is recorded as driver-entered', eta_source = 'manual')
  from public.jobs where id = :'job';

select check_that('a live estimate replaces the typed one',
                  (public.submit_eta(:'job', now() + interval '18 minutes', 'auto', 18)).eta_source = 'auto');

-- === the trip ==============================================================
select check_that('the driver starts the trip', (public.start_trip(:'job')).status = 'en_route');
select check_that('the start time is stamped', started_at is not null) from public.jobs where id = :'job';

-- === live position =========================================================
select check_that('a batch of positions is accepted', public.report_locations(
  jsonb_build_array(
    jsonb_build_object('lat', -33.9249, 'lng', 18.4241, 'recorded_at', (now() - interval '2 min')::text,
                       'job_id', :'job', 'battery_pct', 88, 'speed_mps', 12.5),
    jsonb_build_object('lat', -33.9200, 'lng', 18.4200, 'recorded_at', now()::text,
                       'job_id', :'job', 'battery_pct', 87, 'speed_mps', 10.0)
  )) = 2);

select check_that('the live position is the newest fix', lat = -33.9200)
  from public.driver_locations where driver_id = :'DRIVER';
select check_that('the breadcrumb trail is kept', count(*) = 2)
  from public.location_pings where job_id = :'job';

-- A delayed flush of older fixes must not drag the live marker backwards.
select public.report_locations(jsonb_build_array(
  jsonb_build_object('lat', -33.9999, 'lng', 18.9999, 'recorded_at', (now() - interval '10 min')::text, 'job_id', :'job')));
select check_that('a late upload does not overwrite a fresher position', lat = -33.9200)
  from public.driver_locations where driver_id = :'DRIVER';

-- Nonsense coordinates are dropped rather than stored.
select check_that('out-of-range coordinates are discarded', public.report_locations(
  jsonb_build_array(jsonb_build_object('lat', 999, 'lng', 0, 'recorded_at', now()::text))) = 0);

-- === completion ============================================================
select check_that('the driver marks arrival', (public.mark_arrived(:'job')).status = 'arrived');
select check_that('the delivery is completed with the real figures',
                  (public.complete_job(:'job', 10, 200.00, 'Two cases damaged in transit')).status = 'completed');

select check_that('the delivered count is what the driver reported', delivered_count = 10)
  from public.jobs where id = :'job';
select check_that('the cash collected is what the driver reported', cash_collected = 200.00)
  from public.jobs where id = :'job';
select check_that('the ordered figures are still on record', product_count = 12 and cash_to_collect = 250.00)
  from public.jobs where id = :'job';
select check_that('tracking is detached from the finished job', job_id is null)
  from public.driver_locations where driver_id = :'DRIVER';

do $$ begin
  perform public.complete_job(current_setting('test.job')::uuid, 12, 250.00, null);
  raise exception 'FAIL: a completed delivery was completed again';
exception when sqlstate '22023' then raise notice 'pass  a completed delivery cannot be completed again';
end $$;

-- === the timeline the dispatcher reads =====================================
select check_that('every step was recorded in the timeline', count(*) >= 6)
  from public.job_events where job_id = :'job';
select check_that('the completion event carries both sets of figures',
                  payload ->> 'delivered_count' = '10' and payload ->> 'cash_expected' = '250.00')
  from public.job_events where job_id = :'job' and type = 'completed';

-- === the dispatcher's read model ===========================================
select act_as(:'BOSS');
select check_that('the dispatcher sees the driver in the fleet view', count(*) = 1)
  from public.driver_status where driver_id = :'DRIVER';
select check_that('a finished delivery leaves the driver with no active job', job_id is null)
  from public.driver_status where driver_id = :'DRIVER';
select check_that('the dispatcher can read the completion report', delivered_count = 10 and cash_collected = 200.00)
  from public.jobs where id = :'job';
