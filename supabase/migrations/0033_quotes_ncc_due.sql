-- NCC payment-due index column: restores the nccDue parity gap from the
-- Firebase→Supabase migration (see issue #16). PaymentView indexes the unpaid
-- NCC installments with deadlines here so notifications.ts:checkNccDue can fire
-- "đến hạn trả NCC" reminders. Written by sbSetQuotePaymentSummary, NOT by the
-- save_quote_state RPC (mirrors how `share`/`payment_summary` are handled).
alter table public.quotes add column ncc_due jsonb;
