create table public.menus (
  id           uuid primary key default gen_random_uuid(),
  legacy_id    text unique,
  code text, type text not null default 'ND' check (type in ('NN','ND')),
  continent text, country text, seq int not null default 0,
  title text not null default '', destination text, days int not null default 0,
  linked_itinerary_id text, linked_itinerary_name text,
  linked_quote_id text, linked_quote_name text,
  created_by uuid references public.profiles(id), created_by_name text,
  created_at timestamptz not null default now(), updated_at timestamptz, updated_by_name text
);

create table public.menu_days (
  id        uuid primary key default gen_random_uuid(),
  menu_id   uuid not null references public.menus(id) on delete cascade,
  day_num int not null default 0, date text, city text,
  meals     jsonb not null default '[]'::jsonb,   -- MenuMeal[]
  sort_order int not null default 0
);

create table public.restaurants (
  id        uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  name text not null default '', continent text, country text, city text,
  website text, menu_link text, contact text, note text,
  rating double precision not null default 0, review text not null default ''
);

create table public.restaurant_menus (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  legacy_menu_id text, name text not null default '', dishes text,
  price double precision not null default 0, cur text not null default 'VND',
  rating double precision not null default 0, review text, sort_order int not null default 0
);

do $$
declare t text;
begin
  foreach t in array array['menus','menu_days','restaurants','restaurant_menus'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I on public.%I for select using (public.is_viettours_user());', t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.is_viettours_user()) with check (public.is_viettours_user());', t||'_write', t);
  end loop;
end $$;
