-- Biên bản nghiệm thu hiện đại: lưu chi tiết nghiệm thu (checklist dịch vụ đã
-- giao, đại diện ký 2 bên, mức hài lòng, người/thời điểm phát hành) trong MỘT
-- cột jsonb để không phình schema. ADDITIVE — không đụng has_acceptance /
-- acceptance_date / acceptance_note đang dùng.
alter table public.contracts
  add column if not exists acceptance_detail jsonb;

comment on column public.contracts.acceptance_detail is
  'AcceptanceRecord: { services:[{label,delivered}], repA, repB, satisfaction, issuedBy, issuedAt }';
