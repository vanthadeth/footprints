-- Footprints: surveys -- structured market data a salesperson collects from a
-- customer about one product or category: whether they sell it, how well,
-- which brands they buy at what price, what they like and dislike.
--
--   * Admin-built, versioned templates. A template targets one item or one
--     item category. Editing a published template makes a new draft version;
--     publishing it freezes the questions, so answers already collected keep
--     the questions they were answered against and reports never break.
--   * One new permission module, survey. Its owner for app.can() is the
--     surveyor (surveys.user_id): 'own' = your own surveys, 'sub' = your
--     team's, 'any' = everyone's. 'add' lets you fill one in, 'view' lets you
--     read them, 'edit' lets you correct someone else's -- and, at scope
--     'any', build and publish templates.
--   * A survey is optionally linked to a visit (visit_id), never required.
--   * Base tables are read through RLS and written only through the security
--     definer app.* RPCs below, each with a thin public.* wrapper -- the
--     convention every prior migration here follows (see 0093).
--   * Brand + price lines live in their own table so prices can be compared
--     across customers; everything else is an answer row keyed by question.
--   * Customer / user / target display names come from security definer
--     helpers (the 0093 ones for customers and users) because the base
--     tables' RLS would hide them from own/sub scoped roles.
--
-- Assumes app.can(module, action, owner_id) treats a null owner as "no
-- owner": true only for scope 'any'. Template management relies on that.

-- ---------------------------------------------------------------- module

insert into public.modules (key, name, icon, href, sort_order, active, group_name) values
  ('survey', 'Surveys', 'clipboard-list', 'surveys', 18, true, 'Selling');

insert into public.role_permissions (role_id, module_key, action, scope)
select r.id, 'survey', v.action::public.permission_action, v.scope::public.permission_scope
from public.roles r
join (values
  ('sales', 'view', 'own'), ('sales', 'add', 'own'),
  ('remote_sales', 'view', 'own'), ('remote_sales', 'add', 'own'),
  ('sale_admin', 'view', 'any'), ('sale_admin', 'add', 'own'),
  ('sales_supervisor', 'view', 'sub'), ('sales_supervisor', 'add', 'own'), ('sales_supervisor', 'edit', 'sub'),
  ('sales_manager', 'view', 'any'), ('sales_manager', 'add', 'own'), ('sales_manager', 'edit', 'any'),
  ('system_admin', 'view', 'any'), ('system_admin', 'add', 'any'), ('system_admin', 'edit', 'any'), ('system_admin', 'delete', 'any')
) as v(role_key, action, scope) on v.role_key = r.key;

-- ---------------------------------------------------------------- tables

create table public.survey_templates (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null check (char_length(btrim(title)) between 1 and 200),
  title_alt           text check (char_length(title_alt) <= 200),
  target_kind         text not null check (target_kind in ('item', 'category')),
  item_id             uuid references public.items(id),
  category_id         uuid references public.item_categories(id),
  active              boolean not null default true,
  current_version_id  uuid,
  created_by          uuid not null default auth.uid() references public.users(id),
  created_at          timestamptz not null default now(),
  constraint survey_templates_target check (
    (target_kind = 'item' and item_id is not null and category_id is null)
    or (target_kind = 'category' and category_id is not null and item_id is null)
  )
);

create table public.survey_template_versions (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.survey_templates(id) on delete cascade,
  version_no   integer not null,
  published_at timestamptz,
  created_by   uuid not null default auth.uid() references public.users(id),
  created_at   timestamptz not null default now(),
  constraint survey_template_versions_unique unique (template_id, version_no)
);

alter table public.survey_templates
  add constraint survey_templates_current_version_fk
  foreign key (current_version_id) references public.survey_template_versions(id);

create index survey_template_versions_template_idx on public.survey_template_versions (template_id);

create table public.survey_questions (
  id          uuid primary key default gen_random_uuid(),
  version_id  uuid not null references public.survey_template_versions(id) on delete cascade,
  sort_order  integer not null,
  type        text not null check (type in ('single', 'multi', 'rating', 'brand_price', 'text', 'number', 'yesno', 'photo')),
  label       text not null check (char_length(btrim(label)) between 1 and 300),
  label_alt   text check (char_length(label_alt) <= 300),
  required    boolean not null default false,
  -- [{ "key": "sells", "label": "Yes, sells it", "label_alt": "..." }] for single / multi.
  options     jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  constraint survey_questions_choice_options check (
    type not in ('single', 'multi') or jsonb_array_length(options) > 0
  )
);

create index survey_questions_version_idx on public.survey_questions (version_id, sort_order);

create table public.surveys (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references public.survey_templates(id),
  version_id    uuid not null references public.survey_template_versions(id),
  user_id       uuid not null default auth.uid() references public.users(id),
  customer_id   uuid not null references public.customers(id),
  visit_id      uuid references public.visits(id) on delete set null,
  surveyed_at   timestamptz not null default now(),
  status        text not null default 'draft' check (status in ('draft', 'submitted')),
  submitted_at  timestamptz,
  remarks       text check (char_length(remarks) <= 4000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint surveys_submitted_at check ((status = 'submitted') = (submitted_at is not null))
);

create index surveys_user_idx on public.surveys (user_id, surveyed_at desc);
create index surveys_customer_idx on public.surveys (customer_id, surveyed_at desc);
create index surveys_template_idx on public.surveys (template_id, surveyed_at desc);
create index surveys_visit_idx on public.surveys (visit_id) where visit_id is not null;

create table public.survey_answers (
  survey_id     uuid not null references public.surveys(id) on delete cascade,
  question_id   uuid not null references public.survey_questions(id),
  value_text    text check (char_length(value_text) <= 4000),   -- text, single (option key), yesno ('yes' | 'no')
  value_number  numeric,                                         -- number, rating
  value_json    jsonb,                                           -- multi: ["option key", ...]
  primary key (survey_id, question_id)
);

create table public.survey_brand_prices (
  id           uuid primary key default gen_random_uuid(),
  survey_id    uuid not null references public.surveys(id) on delete cascade,
  question_id  uuid not null references public.survey_questions(id),
  brand_id     uuid references public.brands(id),
  brand_other  text check (char_length(btrim(brand_other)) between 1 and 120),
  price_usd    numeric(12, 2) not null check (price_usd >= 0),
  unit         text not null default 'piece' check (unit in ('piece', 'box', 'carton')),
  constraint survey_brand_prices_brand check ((brand_id is not null) <> (brand_other is not null))
);

create index survey_brand_prices_survey_idx on public.survey_brand_prices (survey_id);

create table public.survey_photos (
  id           uuid primary key default gen_random_uuid(),
  survey_id    uuid not null references public.surveys(id) on delete cascade,
  question_id  uuid references public.survey_questions(id),
  photo_path   text not null,
  created_by   uuid not null default auth.uid() references public.users(id),
  created_at   timestamptz not null default now()
);

create index survey_photos_survey_idx on public.survey_photos (survey_id);

comment on table public.survey_templates is 'Admin-built survey forms; each targets one item or one item category. current_version_id is the published version salespeople fill in.';
comment on table public.survey_questions is 'Questions of one template version. Frozen once the version is published (trigger below).';
comment on table public.surveys is 'One salesperson''s survey of one customer on one template version, optionally linked to a visit. Submitted surveys stay editable by their author for 24 hours.';
comment on table public.survey_brand_prices is 'Brand + purchase price lines of a brand_price question: a brand from brands, or free text for an unknown one.';

-- ---------------------------------------------------------------- freeze published versions

create function app.survey_version_is_published(p_version uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$ select coalesce((select v.published_at is not null from public.survey_template_versions v where v.id = p_version), false); $function$;

create function app.survey_questions_freeze()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_version uuid := case when tg_op = 'INSERT' then new.version_id else old.version_id end;
begin
  -- A cascade from deleting the whole template/version is fine: only block direct edits.
  if app.survey_version_is_published(v_version) then
    raise exception 'invalid_input' using detail = 'This template version is published; questions can no longer change. Edit a new version instead.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create trigger survey_questions_freeze
  before insert or update or delete on public.survey_questions
  for each row execute function app.survey_questions_freeze();

-- ---------------------------------------------------------------- helpers

create function app.can_manage_survey_templates()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$ select app.can('survey', 'edit', null); $function$;

comment on function app.can_manage_survey_templates is
  'True when the caller may build and publish survey templates: survey edit at scope any.';

create function app.can_use_surveys()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select app.can('survey', 'add', auth.uid())
      or app.can('survey', 'view', auth.uid())
      or app.can('survey', 'edit', null);
$function$;

comment on function app.can_use_surveys is
  'True when the caller has any survey permission -- enough to see the published templates.';

create function app.can_view_survey(p_survey uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1 from public.surveys s
     where s.id = p_survey
       and (s.user_id = auth.uid() or (s.status = 'submitted' and app.can('survey', 'view', s.user_id)))
  );
$function$;

comment on function app.can_view_survey is
  'The author always sees their own survey (drafts included); others need survey view on the author and a submitted survey.';

create function app.survey_target_name(p_kind text, p_item uuid, p_category uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select case p_kind
    when 'item' then (select i.name from public.items i where i.id = p_item)
    else (select c.name from public.item_categories c where c.id = p_category)
  end;
$function$;

-- ---------------------------------------------------------------- RLS

alter table public.survey_templates enable row level security;
alter table public.survey_template_versions enable row level security;
alter table public.survey_questions enable row level security;
alter table public.surveys enable row level security;
alter table public.survey_answers enable row level security;
alter table public.survey_brand_prices enable row level security;
alter table public.survey_photos enable row level security;

create policy survey_templates_select on public.survey_templates
  for select to authenticated
  using (app.can_manage_survey_templates() or (active and app.can_use_surveys()));

-- Salespeople only see published versions; managers also see drafts.
create policy survey_template_versions_select on public.survey_template_versions
  for select to authenticated
  using (app.can_manage_survey_templates() or (published_at is not null and app.can_use_surveys()));

create policy survey_questions_select on public.survey_questions
  for select to authenticated
  using (
    app.can_manage_survey_templates()
    or (app.can_use_surveys() and app.survey_version_is_published(version_id))
  );

create policy surveys_select on public.surveys
  for select to authenticated using (app.can_view_survey(id));

create policy survey_answers_select on public.survey_answers
  for select to authenticated using (app.can_view_survey(survey_id));

create policy survey_brand_prices_select on public.survey_brand_prices
  for select to authenticated using (app.can_view_survey(survey_id));

create policy survey_photos_select on public.survey_photos
  for select to authenticated using (app.can_view_survey(survey_id));

create policy survey_photos_insert on public.survey_photos
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (select 1 from public.surveys s where s.id = survey_photos.survey_id and s.user_id = (select auth.uid()))
  );

create policy survey_photos_delete on public.survey_photos
  for delete to authenticated using (created_by = (select auth.uid()));

grant select on public.survey_templates, public.survey_template_versions, public.survey_questions,
  public.surveys, public.survey_answers, public.survey_brand_prices to authenticated;
grant select, insert, delete on public.survey_photos to authenticated;

-- ---------------------------------------------------------------- storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('surveys', 'surveys', false, 5242880, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;

create policy surveys_storage_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'surveys' and (storage.foldername(name))[1] = auth.uid()::text);

create policy surveys_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'surveys'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.survey_photos p
         where p.photo_path = storage.objects.name and app.can_view_survey(p.survey_id)
      )
    )
  );

create policy surveys_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'surveys' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------- RPCs: templates

-- Saves a template and its questions as a draft version, and optionally
-- publishes it. p_questions: [{ type, label, label_alt, required, options: [{key, label, label_alt}] }].
-- If the template has an unpublished draft version it is rewritten in place;
-- otherwise a new version (max + 1) is started, so a published version is
-- never touched.
create function app.save_survey_template(
  p_template_id  uuid,
  p_title        text,
  p_title_alt    text,
  p_target_kind  text,
  p_item_id      uuid,
  p_category_id  uuid,
  p_questions    jsonb,
  p_publish      boolean default false
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_template uuid := p_template_id;
  v_version  uuid;
  v_no       integer;
  v_q        jsonb;
  v_i        integer := 0;
begin
  if not app.can_manage_survey_templates() then
    raise exception 'insufficient_privilege' using detail = 'You can''t build survey templates.';
  end if;
  if jsonb_typeof(coalesce(p_questions, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'invalid_input' using detail = 'A template needs at least one question.';
  end if;

  if v_template is null then
    insert into public.survey_templates (title, title_alt, target_kind, item_id, category_id)
    values (btrim(p_title), nullif(btrim(coalesce(p_title_alt, '')), ''), p_target_kind,
            case when p_target_kind = 'item' then p_item_id end,
            case when p_target_kind = 'category' then p_category_id end)
    returning id into v_template;
  else
    if not exists (select 1 from public.survey_templates where id = v_template) then
      raise exception 'not_found';
    end if;
    update public.survey_templates
       set title = btrim(p_title),
           title_alt = nullif(btrim(coalesce(p_title_alt, '')), ''),
           target_kind = p_target_kind,
           item_id = case when p_target_kind = 'item' then p_item_id end,
           category_id = case when p_target_kind = 'category' then p_category_id end
     where id = v_template;
  end if;

  select v.id into v_version
    from public.survey_template_versions v
   where v.template_id = v_template and v.published_at is null
   order by v.version_no desc limit 1;

  if v_version is null then
    select coalesce(max(version_no), 0) + 1 into v_no from public.survey_template_versions where template_id = v_template;
    insert into public.survey_template_versions (template_id, version_no) values (v_template, v_no) returning id into v_version;
  else
    delete from public.survey_questions where version_id = v_version;
  end if;

  for v_q in select * from jsonb_array_elements(p_questions) loop
    v_i := v_i + 1;
    insert into public.survey_questions (version_id, sort_order, type, label, label_alt, required, options)
    values (
      v_version, v_i,
      v_q->>'type',
      btrim(v_q->>'label'),
      nullif(btrim(coalesce(v_q->>'label_alt', '')), ''),
      coalesce((v_q->>'required')::boolean, false),
      case when v_q->>'type' in ('single', 'multi') then coalesce(v_q->'options', '[]'::jsonb) else '[]'::jsonb end
    );
  end loop;

  if p_publish then
    update public.survey_template_versions set published_at = now() where id = v_version;
    update public.survey_templates set current_version_id = v_version where id = v_template;
  end if;

  return v_template;
end;
$function$;

comment on function app.save_survey_template is
  'Creates or updates a survey template and writes its questions to the draft version (starting one if the latest is published); p_publish freezes it and makes it the version salespeople fill in. Needs survey edit at scope any.';

create function app.set_survey_template_active(p_template_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not app.can_manage_survey_templates() then
    raise exception 'insufficient_privilege';
  end if;
  update public.survey_templates set active = p_active where id = p_template_id;
  if not found then
    raise exception 'not_found';
  end if;
end;
$function$;

-- ---------------------------------------------------------------- RPCs: surveys

-- Creates or updates a survey and replaces its answers.
--   p_answers:       [{ question_id, value_text, value_number, value_json }]
--   p_brand_prices:  [{ question_id, brand_id, brand_other, price_usd, unit }]
-- p_submit validates required questions and locks the survey after 24 hours.
create function app.save_survey(
  p_survey_id     uuid,
  p_template_id   uuid,
  p_customer_id   uuid,
  p_visit_id      uuid,
  p_answers       jsonb,
  p_brand_prices  jsonb,
  p_remarks       text default null,
  p_submit        boolean default false
)
returns public.surveys
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me      uuid := auth.uid();
  v_row     public.surveys;
  v_version uuid;
  v_q       record;
begin
  if p_survey_id is null then
    if not app.can('survey', 'add', v_me) then
      raise exception 'insufficient_privilege' using detail = 'You can''t fill in surveys.';
    end if;
    if not exists (select 1 from public.customers where id = p_customer_id) then
      raise exception 'not_found';
    end if;
    select t.current_version_id into v_version
      from public.survey_templates t where t.id = p_template_id and t.active;
    if v_version is null then
      raise exception 'invalid_input' using detail = 'That template isn''t published.';
    end if;
    if p_visit_id is not null and not exists (
      select 1 from public.visits v where v.id = p_visit_id and v.user_id = v_me and v.customer_id = p_customer_id
    ) then
      raise exception 'invalid_input' using detail = 'That visit isn''t yours, or isn''t at this customer.';
    end if;
    insert into public.surveys (template_id, version_id, user_id, customer_id, visit_id, remarks)
    values (p_template_id, v_version, v_me, p_customer_id, p_visit_id, nullif(btrim(coalesce(p_remarks, '')), ''))
    returning * into v_row;
  else
    select * into v_row from public.surveys where id = p_survey_id for update;
    if not found then
      raise exception 'not_found';
    end if;
    if v_row.user_id = v_me then
      if v_row.status = 'submitted' and v_row.submitted_at < now() - interval '24 hours' then
        raise exception 'invalid_input' using detail = 'A submitted survey can only be edited for 24 hours.';
      end if;
    elsif not app.can('survey', 'edit', v_row.user_id) then
      raise exception 'insufficient_privilege';
    end if;
    update public.surveys
       set remarks = nullif(btrim(coalesce(p_remarks, '')), ''), updated_at = now()
     where id = p_survey_id
    returning * into v_row;
  end if;

  delete from public.survey_answers where survey_id = v_row.id;
  delete from public.survey_brand_prices where survey_id = v_row.id;

  insert into public.survey_answers (survey_id, question_id, value_text, value_number, value_json)
  select v_row.id, x.question_id, nullif(btrim(x.value_text), ''), x.value_number, x.value_json
  from jsonb_to_recordset(coalesce(p_answers, '[]'::jsonb))
       as x(question_id uuid, value_text text, value_number numeric, value_json jsonb)
  where exists (select 1 from public.survey_questions q where q.id = x.question_id and q.version_id = v_row.version_id)
    and (nullif(btrim(x.value_text), '') is not null or x.value_number is not null
         or (x.value_json is not null and x.value_json <> '[]'::jsonb and x.value_json <> 'null'::jsonb));

  insert into public.survey_brand_prices (survey_id, question_id, brand_id, brand_other, price_usd, unit)
  select v_row.id, x.question_id, x.brand_id, nullif(btrim(x.brand_other), ''), x.price_usd, coalesce(x.unit, 'piece')
  from jsonb_to_recordset(coalesce(p_brand_prices, '[]'::jsonb))
       as x(question_id uuid, brand_id uuid, brand_other text, price_usd numeric, unit text)
  where exists (select 1 from public.survey_questions q where q.id = x.question_id and q.version_id = v_row.version_id and q.type = 'brand_price');

  if p_submit then
    for v_q in
      select q.id, q.label, q.type from public.survey_questions q
       where q.version_id = v_row.version_id and q.required order by q.sort_order
    loop
      if v_q.type = 'brand_price' then
        if not exists (select 1 from public.survey_brand_prices where survey_id = v_row.id and question_id = v_q.id) then
          raise exception 'invalid_input' using detail = 'Answer: ' || v_q.label;
        end if;
      elsif v_q.type = 'photo' then
        if not exists (select 1 from public.survey_photos where survey_id = v_row.id and question_id = v_q.id) then
          raise exception 'invalid_input' using detail = 'Answer: ' || v_q.label;
        end if;
      elsif not exists (select 1 from public.survey_answers where survey_id = v_row.id and question_id = v_q.id) then
        raise exception 'invalid_input' using detail = 'Answer: ' || v_q.label;
      end if;
    end loop;

    update public.surveys
       set status = 'submitted', submitted_at = coalesce(submitted_at, now())
     where id = v_row.id
    returning * into v_row;
  end if;

  return v_row;
end;
$function$;

comment on function app.save_survey is
  'Creates or updates a survey (a draft until p_submit) and replaces its answers and brand+price lines. Authors edit their own; submitted surveys lock after 24 hours; survey edit on the author lets a manager correct it.';

create function app.delete_survey_draft(p_survey_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  delete from public.surveys where id = p_survey_id and user_id = auth.uid() and status = 'draft';
  if not found then
    raise exception 'not_found';
  end if;
end;
$function$;

-- ---------------------------------------------------------------- read models

-- The survey list: names resolved, the first single-choice answer as a headline
-- (usually the outcome), and how many brands were compared.
create view public.survey_feed
  with (security_invoker = true)
  as
  select
    s.id,
    s.template_id,
    t.title as template_title,
    t.title_alt as template_title_alt,
    t.target_kind,
    app.survey_target_name(t.target_kind, t.item_id, t.category_id) as target_name,
    s.customer_id,
    app.conversation_customer_name(s.customer_id) as customer_name,
    s.user_id,
    app.conversation_user_name(s.user_id) as user_name,
    s.visit_id,
    s.surveyed_at,
    s.status,
    s.submitted_at,
    s.remarks,
    h.option_label as headline,
    h.option_label_alt as headline_alt,
    h.option_key as headline_key,
    (select count(*) from public.survey_brand_prices p where p.survey_id = s.id)::integer as brand_count,
    (s.user_id = (select auth.uid()) and (s.status = 'draft' or s.submitted_at > now() - interval '24 hours')) as editable
  from public.surveys s
  join public.survey_templates t on t.id = s.template_id
  left join lateral (
    select a.value_text as option_key,
           coalesce(o->>'label', a.value_text) as option_label,
           o->>'label_alt' as option_label_alt
      from public.survey_questions q
      join public.survey_answers a on a.question_id = q.id and a.survey_id = s.id
      left join lateral (
        select e from jsonb_array_elements(q.options) e where e->>'key' = a.value_text limit 1
      ) opt(o) on true
     where q.version_id = s.version_id and q.type = 'single'
     order by q.sort_order limit 1
  ) h on true;

comment on view public.survey_feed is
  'Surveys with customer / surveyor / target names, a headline (the first single-choice answer) and brand count. Scoped by surveys RLS.';

-- Report numbers for one template across all its versions, grouped by question
-- text. Runs as the caller, so surveys RLS decides whose surveys are counted.
create function public.survey_report(
  p_template_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_user_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $function$
  with s as (
    select * from public.surveys
     where template_id = p_template_id
       and status = 'submitted'
       and surveyed_at >= coalesce(p_from, '-infinity'::timestamptz)
       and surveyed_at < coalesce(p_to, 'infinity'::timestamptz)
       and (p_user_id is null or user_id = p_user_id)
  ),
  ans as (
    select s.id as survey_id, q.label, q.type, q.sort_order, q.options, a.value_text, a.value_number, a.value_json
      from s
      join public.survey_answers a on a.survey_id = s.id
      join public.survey_questions q on q.id = a.question_id
  ),
  qs as (
    select label, type, min(sort_order) as ord, count(distinct survey_id) as answered,
           round(avg(value_number), 2) as avg_value
      from ans group by label, type
  ),
  opt as (
    select a.label, a.type, k.okey,
           max(coalesce((select e->>'label' from jsonb_array_elements(a.options) e where e->>'key' = k.okey limit 1), k.okey)) as olabel,
           count(*) as n
      from ans a
      cross join lateral unnest(
        case a.type
          when 'multi' then coalesce(array(select jsonb_array_elements_text(a.value_json)), '{}'::text[])
          when 'single' then array[a.value_text]
          when 'yesno' then array[a.value_text]
          else '{}'::text[]
        end
      ) as k(okey)
     where k.okey is not null and a.type in ('single', 'multi', 'yesno')
     group by a.label, a.type, k.okey
  ),
  bp as (
    select coalesce(b.name, p.brand_other) as brand, p.unit, p.price_usd
      from s
      join public.survey_brand_prices p on p.survey_id = s.id
      left join public.brands b on b.id = p.brand_id
  )
  select jsonb_build_object(
    'total', (select count(*) from s),
    'customers', (select count(distinct customer_id) from s),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', qs.label, 'type', qs.type, 'answered', qs.answered, 'avg', qs.avg_value,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object('key', opt.okey, 'label', opt.olabel, 'n', opt.n) order by opt.n desc, opt.olabel)
            from opt where opt.label = qs.label and opt.type = qs.type
        ), '[]'::jsonb)
      ) order by qs.ord)
      from qs
    ), '[]'::jsonb),
    'brands', coalesce((
      select jsonb_agg(jsonb_build_object(
        'brand', x.brand, 'unit', x.unit, 'n', x.n, 'min', x.min_p, 'avg', x.avg_p, 'max', x.max_p
      ) order by x.brand, x.unit)
      from (
        select brand, unit, count(*) as n, min(price_usd) as min_p, round(avg(price_usd), 2) as avg_p, max(price_usd) as max_p
          from bp group by brand, unit
      ) x
    ), '[]'::jsonb)
  );
$function$;

comment on function public.survey_report is
  'Aggregates for the survey report: totals, per-question option counts / averages, and min/avg/max brand prices. Runs as the caller (RLS-scoped).';

-- ---------------------------------------------------------------- public wrappers

create function public.save_survey_template(
  p_template_id uuid, p_title text, p_title_alt text, p_target_kind text,
  p_item_id uuid, p_category_id uuid, p_questions jsonb, p_publish boolean default false
)
returns uuid
language sql
set search_path to ''
as $function$ select app.save_survey_template(p_template_id, p_title, p_title_alt, p_target_kind, p_item_id, p_category_id, p_questions, p_publish); $function$;

create function public.set_survey_template_active(p_template_id uuid, p_active boolean)
returns void
language sql
set search_path to ''
as $function$ select app.set_survey_template_active(p_template_id, p_active); $function$;

create function public.save_survey(
  p_survey_id uuid, p_template_id uuid, p_customer_id uuid, p_visit_id uuid,
  p_answers jsonb, p_brand_prices jsonb, p_remarks text default null, p_submit boolean default false
)
returns public.surveys
language sql
set search_path to ''
as $function$ select * from app.save_survey(p_survey_id, p_template_id, p_customer_id, p_visit_id, p_answers, p_brand_prices, p_remarks, p_submit); $function$;

create function public.delete_survey_draft(p_survey_id uuid)
returns void
language sql
set search_path to ''
as $function$ select app.delete_survey_draft(p_survey_id); $function$;

create function public.can_manage_survey_templates()
returns boolean
language sql
stable
set search_path to ''
as $function$ select app.can_manage_survey_templates(); $function$;

-- ---------------------------------------------------------------- grants

revoke execute on function app.survey_version_is_published(uuid) from public;
revoke execute on function app.can_manage_survey_templates() from public;
revoke execute on function app.can_use_surveys() from public;
revoke execute on function app.can_view_survey(uuid) from public;
revoke execute on function app.survey_target_name(text, uuid, uuid) from public;
revoke execute on function app.save_survey_template(uuid, text, text, text, uuid, uuid, jsonb, boolean) from public;
revoke execute on function app.set_survey_template_active(uuid, boolean) from public;
revoke execute on function app.save_survey(uuid, uuid, uuid, uuid, jsonb, jsonb, text, boolean) from public;
revoke execute on function app.delete_survey_draft(uuid) from public;
revoke execute on function public.save_survey_template(uuid, text, text, text, uuid, uuid, jsonb, boolean) from public;
revoke execute on function public.set_survey_template_active(uuid, boolean) from public;
revoke execute on function public.save_survey(uuid, uuid, uuid, uuid, jsonb, jsonb, text, boolean) from public;
revoke execute on function public.delete_survey_draft(uuid) from public;
revoke execute on function public.can_manage_survey_templates() from public;
revoke execute on function public.survey_report(uuid, timestamptz, timestamptz, uuid) from public;

-- Read helpers run inside RLS policies and security_invoker views, so the
-- calling role needs EXECUTE on them (app is not an exposed API schema).
grant execute on function app.survey_version_is_published(uuid) to authenticated;
grant execute on function app.can_manage_survey_templates() to authenticated;
grant execute on function app.can_use_surveys() to authenticated;
grant execute on function app.can_view_survey(uuid) to authenticated;
grant execute on function app.survey_target_name(text, uuid, uuid) to authenticated;
grant execute on function app.save_survey_template(uuid, text, text, text, uuid, uuid, jsonb, boolean) to authenticated;
grant execute on function app.set_survey_template_active(uuid, boolean) to authenticated;
grant execute on function app.save_survey(uuid, uuid, uuid, uuid, jsonb, jsonb, text, boolean) to authenticated;
grant execute on function app.delete_survey_draft(uuid) to authenticated;
grant execute on function public.save_survey_template(uuid, text, text, text, uuid, uuid, jsonb, boolean) to authenticated;
grant execute on function public.set_survey_template_active(uuid, boolean) to authenticated;
grant execute on function public.save_survey(uuid, uuid, uuid, uuid, jsonb, jsonb, text, boolean) to authenticated;
grant execute on function public.delete_survey_draft(uuid) to authenticated;
grant execute on function public.can_manage_survey_templates() to authenticated;
grant execute on function public.survey_report(uuid, timestamptz, timestamptz, uuid) to authenticated;
grant select on public.survey_feed to authenticated;
