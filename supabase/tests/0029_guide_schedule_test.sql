begin;
select plan(3);
select has_table('public', 'guide_schedule', 'guide_schedule table exists');
select has_column('public', 'guide_schedule', 'assignments', 'assignments column exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.guide_schedule'::regclass),
  'RLS enabled on guide_schedule');
select * from finish();
rollback;
