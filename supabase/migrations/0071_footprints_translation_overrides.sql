-- Lets a super admin correct a Khmer (or English) UI string from inside
-- the app, taking effect for everyone without a code deploy. The static
-- src/i18n/en.ts / km.ts dictionaries stay the shipped defaults; a row
-- here overrides one (key, language) pair on top of them -- see
-- src/i18n/LanguageContext.tsx.
--
-- Global config, not owned by any one user -- RLS copies work_locations'
-- exact shape (verified live: pg_policies on public.work_locations),
-- reusing the existing 'settings' module's 'edit' action rather than
-- registering a new module.
create table public.translation_overrides (
  key text not null,
  language text not null check (language in ('en', 'km')),
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id),
  primary key (key, language)
);

alter table public.translation_overrides enable row level security;

create policy translation_overrides_select on public.translation_overrides
  for select to authenticated
  using (true);

create policy translation_overrides_write on public.translation_overrides
  for all to authenticated
  using (app.can('settings', 'edit'))
  with check (app.can('settings', 'edit'));
