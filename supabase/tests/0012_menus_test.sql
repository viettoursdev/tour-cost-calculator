begin;
select plan(5);
select has_table('public','menus','menus exist');
select has_table('public','menu_days','menu_days exist');
select has_table('public','restaurants','restaurants exist');
select col_type_is('public','menu_days','meals','jsonb','meals jsonb');
select fk_ok('public','restaurant_menus','restaurant_id','public','restaurants','id');
select * from finish();
rollback;
