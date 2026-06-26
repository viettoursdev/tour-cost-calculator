-- Link công khai để KHÁCH xem danh sách & tình trạng xin visa + tiến độ hồ sơ.
-- Khác báo giá công khai ở chỗ: link CHỈ hoạt động sau khi Trưởng phòng Visa
-- (hoặc CEO / Ban Giám Đốc) DUYỆT. Nhân viên gửi yêu cầu (status='pending'),
-- người duyệt mới chuyển sang 'approved' → anon mới đọc được payload.
--
-- Mỗi dự án visa giữ TỐI ĐA một link (project_id unique). payload là bản
-- HƯỚNG KHÁCH đã chọn cột — KHÔNG kéo nguyên hồ sơ nội bộ ra ngoài.

create table public.public_visa_lists (
  token                 text primary key,
  project_id            text not null unique,   -- legacy_id của visa_projects
  payload               jsonb not null,         -- PublicVisaListDoc (cột + dòng + meta)
  columns               text[] not null default '{}',
  note                  text,
  status                text not null default 'pending'
                          check (status in ('pending', 'approved', 'rejected', 'revoked')),
  requested_by          uuid references public.profiles(id),
  requested_by_username text,
  requested_by_name     text,
  requested_at          timestamptz not null default now(),
  approved_by           uuid references public.profiles(id),
  approved_by_name      text,
  approved_at           timestamptz,
  reject_reason         text,
  created_at            timestamptz not null default now()
);

alter table public.public_visa_lists enable row level security;

-- Người trong công ty: đọc / tạo yêu cầu / gỡ. (Việc DUYỆT đi qua RPC định danh
-- bên dưới — không cho update status='approved' tuỳ tiện qua policy này, vì RPC
-- mới kiểm đúng Trưởng phòng Visa.)
create policy public_visa_lists_write on public.public_visa_lists for all
  using (public.is_viettours_user()) with check (public.is_viettours_user());

-- Ai được DUYỆT link: Trưởng phòng Visa, cộng CEO & Ban Giám Đốc (cấp trên).
-- KHÔNG mở cho Trưởng Phòng phòng khác. Single source of truth cho approve/reject.
create or replace function public.can_approve_visa_share()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and (role in ('CEO', 'Ban Giám Đốc')
            or (role = 'Trưởng Phòng' and department = 'visa'))
  );
$$;

-- Duyệt link (chỉ người duyệt hợp lệ). pending → approved.
create or replace function public.approve_visa_list(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_viettours_user() then
    raise exception 'Không có quyền.';
  end if;
  if not public.can_approve_visa_share() then
    raise exception 'Chỉ Trưởng phòng Visa (hoặc CEO / Ban Giám Đốc) mới được duyệt link.';
  end if;
  update public.public_visa_lists
     set status = 'approved',
         approved_by = auth.uid(),
         approved_by_name = (select name from public.profiles where id = auth.uid()),
         approved_at = now(),
         reject_reason = null
   where token = p_token and status = 'pending';
  if not found then
    raise exception 'Không tìm thấy yêu cầu đang chờ duyệt.';
  end if;
end;
$$;

-- Từ chối link (chỉ người duyệt hợp lệ). pending → rejected (+ lý do).
create or replace function public.reject_visa_list(p_token text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_viettours_user() then
    raise exception 'Không có quyền.';
  end if;
  if not public.can_approve_visa_share() then
    raise exception 'Chỉ Trưởng phòng Visa (hoặc CEO / Ban Giám Đốc) mới được duyệt link.';
  end if;
  update public.public_visa_lists
     set status = 'rejected',
         approved_by = auth.uid(),
         approved_by_name = (select name from public.profiles where id = auth.uid()),
         approved_at = now(),
         reject_reason = p_reason
   where token = p_token and status = 'pending';
  if not found then
    raise exception 'Không tìm thấy yêu cầu đang chờ duyệt.';
  end if;
end;
$$;

grant execute on function public.can_approve_visa_share() to authenticated;
grant execute on function public.approve_visa_list(text) to authenticated;
grant execute on function public.reject_visa_list(text, text) to authenticated;

-- Anon đọc danh sách qua token — CHỈ khi đã được duyệt. SECURITY DEFINER để
-- không cần cấp SELECT toàn bảng cho anon (chống dò token / liệt kê dự án).
create or replace function public.get_public_visa_list(p_token text)
returns table(payload jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select payload from public.public_visa_lists
   where token = p_token and status = 'approved';
$$;

grant execute on function public.get_public_visa_list(text) to anon;
