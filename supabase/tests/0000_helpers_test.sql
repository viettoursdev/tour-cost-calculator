begin;
select plan(5);

select has_extension('pgcrypto');
select has_function('public', 'is_viettours_user', 'is_viettours_user exists');

-- With a company-domain claim it returns true.
select set_config('request.jwt.claims', '{"email":"a@viettours.com.vn"}', true);
select is( public.is_viettours_user(), true, 'company email passes' );

-- External domain email must return false.
select set_config('request.jwt.claims', '{"email":"x@gmail.com"}', true);
select is( public.is_viettours_user(), false, 'external email blocked' );

-- Missing/null email claim must return false (exercises the coalesce null-guard).
select set_config('request.jwt.claims', '{}', true);
select is( public.is_viettours_user(), false, 'missing email claim → false' );

select * from finish();
rollback;
