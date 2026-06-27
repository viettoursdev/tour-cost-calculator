-- Thư viện Viettours Đợt 5: HYBRID SEARCH — gộp tìm kiếm ngữ nghĩa (vector) với
-- full-text tiếng Việt (tsvector 'simple') bằng Reciprocal Rank Fusion (RRF).
-- Vector bắt ý nghĩa; full-text bắt từ khoá chính xác (tên KS, mã tour, danh từ riêng).
--
-- Đổi CHỮ KÝ kb_search: thêm tham số query_text. Bản (vector,int) cũ bị thay bằng
-- (vector,text,int) — client truyền thêm query_text (xem searchKnowledge/findSimilarSources).
-- RLS vẫn tự áp (security invoker): join kb_sources/kb_chunks chỉ thấy hàng được phép.

drop function if exists public.kb_search(vector, int);

create or replace function public.kb_search(
  query_embedding vector(1024),
  query_text      text default '',
  match_count     int  default 6
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
  with q as (
    select plainto_tsquery('simple', coalesce(query_text, '')) as ts
  ),
  vec as (
    select c.id, row_number() over (order by c.embedding <=> query_embedding) as rnk
    from public.kb_chunks c
    join public.kb_sources s on s.id = c.source_id
    where s.status = 'ready' and c.embedding is not null
    order by c.embedding <=> query_embedding
    limit greatest(match_count, 1) * 4
  ),
  fts as (
    select c.id, row_number() over (order by ts_rank(c.fts, q.ts) desc) as rnk
    from public.kb_chunks c
    join public.kb_sources s on s.id = c.source_id
    cross join q
    where s.status = 'ready' and q.ts is not null and c.fts @@ q.ts
    order by ts_rank(c.fts, q.ts) desc
    limit greatest(match_count, 1) * 4
  ),
  fused as (
    -- RRF: điểm = tổng 1/(60 + hạng) trên 2 danh sách (hằng 60 chuẩn RRF).
    select coalesce(vec.id, fts.id) as id,
           coalesce(1.0 / (60 + vec.rnk), 0) + coalesce(1.0 / (60 + fts.rnk), 0) as score
    from vec
    full outer join fts on vec.id = fts.id
  )
  select c.id,
         c.source_id,
         s.title,
         s.kind,
         c.content,
         s.updated_at,
         1 - (c.embedding <=> query_embedding) as similarity
  from fused f
  join public.kb_chunks  c on c.id = f.id
  join public.kb_sources s on s.id = c.source_id
  order by f.score desc
  limit greatest(match_count, 1);
$$;

grant execute on function public.kb_search(vector, text, int) to authenticated;
