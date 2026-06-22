-- To-Do: chuyển từ 1 dòng JSONB dùng chung (0032) sang BẢNG NHIỀU DÒNG (mỗi việc 1 row).
-- Lý do: kho 1-dòng ghi đè cả mảng mỗi lần lưu → last-write-wins, hai người sửa cùng lúc
-- mất dữ liệu, và mọi client tải toàn bộ. Bảng row-per-task cho ghi từng việc, lọc tại DB,
-- và (sau này) siết quyền theo người tạo/được giao. Các trường lồng nhau giữ ở JSONB.

alter table public.todos rename to todos_legacy;
alter publication supabase_realtime drop table public.todos_legacy;

create table public.todos (
  id              text primary key,
  title           text not null default '',
  note            text,
  status          text not null default 'todo',        -- todo|doing|done
  priority        text not null default 'normal',       -- normal|high|urgent
  created_by      text not null default '',             -- username người tạo
  created_by_name text not null default '',
  created_at      timestamptz not null default now(),
  assignees       text[] not null default '{}',         -- usernames được giao
  due_date        timestamptz,
  remind_at       jsonb,                                -- string[] mốc tuyệt đối (ISO)
  remind_lead     jsonb,                                -- number[] phút trước hạn
  link            jsonb,                                -- NotifLink
  checklist       jsonb,                                -- TodoChecklistItem[]
  recurring       text not null default 'none',         -- none|daily|weekly|monthly
  tags            text[] not null default '{}',
  auto            text,                                 -- nguồn tự sinh (vd 'quote_won')
  responses       jsonb,                                -- TodoResponse[]
  completed_at    timestamptz,
  completed_by    text,
  updated_at      timestamptz,
  updated_by      text
);

create index todos_status_idx     on public.todos(status);
create index todos_created_by_idx on public.todos(created_by);
create index todos_due_idx        on public.todos(due_date);
create index todos_assignees_idx  on public.todos using gin(assignees);
create index todos_tags_idx       on public.todos using gin(tags);

-- Bê dữ liệu cũ: bung mảng JSONB của dòng dùng chung thành từng row.
insert into public.todos (
  id, title, note, status, priority, created_by, created_by_name, created_at,
  assignees, due_date, remind_at, remind_lead, link, checklist, recurring, tags, auto,
  responses, completed_at, completed_by, updated_at, updated_by
)
select
  coalesce(nullif(t->>'id',''), gen_random_uuid()::text),
  coalesce(t->>'title',''),
  t->>'note',
  coalesce(t->>'status','todo'),
  coalesce(t->>'priority','normal'),
  coalesce(t->>'createdBy',''),
  coalesce(t->>'createdByName',''),
  coalesce((t->>'createdAt')::timestamptz, now()),
  coalesce((select array_agg(x) from jsonb_array_elements_text(t->'assignees') x), '{}'),
  (t->>'dueDate')::timestamptz,
  t->'remindAt',
  t->'remindLead',
  t->'link',
  t->'checklist',
  coalesce(t->>'recurring','none'),
  coalesce((select array_agg(x) from jsonb_array_elements_text(t->'tags') x), '{}'),
  t->>'auto',
  t->'responses',
  (t->>'completedAt')::timestamptz,
  t->>'completedBy',
  (t->>'updatedAt')::timestamptz,
  t->>'updatedBy'
from public.todos_legacy, lateral jsonb_array_elements(todos_legacy.todos) as t
on conflict (id) do nothing;

drop table public.todos_legacy;

-- RLS + realtime (cùng khuôn do-$$ của 0034/0035). Cổng thô: chỉ user @viettours.
do $$
begin
  execute 'alter table public.todos enable row level security';
  execute 'create policy todos_read  on public.todos for select using (public.is_viettours_user())';
  execute 'create policy todos_write on public.todos for all using (public.is_viettours_user()) with check (public.is_viettours_user())';
  execute 'alter publication supabase_realtime add table public.todos';
end $$;
