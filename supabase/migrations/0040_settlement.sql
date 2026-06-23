-- Quyết toán tour.
--  • tour_payments.settlement: trạng thái chốt/khoá + doanh thu thực (override) +
--    snapshot đông cứng tại thời điểm chốt. Ghi qua sbSaveTourPayments.
--  • quotes.settlement_summary: chỉ mục biên lợi THẬT của tour (actualCost/
--    actualProfit/actualMarginPct…) để ExecBoard & các bảng điều hành đọc nhanh —
--    ghi qua sbSetQuoteSettlementSummary (KHÔNG qua save_quote_state RPC, giống
--    cách payment_summary / ncc_due được xử lý).
alter table public.tour_payments add column settlement jsonb;
alter table public.quotes add column settlement_summary jsonb;
