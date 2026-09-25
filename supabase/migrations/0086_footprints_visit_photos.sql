-- Footprints: visit photos (shelf / receipt / other) taken at check-out.
--
-- Files live in a new private 'visits' bucket, path
-- <user_id>/<visit_id>/<uuid>.jpg -- the same <owner-folder>/<file> shape as
-- the 'attendance' bucket (0066), with the same read rule keyed on the
-- 'visit' module instead of 'attendance'. The visit_photos row is the index
-- the app lists from; the parent visit's owner decides who may see it.

create table public.visit_photos (
  id          uuid primary key default gen_random_uuid(),
  visit_id    uuid not null references public.visits(id) on delete cascade,
  photo_path  text not null,
  kind        text not null default 'other' check (kind in ('shelf', 'receipt', 'other')),
  created_by  uuid not null default auth.uid() references public.users(id),
  created_at  timestamptz not null default now()
);

comment on table public.visit_photos is
  'Photos a rep attached to a visit (shelf, receipt, other). photo_path is a key in the private ''visits'' storage bucket.';

create index visit_photos_visit_id_idx on public.visit_photos (visit_id);
create index visit_photos_created_by_idx on public.visit_photos (created_by);

alter table public.visit_photos enable row level security;

create policy visit_photos_select on public.visit_photos
  for select to authenticated
  using (exists (
    select 1 from public.visits v
     where v.id = visit_photos.visit_id
       and app.can('visit', 'view', v.user_id)
  ));

create policy visit_photos_insert on public.visit_photos
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.visits v
       where v.id = visit_photos.visit_id
         and v.user_id = (select auth.uid())
    )
  );

create policy visit_photos_delete on public.visit_photos
  for delete to authenticated
  using (created_by = (select auth.uid()));

grant select, insert, delete on public.visit_photos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('visits', 'visits', false, 5242880, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;

create policy visits_storage_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'visits'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy visits_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'visits'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or app.can('visit', 'view', ((storage.foldername(name))[1])::uuid)
    )
  );

create policy visits_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'visits'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
