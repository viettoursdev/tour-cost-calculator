create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text unique,                -- original Firestore Customer.id, for ETL cross-refs
  name        text not null,
  type        text not null check (type in ('company','individual')),
  address     text,
  tax_code    text,
  note        text not null default '',
  created_by  uuid references public.profiles(id),
  created_by_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  updated_by_name text
);

create table public.customer_contacts (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  name        text not null default '',
  phone       text not null default '',
  email       text not null default '',
  position    text not null default '',
  sort_order  int  not null default 0
);
create index customer_contacts_customer_idx on public.customer_contacts(customer_id);

alter table public.customers enable row level security;
alter table public.customer_contacts enable row level security;
create policy customers_read  on public.customers       for select using (public.is_viettours_user());
create policy customers_write on public.customers       for all using (public.is_viettours_user()) with check (public.is_viettours_user());
create policy cc_read  on public.customer_contacts for select using (public.is_viettours_user());
create policy cc_write on public.customer_contacts for all using (public.is_viettours_user()) with check (public.is_viettours_user());
