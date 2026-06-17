create table public.quotes (
  id            uuid primary key default gen_random_uuid(),
  cloud_id      text unique not null,        -- legacy cloudId; referenced by contracts/notifications/itineraries
  legacy_num_id bigint,                       -- CloudQuoteEntry.id (numeric)
  quote_code    text,
  name          text not null default '',
  template      text not null,                -- 'domestic'|'intl'|'dmc'|...
  pax           int not null default 0,
  total_cost    double precision not null default 0,
  status        text,                         -- QuoteStatus
  customer_id   uuid references public.customers(id) on delete set null,
  customer_name text,
  depart_date   date,
  -- draft scalar/opaque config (kept as JSONB per the value-blob rule):
  info          jsonb not null default '{}'::jsonb,   -- QuoteInfo
  rates         jsonb not null default '{}'::jsonb,   -- Record<string,number>
  rate_base     text,
  margin        double precision not null default 0,
  vat           double precision not null default 0,
  svc_basis     double precision not null default 0,
  rounding      double precision not null default 0,
  cat_enabled   jsonb not null default '{}'::jsonb,
  pricing_options jsonb,
  inclusions    text[],
  exclusions    text[],
  -- DMC-only
  output_currency text,
  dmc_prices    jsonb,
  dmc_margin    jsonb,
  active_group_id text,
  -- denormalized summaries (written by the save RPC in Phase 2)
  workflow_summary jsonb,
  payment_summary  jsonb,
  -- cross-links
  linked_quote_id text,
  linked_quote_name text,
  linked_quote_template text,
  -- meta
  created_by      uuid references public.profiles(id),
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  updated_by_name text
);
create index quotes_template_idx   on public.quotes(template);
create index quotes_customer_idx   on public.quotes(customer_id);
create index quotes_depart_idx     on public.quotes(depart_date);
create index quotes_created_by_idx on public.quotes(created_by);

alter table public.quotes enable row level security;
create policy quotes_read  on public.quotes for select using (public.is_viettours_user());
create policy quotes_write on public.quotes for all using (public.is_viettours_user()) with check (public.is_viettours_user());
