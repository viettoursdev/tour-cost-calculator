begin;
select plan(3);
select has_table('public', 'email_links', 'email_links table exists');
select has_column('public', 'email_links', 'links', 'links column exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.email_links'::regclass),
  'RLS enabled on email_links');
select * from finish();
rollback;
