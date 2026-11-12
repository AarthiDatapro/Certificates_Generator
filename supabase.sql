-- Paste ALL of this into Supabase → SQL Editor → Run.
-- Re-running is safe.

create table if not exists public.certificate_templates (
  id uuid primary key default gen_random_uuid(),
  template_name text not null,
  image_path text,
  image_data text,
  image_width integer not null default 0,
  image_height integer not null default 0,
  -- Legacy columns kept empty on purpose. Excel files are never stored in Supabase.
  excel_file_name text default '',
  excel_columns jsonb not null default '[]'::jsonb,
  fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Existing projects: add image_data if the table already exists
alter table public.certificate_templates
  add column if not exists image_data text;

-- Clear any previously stored Excel metadata (spreadsheet files are local-only).
update public.certificate_templates
set excel_file_name = '',
    excel_columns = '[]'::jsonb
where coalesce(excel_file_name, '') <> ''
   or excel_columns <> '[]'::jsonb;

alter table public.certificate_templates enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on public.certificate_templates to anon, authenticated, service_role;

drop policy if exists certificate_templates_select on public.certificate_templates;
drop policy if exists certificate_templates_insert on public.certificate_templates;
drop policy if exists certificate_templates_update on public.certificate_templates;
drop policy if exists certificate_templates_delete on public.certificate_templates;
drop policy if exists certificate_templates_all on public.certificate_templates;

create policy certificate_templates_select
  on public.certificate_templates for select
  to anon, authenticated
  using (true);

create policy certificate_templates_insert
  on public.certificate_templates for insert
  to anon, authenticated
  with check (true);

create policy certificate_templates_update
  on public.certificate_templates for update
  to anon, authenticated
  using (true)
  with check (true);

create policy certificate_templates_delete
  on public.certificate_templates for delete
  to anon, authenticated
  using (true);
