-- Liên kết email Outlook ↔ khách hàng/báo giá: single shared row.
create table public.email_links (
  one_row    boolean primary key default true check (one_row),
  links      jsonb not null default '[]'::jsonb,
  updated_at timestamptz,
  updated_by text
);

alter table public.email_links enable row level security;
create policy email_links_read  on public.email_links for select
  using (public.is_viettours_user());
create policy email_links_write on public.email_links for all
  using (public.is_viettours_user()) with check (public.is_viettours_user());

alter publication supabase_realtime add table public.email_links;
