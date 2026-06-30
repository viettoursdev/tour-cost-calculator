-- ════════════════════════════════════════════════════════════════════════
--  0082 — KHOÁ BỘ CỘT của link danh sách visa ĐÃ DUYỆT.
--
--  0081 đã chặn TỰ DUYỆT (đổi status). Nhưng `sbRefreshVisaListPayload` cho phép
--  ghi đè `payload` mà GIỮ status='approved' để cập nhật số liệu mà không cần duyệt
--  lại. Lỗ hổng: payload mới có thể CHỨA THÊM CỘT (key) ngoài bộ cột đã được duyệt
--  (lưu ở cột `columns text[]`) → người gửi tự ý lộ thêm trường PII (hộ chiếu, ngày
--  sinh…) cho khách qua link đã duyệt, KHÔNG qua bước duyệt.
--
--  FIX: mở rộng trigger guard sẵn có — khi link GIỮ 'approved' mà payload/columns
--  đổi, bộ cột phải là TẬP CON của allowlist đã duyệt:
--    • cập nhật số liệu, đổi thứ tự, BỚT cột  → CHO PHÉP (không lộ thêm gì)
--    • THÊM cột mới                           → CHẶN (phải gửi duyệt lại)
--  So với `old.columns` (bản đã duyệt) nên không thể lách bằng cách set kèm
--  `new.columns` lớn hơn trong cùng một UPDATE.
--
--  Hạ status về 'pending'/'revoked' để gửi lại vẫn tự do (lúc đó payload ẩn với
--  khách, sẽ qua bước duyệt). CỘNG THÊM — không destructive.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.guard_visa_list_approval()
returns trigger
language plpgsql
as $$
begin
  -- (0081) Đổi trạng thái → approved/rejected: chỉ người duyệt hợp lệ.
  if (new.status is distinct from old.status)
     and new.status in ('approved', 'rejected')
     and not public.can_approve_visa_share() then
    raise exception 'Chỉ Trưởng phòng Visa (hoặc CEO / Ban Giám Đốc) mới được duyệt/từ chối link.';
  end if;

  -- (0082) Link GIỮ 'approved': không cho mở rộng bộ cột so với bản đã duyệt.
  if old.status = 'approved' and new.status = 'approved' then
    -- Allowlist text[] không được nới rộng trực tiếp.
    if not (new.columns <@ old.columns) then
      raise exception 'Không thể thêm cột vào link đã duyệt — phải gửi duyệt lại.';
    end if;
    -- Mọi cột (key) trong payload phải nằm trong allowlist đã duyệt.
    if exists (
      select 1
      from jsonb_array_elements(coalesce(new.payload->'columns', '[]'::jsonb)) c
      where (c->>'key') is not null
        and not ((c->>'key') = any (old.columns))
    ) then
      raise exception 'Bộ cột hiển thị đã thay đổi so với bản đã duyệt — phải gửi duyệt lại, không thể tự cập nhật.';
    end if;
  end if;

  return new;
end;
$$;

-- Trigger đã tạo ở 0081; create or replace function ở trên là đủ. Tạo lại cho an toàn.
drop trigger if exists trg_guard_visa_list_approval on public.public_visa_lists;
create trigger trg_guard_visa_list_approval
  before update on public.public_visa_lists
  for each row execute function public.guard_visa_list_approval();
