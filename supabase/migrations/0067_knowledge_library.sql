-- Thư viện Viettours — kho kiến thức nội bộ (RAG) Đợt 1: nền MVP.
-- Một NGUỒN (kb_sources: 1 lần add text/file/link) sinh ra nhiều KHỐI
-- (kb_chunks: đoạn ~400 từ kèm embedding 1024 chiều của Voyage voyage-3.5).
-- Truy hồi ngữ nghĩa qua RPC kb_search (cosine distance, dùng index HNSW).
-- on delete cascade: chỉnh/xoá nguồn dọn sạch khối liên quan (không để rác),
-- đúng nguyên tắc cập-nhật-không-phá-dữ-liệu — re-embed = xoá khối cũ + tạo mới.
--
-- RLS Đợt 1: mọi tài khoản @viettours.com.vn ĐỌC/GHI được toàn kho. Siết theo
-- phòng ban để dành cho Đợt 4 (cột `department` đã có sẵn để khỏi đổi schema sau).

create extension if not exists vector;

-- NGUỒN -----------------------------------------------------------------------
create table if not exists public.kb_sources (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  kind        text not null default 'chat' check (kind in ('chat', 'file', 'link')),
  raw_ref     text,                       -- url, hoặc R2 key, hoặc null (chat)
  department  text,                       -- để siết RLS theo phòng ở Đợt 4
  created_by  text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  status      text not null default 'ready' check (status in ('processing', 'ready', 'error'))
);

-- KHỐI ------------------------------------------------------------------------
create table if not exists public.kb_chunks (
  id          uuid primary key default gen_random_uuid(),
  source_id   uuid not null references public.kb_sources(id) on delete cascade,
  chunk_index int  not null default 0,
  content     text not null,
  embedding   vector(1024),               -- voyage-3.5 (1024 chiều)
  fts         tsvector generated always as (to_tsvector('simple', content)) stored,
  created_at  timestamptz not null default now()
);

create index if not exists kb_chunks_source_idx on public.kb_chunks (source_id);
create index if not exists kb_chunks_fts_idx    on public.kb_chunks using gin (fts);
create index if not exists kb_chunks_embed_idx  on public.kb_chunks
  using hnsw (embedding vector_cosine_ops);

-- RLS -------------------------------------------------------------------------
alter table public.kb_sources enable row level security;
alter table public.kb_chunks  enable row level security;

drop policy if exists kb_sources_rw on public.kb_sources;
create policy kb_sources_rw on public.kb_sources
  for all
  using (public.is_viettours_user())
  with check (public.is_viettours_user());

drop policy if exists kb_chunks_rw on public.kb_chunks;
create policy kb_chunks_rw on public.kb_chunks
  for all
  using (public.is_viettours_user())
  with check (public.is_viettours_user());

-- TRUY HỒI --------------------------------------------------------------------
-- Trả top-K khối gần câu hỏi nhất theo cosine similarity. Chạy theo quyền NGƯỜI
-- GỌI (security invoker) nên RLS tự áp — Đợt 4 siết phòng ban là tự lọc theo đây.
create or replace function public.kb_search(
  query_embedding vector(1024),
  match_count     int default 6
)
returns table (
  chunk_id          uuid,
  source_id         uuid,
  title             text,
  kind              text,
  content           text,
  source_updated_at timestamptz,
  similarity        double precision
)
language sql
stable
as $$
  select c.id,
         c.source_id,
         s.title,
         s.kind,
         c.content,
         s.updated_at,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.kb_chunks c
  join public.kb_sources s on s.id = c.source_id
  where s.status = 'ready'
    and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

grant execute on function public.kb_search(vector, int) to authenticated;
