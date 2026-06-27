-- ════════════════════════════════════════════════════════════════════════
--  0066 — Vai trò giá trị của báo giá trong hồ sơ tour: cột `quote_value_role`.
--  Khi LƯU báo giá, người dùng chọn báo giá này đại diện cho mốc giá trị nào của
--  hồ sơ: 'current' (báo giá hiện tại) · 'contract' (giá trị ký hợp đồng) ·
--  'settlement' (chi phí nghiệm thu). Hồ sơ tour đọc thẳng theo vai trò → 3 mốc
--  giá trị liên kết chính xác thay vì suy gián tiếp. CHỈ THÊM CỘT, nullable →
--  dữ liệu cũ giữ nguyên (coi như 'current' khi hiển thị).
-- ════════════════════════════════════════════════════════════════════════

alter table public.quotes
  add column if not exists quote_value_role text;
