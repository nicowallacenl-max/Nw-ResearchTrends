-- Supabase security advisor fixes.
-- Pin search_path on helper/trigger functions.
alter function public.procedure_order(public.procedure_type)    set search_path = public;
alter function public.block_segment_delete()                    set search_path = public;
alter function public.work_segments_audit()                     set search_path = public;
alter function public.work_segments_protect_originals()         set search_path = public;

-- Role-check helpers are only needed by signed-in users (RLS policies run as the caller).
revoke all on function public.current_app_role() from public, anon;
revoke all on function public.is_admin()         from public, anon;
revoke all on function public.is_staff()         from public, anon;
grant execute on function public.current_app_role(), public.is_admin(), public.is_staff() to authenticated;
