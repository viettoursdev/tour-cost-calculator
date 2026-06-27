-- Thư viện Viettours Đợt 2: phân loại + thẻ cho nguồn (auto gợi ý khi nạp).
-- `category` = chủ đề lớn (vd "Visa", "Điểm đến", "Quy trình"); `tags` = nhãn tự do.
-- Bổ sung cột — KHÔNG đụng dữ liệu cũ; nguồn cũ mặc định category null + tags rỗng.

alter table public.kb_sources
  add column if not exists category text,
  add column if not exists tags     text[] not null default '{}'::text[];

create index if not exists kb_sources_tags_idx on public.kb_sources using gin (tags);
