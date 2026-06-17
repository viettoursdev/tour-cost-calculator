begin;
select plan(9);

select has_table('public','audit_log','audit_log exists');
select has_table('public','fx_rates','fx_rates exists');
select has_table('public','pois','pois exists');
select has_table('public','attachments','attachments exists');
select col_is_pk('public','fx_rates','currency','fx currency PK');
select has_index('public','attachments','attachments_parent_idx','attachments parent index');

-- RLS behavior: anon (no email claim) is denied SELECT; company user allowed.
set local role authenticated;
select set_config('request.jwt.claims', '{"email":"x@gmail.com"}', true);
select is( public.is_viettours_user(), false, 'external email blocked by predicate' );
select set_config('request.jwt.claims', '{"email":"x@viettours.com.vn"}', true);
select is( public.is_viettours_user(), true, 'company email allowed by predicate' );
select ok( (select relrowsecurity from pg_class where oid='public.attachments'::regclass), 'attachments RLS on');

select * from finish();
rollback;
