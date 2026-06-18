begin;
select plan(2);

-- Backstop: NO public base table may ship without RLS enabled.
select is(
  (select count(*)::int
     from pg_tables t
     join pg_class c on c.relname = t.tablename and c.relnamespace = 'public'::regnamespace
    where t.schemaname = 'public' and c.relrowsecurity = false),
  0,
  'every public table has RLS enabled');

-- quotes participates in realtime.
select is(
  (select count(*)::int from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='quotes'),
  1, 'quotes is in supabase_realtime');

select * from finish();
rollback;
