-- ════════════════════════════════════════════════════════════════════════
--  0065 — Yêu cầu DUYỆT XUẤT FILE (Excel) cần Trưởng Phòng trở lên.
--  Nhân viên dưới quyền gửi yêu cầu (status='pending'); CEO / Ban Giám Đốc /
--  Trưởng Phòng DUYỆT qua RPC (SECURITY DEFINER) → 'approved'. Người gửi tải
--  file rồi tự xoá yêu cầu (tiêu thụ). KHÔNG đụng dữ liệu cũ.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.export_requests (
  id                    text primary key,
  scope                 text not null default 'tour_profiles',
  detail                text,
  status                text not null default 'pending'
                          check (status in ('pending', 'approved', 'rejected')),
  requested_by          uuid references public.profiles(id),
  requested_by_username text,
  requested_by_name     text,
  requested_at          timestamptz not null default now(),
  decided_by            uuid references public.profiles(id),
  decided_by_name       text,
  decided_at            timestamptz,
  reject_reason         text,
  created_at            timestamptz not null default now()
);

alter table public.export_requests enable row level security;

-- Ai được DUYỆT xuất: CEO / Ban Giám Đốc / Trưởng Phòng (trùng APPROVER_ROLES app).
-- Định nghĩa TRƯỚC các policy bên dưới vì policy delete tham chiếu hàm này.
create or replace function public.is_export_approver()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and role in ('CEO', 'Ban Giám Đốc', 'Trưởng Phòng')
  );
$$;

-- Người trong công ty ĐỌC mọi yêu cầu (người gửi thấy trạng thái của mình; người
-- duyệt thấy các yêu cầu đang chờ). Đây là dữ liệu nội bộ ít nhạy cảm.
drop policy if exists export_requests_read on public.export_requests;
create policy export_requests_read on public.export_requests for select
  using (public.is_viettours_user());

-- Người gửi TẠO yêu cầu của chính mình.
drop policy if exists export_requests_insert on public.export_requests;
create policy export_requests_insert on public.export_requests for insert
  with check (public.is_viettours_user() and requested_by = auth.uid());

-- Người gửi (hoặc người duyệt) XOÁ yêu cầu — tiêu thụ sau khi tải / dọn dẹp.
drop policy if exists export_requests_delete on public.export_requests;
create policy export_requests_delete on public.export_requests for delete
  using (requested_by = auth.uid() or public.is_export_approver());

-- DUYỆT yêu cầu xuất (chỉ người duyệt hợp lệ). pending → approved.
create or replace function public.approve_export_request(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_viettours_user() then
    raise exception 'Không có quyền.';
  end if;
  if not public.is_export_approver() then
    raise exception 'Chỉ Trưởng Phòng trở lên mới được duyệt xuất file.';
  end if;
  update public.export_requests
     set status = 'approved',
         decided_by = auth.uid(),
         decided_by_name = (select name from public.profiles where id = auth.uid()),
         decided_at = now(),
         reject_reason = null
   where id = p_id and status = 'pending';
  if not found then
    raise exception 'Không tìm thấy yêu cầu đang chờ duyệt.';
  end if;
end;
$$;

-- TỪ CHỐI yêu cầu xuất (chỉ người duyệt hợp lệ). pending → rejected (+ lý do).
create or replace function public.reject_export_request(p_id text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_viettours_user() then
    raise exception 'Không có quyền.';
  end if;
  if not public.is_export_approver() then
    raise exception 'Chỉ Trưởng Phòng trở lên mới được duyệt xuất file.';
  end if;
  update public.export_requests
     set status = 'rejected',
         decided_by = auth.uid(),
         decided_by_name = (select name from public.profiles where id = auth.uid()),
         decided_at = now(),
         reject_reason = p_reason
   where id = p_id and status = 'pending';
  if not found then
    raise exception 'Không tìm thấy yêu cầu đang chờ duyệt.';
  end if;
end;
$$;

grant execute on function public.is_export_approver() to authenticated;
grant execute on function public.approve_export_request(text) to authenticated;
grant execute on function public.reject_export_request(text, text) to authenticated;
