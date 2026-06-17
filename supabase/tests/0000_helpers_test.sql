begin;
select plan(3);

select has_extension('pgcrypto');
select has_function('public', 'is_viettours_user', 'is_viettours_user exists');

-- With a company-domain claim it returns true.
select set_config('request.jwt.claims', '{"email":"a@viettours.com.vn"}', true);
select is( public.is_viettours_user(), true, 'company email passes' );

select * from finish();
rollback;
