-- Thư viện Viettours Đợt 3: log câu hỏi để gợi ý (autocomplete) + FAQ "hay hỏi".
-- `norm` = câu hỏi chuẩn hoá (thường + bỏ khoảng thừa) để gộp trùng khi đếm phổ biến.
-- RLS: mọi tài khoản @viettours đọc/ghi (kho dùng chung nội bộ).

create table if not exists public.kb_questions (
  id           uuid primary key default gen_random_uuid(),
  question     text not null,
  norm         text generated always as (lower(btrim(question))) stored,
  asked_by     text,
  department   text,
  source_count int  not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists kb_questions_norm_idx    on public.kb_questions (norm);
create index if not exists kb_questions_created_idx on public.kb_questions (created_at desc);

alter table public.kb_questions enable row level security;

drop policy if exists kb_questions_rw on public.kb_questions;
create policy kb_questions_rw on public.kb_questions
  for all
  using (public.is_viettours_user())
  with check (public.is_viettours_user());

-- FAQ "hay hỏi": gộp theo câu chuẩn hoá, đếm số lần, ưu tiên nhiều + mới.
create or replace function public.kb_top_questions(match_count int default 6)
returns table (question text, cnt bigint)
language sql
stable
as $$
  select max(question) as question, count(*) as cnt
  from public.kb_questions
  group by norm
  order by count(*) desc, max(created_at) desc
  limit greatest(match_count, 1);
$$;

grant execute on function public.kb_top_questions(int) to authenticated;
