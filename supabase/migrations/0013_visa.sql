-- Visa products catalog (single logical doc in Firestore → rows here).
create table public.visa_products (
  id         uuid primary key default gen_random_uuid(),
  legacy_id  text unique,
  country text not null default '', visa_type text not null default '',
  validity text, location text,
  markup_type text not null default 'percent' check (markup_type in ('percent','fixed')),
  markup_value double precision not null default 0, markup_cur text not null default 'VND',
  note text not null default '', active boolean not null default true
);
create table public.visa_product_fees (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.visa_products(id) on delete cascade,
  legacy_fee_id text, name text not null default '', amount double precision not null default 0,
  cur text not null default 'VND', per_pax boolean not null default true, sort_order int not null default 0
);
-- Catalog-level FX rates + version snapshots (single-row config).
create table public.visa_products_meta (
  one_row  boolean primary key default true check (one_row),
  rates    jsonb not null default '{}'::jsonb,
  versions jsonb not null default '[]'::jsonb,   -- VisaProductVersion[]
  updated_at timestamptz, updated_by text
);

create table public.visa_procedures (
  id         uuid primary key default gen_random_uuid(),
  legacy_id  text unique,
  code text not null default '', title text not null default '',
  country text not null default '', visa_type text,
  is_template boolean not null default false,
  sections   jsonb not null default '[]'::jsonb,   -- VisaProcSection[]
  versions   jsonb not null default '[]'::jsonb,   -- VisaProcVersion[]
  collaborators uuid[] not null default '{}',
  collaborator_usernames text[] not null default '{}',
  linked_quote_id text, linked_quote_name text,
  created_by uuid references public.profiles(id), created_by_name text,
  created_at timestamptz not null default now(), updated_at timestamptz, updated_by_name text
);

create table public.visa_projects (
  id         uuid primary key default gen_random_uuid(),
  legacy_id  text unique,
  code text not null default '', name text not null default '', country text not null default '',
  status text not null default 'planning'
         check (status in ('planning','in_progress','reviewing','completed','pending','cancelled')),
  main_staff uuid[] not null default '{}', support_staff uuid[] not null default '{}',
  main_staff_usernames text[] not null default '{}', support_staff_usernames text[] not null default '{}',
  documents_summary text not null default '',
  linked_quote_id text, linked_quote_name text, linked_proc_ids text[] not null default '{}',
  apply_count int not null default 0, passed_count int not null default 0,
  failed_count int not null default 0, have_visa_count int not null default 0, pending_count int not null default 0,
  start_date date, departure_date date, end_date date,
  milestones jsonb not null default '[]'::jsonb,    -- VisaMilestone[]
  applicants jsonb not null default '[]'::jsonb,    -- VisaApplicant[]
  collaborators uuid[] not null default '{}', collaborator_usernames text[] not null default '{}',
  created_by uuid references public.profiles(id), created_by_name text,
  created_at timestamptz not null default now(), updated_at timestamptz, updated_by_name text
);

do $$
declare t text;
begin
  foreach t in array array['visa_products','visa_product_fees','visa_products_meta','visa_procedures','visa_projects'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I on public.%I for select using (public.is_viettours_user());', t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.is_viettours_user()) with check (public.is_viettours_user());', t||'_write', t);
  end loop;
end $$;
