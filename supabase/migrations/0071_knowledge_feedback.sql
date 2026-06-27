-- Thư viện Viettours Đợt 4: phản hồi đáp án (👍 up / 👎 down / báo thiếu missing).
-- 👎 và "báo thiếu" còn sinh việc To-Do "Bổ sung kiến thức" ở phía client.
-- Dùng để biết câu trả lời nào chưa tốt / kho còn thiếu gì.

create table if not exists public.kb_feedback (
  id         uuid primary key default gen_random_uuid(),
  question   text,
  answer     text,
  source_ids uuid[] not null default '{}'::uuid[],
  kind       text not null check (kind in ('up', 'down', 'missing')),
  note       text,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists kb_feedback_created_idx on public.kb_feedback (created_at desc);

alter table public.kb_feedback enable row level security;

drop policy if exists kb_feedback_rw on public.kb_feedback;
create policy kb_feedback_rw on public.kb_feedback
  for all
  using (public.is_viettours_user())
  with check (public.is_viettours_user());
