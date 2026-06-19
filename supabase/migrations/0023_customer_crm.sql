alter table public.customers add column if not exists source text;
alter table public.customers add column if not exists tags text[] not null default '{}';
alter table public.customers add column if not exists next_follow_up jsonb;

create table if not exists public.customer_interactions (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  legacy_id   text,
  at          timestamptz not null default now(),
  by_username text,
  by_name     text not null default '',
  type        text not null default '',
  text        text not null default '',
  sort_order  int not null default 0
);
create index if not exists customer_interactions_customer_idx on public.customer_interactions(customer_id);
alter table public.customer_interactions enable row level security;
create policy customer_interactions_read  on public.customer_interactions for select using (public.is_viettours_user());
create policy customer_interactions_write on public.customer_interactions for all using (public.is_viettours_user()) with check (public.is_viettours_user());
