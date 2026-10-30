-- Supabase security advisor fix.
-- (The advisor also lists kiosk_* as callable without sign-in: that is intended. They are the wall
-- board's only entry point and check the paired device key and the technician's PIN themselves.)
alter function public.kiosk_err(text, text) set search_path = public;
