begin;
select plan(6);

select has_table('public', 'profiles', 'profiles table exists');
select col_is_pk('public', 'profiles', 'id', 'id is PK');
select fk_ok('public', 'profiles', 'id', 'auth', 'users', 'id');
select ok( (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'RLS enabled');

-- This test unit-tests the trigger's CEO-vs-Standard branching by injecting
-- the bootstrap-email GUC into the session (the migration's ALTER DATABASE
-- cannot run on the local non-superuser image). It verifies trigger LOGIC,
-- not that production durably set the GUC — that is an operational check
-- performed on first cloud deploy (see docs/supabase-setup.md / cutover runbook).
select set_config('app.bootstrap_ceo_email', 'developer@viettours.com.vn', false);

-- Trigger provisions a profile when an auth user is created.
insert into auth.users (id, email, instance_id, aud, role)
values (gen_random_uuid(), 'newhire@viettours.com.vn', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
select is(
  (select role from public.profiles where email = 'newhire@viettours.com.vn'),
  'Standard', 'new user gets Standard role');

insert into auth.users (id, email, instance_id, aud, role)
values (gen_random_uuid(), 'developer@viettours.com.vn', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
select is(
  (select role from public.profiles where email = 'developer@viettours.com.vn'),
  'CEO', 'bootstrap email gets CEO role');

select * from finish();
rollback;
