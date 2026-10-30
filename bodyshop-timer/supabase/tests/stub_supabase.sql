-- Minimal stand-in for Supabase's built-in objects, for local testing only.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
create schema extensions; 
grant usage on schema public, auth to anon, authenticated, service_role;
