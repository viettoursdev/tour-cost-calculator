create table public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text unique,
  name        text not null,
  sectors     text[] not null default '{}',
  location    text not null default '',
  note        text not null default '',
  created_by  uuid references public.profiles(id),
  created_by_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  updated_by_name text
);

create table public.supplier_contacts (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  name text not null default '', phone text not null default '',
  email text not null default '', position text not null default '',
  sort_order int not null default 0
);

create table public.ncc_products (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text unique,
  supplier_id uuid references public.suppliers(id) on delete set null,   -- nccId (null if hand-typed)
  ncc_name    text not null default '',     -- denormalized nccName
  category    text not null,                -- CategoryId
  name        text not null,
  description text,
  note        text,
  created_by  uuid references public.profiles(id),
  created_by_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  updated_by_name text
);

create table public.ncc_product_prices (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.ncc_products(id) on delete cascade,
  label      text not null default '',
  amount     double precision not null default 0,
  cur        text not null default 'VND',
  unit       text not null default '',
  note       text,
  sort_order int not null default 0
);

do $$
declare t text;
begin
  foreach t in array array['suppliers','supplier_contacts','ncc_products','ncc_product_prices'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I on public.%I for select using (public.is_viettours_user());', t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.is_viettours_user()) with check (public.is_viettours_user());', t||'_write', t);
  end loop;
end $$;
