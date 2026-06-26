-- ════════════════════════════════════════════════════════════════════════
--  0062 — Chốt duyệt biên lợi thấp: cột `margin_approval` (jsonb) lưu yêu cầu/
--  kết quả duyệt khi biên lợi báo giá dưới ngưỡng. CỘNG THÊM, không đụng dữ liệu cũ.
-- ════════════════════════════════════════════════════════════════════════

alter table public.tour_profiles
  add column if not exists margin_approval jsonb;
