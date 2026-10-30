-- Run the knock-off clock-off every 5 minutes (Supabase pg_cron). Skipped where pg_cron isn't available.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'auto-clock-off';
    perform cron.schedule('auto-clock-off', '*/5 * * * *', 'select public.auto_clock_off()');
  end if;
end $$;
