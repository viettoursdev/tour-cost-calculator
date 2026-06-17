begin;
select plan(5);
select has_table('public','rate_card_hotels','hotels exists');
select has_table('public','rate_card_other','other exists');
select has_table('public','rate_card_visa','visa exists');
select col_type_is('public','rate_card_hotels','entries','jsonb','entries is jsonb');
-- singleton guard: a second visa row must fail.
select throws_ok($$ insert into public.rate_card_visa(one_row,data) values (false,'{}'); $$);
select * from finish();
rollback;
