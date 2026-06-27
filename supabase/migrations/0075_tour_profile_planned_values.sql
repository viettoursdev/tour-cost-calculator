-- ════════════════════════════════════════════════════════════════════════
--  0075 — Giá trị TẠM TÍNH cho hồ sơ tour + vá persistence các trường còn thiếu.
--
--  • planned_contract_value   : giá trị hợp đồng nhập tay (tạm tính) — hiển thị khi
--                               chưa có HĐ/báo giá gắn vai trò. Giá trị THỰC vẫn suy
--                               theo quy trình (báo giá valueRole / HĐ liên kết).
--  • planned_settlement_value : giá trị nghiệm thu nhập tay (tạm tính) — hiển thị khi
--                               chưa quyết toán. Giá trị THỰC vẫn suy theo quy trình.
--
--  VÁ PERSISTENCE (bug từ 650e2f0): các cột dưới đã có trong type + UI nhưng CHƯA
--  được lưu xuống DB → mất khi tải lại / đổi máy. Thêm cột để giữ thật.
--  • depart_region | days | nights | priority | lead_source
--
--  CỘNG THÊM — không destructive, không đụng dữ liệu cũ.
-- ════════════════════════════════════════════════════════════════════════

alter table public.tour_profiles
  add column if not exists planned_contract_value   numeric,
  add column if not exists planned_settlement_value numeric,
  add column if not exists depart_region            text,
  add column if not exists days                     int,
  add column if not exists nights                   int,
  add column if not exists priority                 text,
  add column if not exists lead_source              text;
