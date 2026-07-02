-- Lịch sử tra cứu chuyến bay (module "Tìm chuyến bay" — AI + web_search tổng hợp
-- từ nhiều nguồn web). Mỗi dòng = 1 lần tìm: tham số + kết quả (options) đã lưu để
-- xem lại / tải lại. Dữ liệu THAM KHẢO nội bộ → RLS đơn giản: mọi nhân viên
-- @viettours đọc/ghi/xoá (giống các bảng chia sẻ nội bộ khác). ADDITIVE, không đụng
-- bảng cũ.

create table if not exists public.flight_searches (
  id          text primary key,
  created_by  text,                    -- username người tạo (app-sinh, để lọc "của tôi")
  created_at  timestamptz not null default now(),
  label       text,                    -- nhãn hiển thị (vd "HAN → NRT · 20/11")
  params      jsonb not null,          -- FlightSearchParams
  results     jsonb not null           -- FlightSearchResult (options + citations)
);

create index if not exists flight_searches_created_by_idx
  on public.flight_searches (created_by, created_at desc);

alter table public.flight_searches enable row level security;

-- Mọi nhân viên trong công ty đọc/ghi/xoá (tra cứu tham khảo, không nhạy cảm).
drop policy if exists flight_searches_rw on public.flight_searches;
create policy flight_searches_rw on public.flight_searches for all
  using (public.is_viettours_user()) with check (public.is_viettours_user());
