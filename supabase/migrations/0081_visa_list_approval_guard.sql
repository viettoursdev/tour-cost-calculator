-- ════════════════════════════════════════════════════════════════════════
--  0081 — Bịt lỗ hổng TỰ DUYỆT link danh sách visa công khai.
--
--  Ở 0059, policy `public_visa_lists_write` cho MỌI nhân viên (is_viettours_user)
--  UPDATE thẳng bảng — nên một người KHÔNG phải Trưởng phòng Visa vẫn có thể gọi
--  REST `update public_visa_lists set status='approved'` để TỰ DUYỆT, bỏ qua gate
--  trong RPC `approve_visa_list` → công khai PII khách (hộ chiếu, tình trạng visa)
--  khi chưa được duyệt.
--
--  FIX: BEFORE UPDATE trigger chặn chuyển trạng thái sang 'approved'/'rejected'
--  nếu người thực hiện không `can_approve_visa_share()`. Trigger thấy cả OLD & NEW:
--    • refresh payload  (status KHÔNG đổi)        → CHO PHÉP
--    • gỡ link          (→ 'revoked')             → CHO PHÉP
--    • gửi lại yêu cầu  (→ 'pending')             → CHO PHÉP
--    • duyệt/từ chối    (→ 'approved'/'rejected') → CHỈ người duyệt hợp lệ
--  RPC duyệt vẫn chạy bình thường vì auth.uid() trong RPC = chính người duyệt.
--
--  CỘNG THÊM — không destructive, không đụng dữ liệu cũ.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.guard_visa_list_approval()
returns trigger
language plpgsql
as $$
begin
  if (new.status is distinct from old.status)
     and new.status in ('approved', 'rejected')
     and not public.can_approve_visa_share() then
    raise exception 'Chỉ Trưởng phòng Visa (hoặc CEO / Ban Giám Đốc) mới được duyệt/từ chối link.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_visa_list_approval on public.public_visa_lists;
create trigger trg_guard_visa_list_approval
  before update on public.public_visa_lists
  for each row execute function public.guard_visa_list_approval();
