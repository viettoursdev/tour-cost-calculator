-- ════════════════════════════════════════════════════════════════════════
--  0064 — Khoá thông tin cơ bản hồ sơ tour: cột `info_locked` (boolean).
--  Khi người dùng SỬA TAY tên/khách/ngày/số khách/điểm đến trên hồ sơ thì đặt
--  true → `syncFromPrimary` KHÔNG còn ghi đè từ báo giá chính, và hồ sơ được ưu
--  tiên hiển thị. CỘNG THÊM, mặc định false → dữ liệu cũ giữ nguyên hành vi.
-- ════════════════════════════════════════════════════════════════════════

alter table public.tour_profiles
  add column if not exists info_locked boolean not null default false;
