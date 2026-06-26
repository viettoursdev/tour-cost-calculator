-- Sở thích giao diện theo TỪNG user, đồng bộ đa thiết bị (vd bố cục trang "Hôm nay").
-- Bảng generic keyed theo username; cột `prefs` jsonb gom nhiều khoá (home, nav…).
-- RLS: mỗi người chỉ ĐỌC/GHI hàng của CHÍNH MÌNH (map email→username qua profiles).
-- Thuần sở thích cá nhân (không phải dữ liệu nghiệp vụ) — không ảnh hưởng báo giá.

create table if not exists public.user_prefs (
  username   text primary key,
  prefs      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_prefs enable row level security;

-- Username của người gọi (mapping qua profiles theo auth.uid()).
-- Dùng lại trong cả 3 policy để tránh lặp.
create or replace function public.current_username()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select username from public.profiles where id = auth.uid()
$$;

drop policy if exists user_prefs_self_read on public.user_prefs;
create policy user_prefs_self_read on public.user_prefs
  for select using (
    public.is_viettours_user() and username = public.current_username()
  );

drop policy if exists user_prefs_self_insert on public.user_prefs;
create policy user_prefs_self_insert on public.user_prefs
  for insert with check (
    public.is_viettours_user() and username = public.current_username()
  );

drop policy if exists user_prefs_self_update on public.user_prefs;
create policy user_prefs_self_update on public.user_prefs
  for update
  using (public.is_viettours_user() and username = public.current_username())
  with check (public.is_viettours_user() and username = public.current_username());
