begin;
select plan(4);
select has_table('public','quote_versions','versions exist');
select col_type_is('public','quote_versions','state','jsonb','state is jsonb');
select fk_ok('public','quote_versions','quote_id','public','quotes','id');
select col_is_unique('public','quote_versions', array['quote_id','version_no'], 'one row per (quote,version)');
select * from finish();
rollback;
