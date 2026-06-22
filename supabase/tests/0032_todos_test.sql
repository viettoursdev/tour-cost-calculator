begin;
select plan(5);
-- todos: row-per-task (migration 0036, đổi từ kho 1-dòng JSONB của 0032).
select has_table('public', 'todos', 'todos table exists');
select col_is_pk('public', 'todos', 'id', 'todos has id primary key');
select has_column('public', 'todos', 'status', 'todos has status column');
select has_column('public', 'todos', 'assignees', 'todos has assignees column');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.todos'::regclass),
  'RLS enabled on todos');
select * from finish();
rollback;
