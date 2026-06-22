begin;
select plan(3);
select has_table('public', 'todos', 'todos table exists');
select has_column('public', 'todos', 'todos', 'todos column exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.todos'::regclass),
  'RLS enabled on todos');
select * from finish();
rollback;
