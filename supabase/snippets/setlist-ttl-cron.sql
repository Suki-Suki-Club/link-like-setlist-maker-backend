-- Setlist TTL cleanup job.
-- Run this once per Supabase project from the SQL editor (or psql with an admin role).
-- Prerequisite: enable the pg_cron extension (Dashboard > Database > Extensions > pg_cron).

create extension if not exists pg_cron;

-- Re-running this snippet replaces the existing schedule.
select cron.unschedule('delete-stale-setlists')
where exists (select 1 from cron.job where jobname = 'delete-stale-setlists');

-- Daily at 18:00 UTC (03:00 JST): delete setlists not accessed for 180 days.
-- "Setlist"."lastAccessedAt" is refreshed on reads/dedup hits at most once per day,
-- and is indexed by Setlist_lastAccessedAt_idx.
select cron.schedule(
  'delete-stale-setlists',
  '0 18 * * *',
  $$ delete from "Setlist" where "lastAccessedAt" < now() - interval '180 days' $$
);
