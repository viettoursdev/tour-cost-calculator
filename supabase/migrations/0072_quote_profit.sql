-- ════════════════════════════════════════════════════════════════════════
--  0069 — Lợi nhuận báo giá tại thời điểm lưu: cột `quote_profit`.
--  Khi LƯU báo giá, ghi thẳng lợi nhuận (= computeTotals.totalProfit, VND) vào
--  index để tính BIÊN từng mốc giá trị (hiện tại/hợp đồng/nghiệm thu), chấm điểm
--  khả năng chốt và gợi ý giá — KHÔNG phải nạp lại full version mỗi báo giá.
--  CHỈ THÊM CỘT, nullable → dữ liệu cũ giữ nguyên (null = chưa biết lợi nhuận).
-- ════════════════════════════════════════════════════════════════════════

alter table public.quotes
  add column if not exists quote_profit numeric;
