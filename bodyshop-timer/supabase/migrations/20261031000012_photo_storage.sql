-- Job photo storage (Supabase Storage). Public-read bucket: photo object names are random UUIDs, so a photo
-- is only reachable through the job page or that job's customer tracker link. Only admins can upload/remove.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('job-photos', 'job-photos', true) on conflict (id) do nothing;
    drop policy if exists job_photos_admin_select on storage.objects;
    drop policy if exists job_photos_admin_insert on storage.objects;
    drop policy if exists job_photos_admin_update on storage.objects;
    drop policy if exists job_photos_admin_delete on storage.objects;
    -- (deletes through the Storage API need select permission too)
    create policy job_photos_admin_select on storage.objects for select to authenticated using (bucket_id = 'job-photos' and public.is_admin());
    create policy job_photos_admin_insert on storage.objects for insert to authenticated with check (bucket_id = 'job-photos' and public.is_admin());
    create policy job_photos_admin_update on storage.objects for update to authenticated using (bucket_id = 'job-photos' and public.is_admin());
    create policy job_photos_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'job-photos' and public.is_admin());
  end if;
end $$;
