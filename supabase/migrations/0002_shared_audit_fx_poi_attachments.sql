-- Audit log (from src/types/audit.ts: AuditEntry).
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  at          timestamptz not null default now(),
  created_by  uuid references public.profiles(id),
  actor_name  text not null default '',   -- byName
  action      text not null check (action in ('create','update','delete')),
  entity      text not null,
  name        text not null default '',
  note        text
);

-- FX rates (→ VND). One row per currency.
create table public.fx_rates (
  currency    text primary key,
  rate_to_vnd double precision not null,
  pushed_at   timestamptz,
  pushed_by   text
);

-- POI commentary library (src/types/itinerary.ts: PoiEntry).
create table public.pois (
  id           uuid primary key default gen_random_uuid(),
  place        text not null,
  destination  text,
  commentary   text not null default '',
  created_by   uuid references public.profiles(id),
  created_by_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz,
  updated_by_name text
);

-- Polymorphic file references (the file bytes stay in Cloudflare R2).
create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  parent_type   text not null,   -- 'quote' | 'quote_workflow_step' | 'visa_proc' | 'visa_project' | 'ncc_product' | 'payment_approval'
  parent_id     text not null,
  r2_key        text not null,   -- FileAttachment.key
  name          text not null,
  uploaded_by   uuid references public.profiles(id),
  uploaded_by_name text,
  uploaded_at   timestamptz
);
create index attachments_parent_idx on public.attachments(parent_type, parent_id);

-- RLS: parity on all four.
do $$
declare t text;
begin
  foreach t in array array['audit_log','fx_rates','pois','attachments'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I on public.%I for select using (public.is_viettours_user());', t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.is_viettours_user()) with check (public.is_viettours_user());', t||'_write', t);
  end loop;
end $$;
