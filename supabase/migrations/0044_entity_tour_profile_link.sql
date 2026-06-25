-- Liên kết TRỰC TIẾP các thực thể vào hồ sơ tour (tour_profiles.id).
--  Cộng thêm cột tour_profile_id cho contracts / visa_projects / itineraries / menus
--  (đọc kép: ưu tiên tour_profile_id, fallback suy qua linked_quote_id → báo giá → hồ sơ).
--  Cho phép gắn thực đơn/chương trình/visa/HĐ vào một tour KỂ CẢ khi chưa có báo giá.
--  add column if not exists … null → KHÔNG đụng dữ liệu cũ.

alter table public.contracts     add column if not exists tour_profile_id text;
alter table public.visa_projects  add column if not exists tour_profile_id text;
alter table public.itineraries    add column if not exists tour_profile_id text;
alter table public.menus          add column if not exists tour_profile_id text;

create index if not exists contracts_tour_profile_idx     on public.contracts(tour_profile_id);
create index if not exists visa_projects_tour_profile_idx on public.visa_projects(tour_profile_id);
create index if not exists itineraries_tour_profile_idx   on public.itineraries(tour_profile_id);
create index if not exists menus_tour_profile_idx         on public.menus(tour_profile_id);
