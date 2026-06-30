-- ════════════════════════════════════════════════════════════════════════
--  0079 — Giai đoạn CHỌN TAY ("lưu tạm") cho hồ sơ tour.
--
--  • manual_stage : giai đoạn người dùng chọn lúc tạo / đánh dấu tay. Chỉ là GỢI Ý —
--                   giai đoạn hiển thị vẫn hợp nhất với giai đoạn suy ra từ quy trình
--                   thật (effectiveStage): quy trình thắng khi tiến XA hơn. Riêng hai
--                   nhánh kết thúc Huỷ tour ('cancelled') / Rớt thầu ('lost') do người
--                   dùng đánh dấu thì LUÔN được giữ.
--
--  Giá trị hợp lệ khớp DealStage ở client:
--    request | quoting | won | contract | operating | acceptance | closed | lost | cancelled
--
--  CỘNG THÊM — không destructive, không đụng dữ liệu cũ.
-- ════════════════════════════════════════════════════════════════════════

alter table public.tour_profiles
  add column if not exists manual_stage text;
