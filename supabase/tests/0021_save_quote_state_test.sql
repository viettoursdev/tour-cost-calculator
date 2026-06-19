begin;
select plan(5);
select has_function('public', 'save_quote_state', array['jsonb'], 'RPC exists');

-- Call with a minimal payload: one line item, one version.
select public.save_quote_state($$ {
  "cloud_id": "q-test-1",
  "quote": {"template":"domestic","name":"T","pax":10,"total_cost":1000,"created_at":"2026-01-01T00:00:00Z"},
  "line_items": [{"category":"hotel","name":"Hotel A","price":500,"sort_order":0}],
  "version": {"version_no":1,"saved_at":"2026-01-01T00:00:00Z","saved_by":"QA","note":"v1","state":{"x":1}}
} $$::jsonb);

select is((select name from public.quotes where cloud_id='q-test-1'), 'T', 'quote upserted');
select is((select count(*)::int from public.quote_line_items li join public.quotes q on q.id=li.quote_id where q.cloud_id='q-test-1'), 1, 'line item inserted');
select is((select count(*)::int from public.quote_versions v join public.quotes q on q.id=v.quote_id where q.cloud_id='q-test-1'), 1, 'version appended');
-- re-save replaces children (not duplicates)
select public.save_quote_state($$ {"cloud_id":"q-test-1","quote":{"template":"domestic","name":"T2"},"line_items":[]} $$::jsonb);
select is((select count(*)::int from public.quote_line_items li join public.quotes q on q.id=li.quote_id where q.cloud_id='q-test-1'), 0, 're-save replaced line items');

select * from finish();
rollback;
