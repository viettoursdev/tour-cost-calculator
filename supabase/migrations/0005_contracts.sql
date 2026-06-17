create table public.contracts (
  id              uuid primary key default gen_random_uuid(),
  legacy_id       text unique,
  contract_no     text not null default '',
  contract_date   text,
  contract_status text not null default 'draft'
                  check (contract_status in ('draft','signed','active','completed','cancelled')),
  tour_name       text not null default '',
  tour_dest       text,
  tour_days       int not null default 0,
  tour_nights     int not null default 0,
  tour_start_date text,
  departure       text,
  contract_pax    int not null default 0,
  price_per_pax   double precision not null default 0,
  party_b         jsonb not null default '{}'::jsonb,   -- ContractPartyB (single object)
  includes        text[] not null default '{}',
  excludes        text[] not null default '{}',
  bond_percent    double precision not null default 0,
  has_acceptance  boolean not null default false,
  acceptance_date text,
  acceptance_note text,
  tour_key        text,                                  -- _tourKey
  linked_quote_id text,                                  -- cloudId of linked quote (string)
  linked_quote_name text,
  created_by      uuid references public.profiles(id),
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  updated_by_name text
);

create table public.contract_payments (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  label       text not null default '',
  mode        text default 'percent',     -- 'percent' | 'fixed'
  percent     double precision,
  amount      double precision not null default 0,
  due_date    text,
  note        text not null default '',
  status      text not null default 'pending' check (status in ('pending','paid')),
  paid_date   text,
  received_amount double precision,
  approval_requested boolean default false,
  sort_order  int not null default 0
);

create table public.contract_cancels (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  when_text   text not null default '',   -- "when" is reserved; map to when_text
  penalty     double precision not null default 0,
  sort_order  int not null default 0
);

do $$
declare t text;
begin
  foreach t in array array['contracts','contract_payments','contract_cancels'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I on public.%I for select using (public.is_viettours_user());', t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.is_viettours_user()) with check (public.is_viettours_user());', t||'_write', t);
  end loop;
end $$;
