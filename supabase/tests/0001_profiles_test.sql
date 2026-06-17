begin;
select plan(6);

select has_table('public', 'profiles', 'profiles table exists');
select col_is_pk('public', 'profiles', 'id', 'id is PK');
select fk_ok('public', 'profiles', 'id', 'auth', 'users', 'id');
select ok( (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'RLS enabled');

-- Ensure the bootstrap CEO setting is visible in this session (alter database applies
-- to new connections; db reset → test db connects fresh, so it should already be set.
-- set_config here is a belt-and-suspenders guard that costs nothing if already set).
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
