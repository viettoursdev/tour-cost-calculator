-- Module Nhân sự — Đợt 2: pool HDV cộng tác viên (freelance, <50, KHÔNG đăng nhập).
--  • hr_guides: danh mục nguồn lực HDV CTV do điều hành quản lý. Thẻ HDV có hạn
--    (guide_card_expires) để nhắc; languages/regions để lọc xếp tour; rating + status
--    (active|paused|blacklist) để đánh giá/loại. App id ở legacy_id như các bảng khác.
-- KHÔNG cấp tài khoản — đây chỉ là dữ liệu master, gắn vào Lịch đi tour HDV ở client.

create table public.hr_guides (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  full_name     text not null default '',
  phone         text not null default '',
  email         text not null default '',
  guide_card_no text not null default '',           -- số thẻ HDV
  guide_card_expires date,                            -- hết hạn thẻ → nhắc 90/30 ngày
  languages     text[] not null default '{}',         -- ngôn ngữ phục vụ
  regions       text[] not null default '{}',         -- tuyến/vùng phục vụ
  rating        numeric,                               -- đánh giá sao (0–5)
  status        text not null default 'active',        -- active|paused|blacklist
  day_rate      numeric,                               -- thù lao/ngày tham khảo (VND)
  notes         text not null default '',
  created_by_username text not null default '',
  created_by_name     text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  updated_by_name text
);

create index hr_guides_card_expires_idx on public.hr_guides(guide_card_expires);

-- RLS + realtime (khối do-$$ chuẩn như 0035). Cổng thô @viettours; pool HDV là nguồn
-- lực vận hành (không nhạy cảm) — siết hiển thị ở lớp giao diện theo manageNCC.
do $$
declare t text;
begin
  foreach t in array array['hr_guides'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I on public.%I for select using (public.is_viettours_user());', t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.is_viettours_user()) with check (public.is_viettours_user());', t||'_write', t);
    execute format('alter publication supabase_realtime add table public.%I;', t);
  end loop;
end $$;
