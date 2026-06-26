-- ════════════════════════════════════════════════════════════════════════
--  0060 — Trung tâm tài liệu cấp Hồ sơ tour: cột `documents` (jsonb) lưu danh
--  sách FileAttachment (key R2 + tên + người/giờ tải). CỘNG THÊM, không đụng
--  dữ liệu cũ. File thật nằm trên R2 (qua AI Worker), bảng chỉ giữ tham chiếu.
-- ════════════════════════════════════════════════════════════════════════

alter table public.tour_profiles
  add column if not exists documents jsonb not null default '[]'::jsonb;
