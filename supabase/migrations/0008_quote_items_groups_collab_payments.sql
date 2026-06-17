create table public.quote_line_items (
  id         uuid primary key default gen_random_uuid(),
  quote_id   uuid not null references public.quotes(id) on delete cascade,
  category   text not null,            -- CategoryId
  legacy_item_id bigint,               -- Item.id (numeric)
  name       text not null default '',
  note       text not null default '',
  cur        text not null default 'VND',
  price      double precision not null default 0,
  times      double precision not null default 1,
  qty_mode   text not null default 'per_pax',
  custom_qty double precision not null default 0,
  unit       text not null default '',
  enabled    boolean not null default true,
  foc        boolean not null default false,
  optional   boolean,
  included   boolean,
  sort_order int not null default 0
);
create index quote_line_items_quote_idx on public.quote_line_items(quote_id);

create table public.quote_groups (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references public.quotes(id) on delete cascade,
  legacy_group_id text,            -- QuoteGroup.id (string)
  label       text not null default '',
  pax         int not null default 0,
  cat_enabled jsonb not null default '{}'::jsonb,
  sort_order  int not null default 0
);

create table public.quote_group_items (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.quote_groups(id) on delete cascade,
  category   text not null,
  legacy_item_id bigint,
  name text not null default '', note text not null default '',
  cur text not null default 'VND', price double precision not null default 0,
  times double precision not null default 1, qty_mode text not null default 'per_pax',
  custom_qty double precision not null default 0, unit text not null default '',
  enabled boolean not null default true, foc boolean not null default false,
  optional boolean, included boolean, sort_order int not null default 0
);

create table public.quote_collaborators (
  id        uuid primary key default gen_random_uuid(),
  quote_id  uuid not null references public.quotes(id) on delete cascade,
  user_id   uuid references public.profiles(id),
  username  text,            -- preserved for display / unmapped legacy
  name      text not null default '',
  unique (quote_id, username)
);

create table public.quote_payments (
  id        uuid primary key default gen_random_uuid(),
  quote_id  uuid not null references public.quotes(id) on delete cascade,
  legacy_payment_id text,
  label     text not null default '',
  amount    double precision not null default 0,
  note      text not null default '',
  sort_order int not null default 0
);

do $$
declare t text;
begin
  foreach t in array array['quote_line_items','quote_groups','quote_group_items','quote_collaborators','quote_payments'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I on public.%I for select using (public.is_viettours_user());', t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.is_viettours_user()) with check (public.is_viettours_user());', t||'_write', t);
  end loop;
end $$;
