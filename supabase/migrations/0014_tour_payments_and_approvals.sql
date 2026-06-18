create table public.tour_payments (
  id        uuid primary key default gen_random_uuid(),
  tour_key  text unique not null,
  updated_at timestamptz, updated_by text
);

create table public.payment_records (
  id            uuid primary key default gen_random_uuid(),
  tour_payment_id uuid not null references public.tour_payments(id) on delete cascade,
  record_key    text not null,            -- map key in TourPayments.payments
  supplier      text,
  tracked       boolean,
  custom_amount double precision,
  installments  jsonb not null default '[]'::jsonb,   -- Installment[]
  note          text,
  unique (tour_payment_id, record_key)
);

create table public.custom_cost_items (
  id            uuid primary key default gen_random_uuid(),
  tour_payment_id uuid not null references public.tour_payments(id) on delete cascade,
  item_key      text not null,
  cat_id text not null, cat_label text, cat_icon text, cat_color text,
  name text not null default '', amount double precision not null default 0,
  sort_order int not null default 0
);

create table public.payment_approvals (
  id             uuid primary key default gen_random_uuid(),
  approval_key   text unique not null,     -- the map key in PaymentApprovalDoc
  current_stage  int,
  final_status   text check (final_status in ('approved','rejected','pending_stage2','pending')),
  intended_approver1_name text,
  intended_approver2_name text
);

create table public.payment_approval_stages (
  id           uuid primary key default gen_random_uuid(),
  approval_id  uuid not null references public.payment_approvals(id) on delete cascade,
  stage        int not null check (stage in (1,2)),
  status       text not null check (status in ('approved','rejected')),
  approver_user_id uuid references public.profiles(id),
  approver_username text,
  approver_name text,
  note         text not null default '',
  updated_at   timestamptz not null default now(),
  unique (approval_id, stage)
);

do $$
declare t text;
begin
  foreach t in array array['tour_payments','payment_records','custom_cost_items','payment_approvals','payment_approval_stages'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I on public.%I for select using (public.is_viettours_user());', t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.is_viettours_user()) with check (public.is_viettours_user());', t||'_write', t);
  end loop;
end $$;
