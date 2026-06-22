-- To-Do dùng chung: a single shared row (mirrors the Firestore viettours/todos doc).
create table public.todos (
  one_row    boolean primary key default true check (one_row),
  todos      jsonb not null default '[]'::jsonb,
  updated_at timestamptz,
  updated_by text
);

alter table public.todos enable row level security;
create policy todos_read  on public.todos for select
  using (public.is_viettours_user());
create policy todos_write on public.todos for all
  using (public.is_viettours_user()) with check (public.is_viettours_user());

-- The store subscribes; emit live changes.
alter publication supabase_realtime add table public.todos;
