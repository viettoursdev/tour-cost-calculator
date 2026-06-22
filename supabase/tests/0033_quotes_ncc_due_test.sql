begin;
select plan(1);
select has_column('public', 'quotes', 'ncc_due', 'quotes.ncc_due column added');
select * from finish();
rollback;
