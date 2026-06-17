begin;
select plan(5);
select has_table('public','itineraries','itineraries exist');
select has_table('public','itinerary_days','days exist');
select has_table('public','itinerary_flights','flights exist');
select col_type_is('public','itinerary_days','segments','jsonb','segments jsonb');
select fk_ok('public','itinerary_days','itinerary_id','public','itineraries','id');
select * from finish();
rollback;
