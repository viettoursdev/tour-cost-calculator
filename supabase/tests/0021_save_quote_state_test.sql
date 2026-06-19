begin;
select plan(7);
select has_function('public', 'save_quote_state', array['jsonb'], 'RPC exists');

-- Call with a minimal payload: one line item, one version (total_cost=1000).
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

-- M2: total_cost preservation — save without total_cost must not zero the stored value
select public.save_quote_state($$ {
  "cloud_id": "q-test-1",
  "quote": {"template":"domestic","name":"T3"},
  "line_items": []
} $$::jsonb);
select is((select total_cost from public.quotes where cloud_id='q-test-1'), 1000::double precision, 'total_cost preserved when omitted from save');

-- C1: re-saving with the same version_no must not error and must leave exactly 1 version row
select public.save_quote_state($$ {
  "cloud_id": "q-test-1",
  "quote": {"template":"domestic","name":"T"},
  "line_items": [],
  "version": {"version_no":1,"saved_at":"2026-01-02T00:00:00Z","saved_by":"QA","note":"v1-retry","state":{"x":2}}
} $$::jsonb);
select is((select count(*)::int from public.quote_versions v join public.quotes q on q.id=v.quote_id where q.cloud_id='q-test-1'), 1, 'same version_no upsert leaves exactly 1 version row');

select * from finish();
rollback;
