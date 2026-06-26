-- ════════════════════════════════════════════════════════════════════════
--  0061 — Nhãn (tag) tự do cho Hồ sơ tour: cột `tags text[]` (mặc định '{}').
--  Cho phép gắn nhãn tuỳ ý (VIP / lặp lại / cần gấp…) + lọc theo nhãn.
--  CỘNG THÊM, không đụng dữ liệu cũ.
-- ════════════════════════════════════════════════════════════════════════

alter table public.tour_profiles
  add column if not exists tags text[] not null default '{}';

create index if not exists tour_profiles_tags_idx on public.tour_profiles using gin (tags);
