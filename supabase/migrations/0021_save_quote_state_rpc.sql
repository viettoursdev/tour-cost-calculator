-- Atomic quote-state save: upsert the quote's draft columns, replace all child
-- rows, append a version snapshot (cap 20) — all in one transaction so a quote
-- is never half-written. Called by the gateway via supabase.rpc('save_quote_state', { p }).
-- SECURITY INVOKER (default): runs as the calling authenticated user; RLS applies
-- (the per-table policies already allow @viettours users), and 0017 grants cover DML.

-- Controller-reconciliation columns: added here so Tasks 4 and 8 can reference them
-- without owning their own column migrations.
alter table public.quotes add column if not exists loss_reason text;
alter table public.quotes add column if not exists workflow_due jsonb;

create or replace function public.save_quote_state(p jsonb)
returns void
language plpgsql
as $$
declare
  v_quote_id uuid;
  v_cloud_id text := p->>'cloud_id';
  q jsonb := p->'quote';
  elem jsonb;
  child jsonb;
  v_flight_id uuid;
  v_group_id uuid;
begin
  if v_cloud_id is null then raise exception 'save_quote_state: cloud_id required'; end if;

  -- (a) upsert the quotes row draft columns (metadata like quote_code/name/customer
  -- are owned by sbSaveQuote; here we only write the draft-derived columns + ensure row exists)
  insert into public.quotes (cloud_id, template, name, pax, total_cost, status,
      info, rates, rate_base, margin, vat, svc_basis, rounding, cat_enabled,
      pricing_options, inclusions, exclusions, output_currency, dmc_prices, dmc_margin,
      active_group_id, depart_date, created_at, created_by_name, updated_at, updated_by_name)
  values (v_cloud_id,
      coalesce(q->>'template',''), coalesce(q->>'name',''),
      coalesce((q->>'pax')::int,0), coalesce((q->>'total_cost')::double precision,0),
      q->>'status', coalesce(q->'info','{}'::jsonb), coalesce(q->'rates','{}'::jsonb),
      q->>'rate_base', coalesce((q->>'margin')::double precision,0),
      coalesce((q->>'vat')::double precision,0), coalesce((q->>'svc_basis')::double precision,0),
      coalesce((q->>'rounding')::double precision,0), coalesce(q->'cat_enabled','{}'::jsonb),
      q->'pricing_options',
      case when q ? 'inclusions' then array(select jsonb_array_elements_text(q->'inclusions')) else null end,
      case when q ? 'exclusions' then array(select jsonb_array_elements_text(q->'exclusions')) else null end,
      q->>'output_currency', q->'dmc_prices', q->'dmc_margin', q->>'active_group_id',
      nullif(q->>'depart_date','')::date,
      coalesce(nullif(q->>'created_at','')::timestamptz, now()), q->>'created_by_name',
      now(), q->>'updated_by_name')
  on conflict (cloud_id) do update set
      template = excluded.template, name = excluded.name, pax = excluded.pax,
      total_cost = case when q ? 'total_cost' then excluded.total_cost else public.quotes.total_cost end,
      status = excluded.status, info = excluded.info,
      rates = excluded.rates, rate_base = excluded.rate_base, margin = excluded.margin,
      vat = excluded.vat, svc_basis = excluded.svc_basis, rounding = excluded.rounding,
      cat_enabled = excluded.cat_enabled, pricing_options = excluded.pricing_options,
      inclusions = excluded.inclusions, exclusions = excluded.exclusions,
      output_currency = excluded.output_currency, dmc_prices = excluded.dmc_prices,
      dmc_margin = excluded.dmc_margin, active_group_id = excluded.active_group_id,
      depart_date = excluded.depart_date, updated_at = now(),
      updated_by_name = excluded.updated_by_name
  returning id into v_quote_id;

  -- (b) replace children. Delete all, then re-insert from payload arrays.
  delete from public.quote_line_items where quote_id = v_quote_id;
  delete from public.quote_flights where quote_id = v_quote_id;     -- cascades segments+fares
  delete from public.quote_workflow_steps where quote_id = v_quote_id; -- cascades logs
  delete from public.quote_groups where quote_id = v_quote_id;      -- cascades group_items
  delete from public.quote_payments where quote_id = v_quote_id;

  -- line items
  for elem in select * from jsonb_array_elements(coalesce(p->'line_items','[]'::jsonb)) loop
    insert into public.quote_line_items (quote_id, category, legacy_item_id, name, note, cur,
        price, times, qty_mode, custom_qty, unit, enabled, foc, optional, included, sort_order)
    values (v_quote_id, elem->>'category', nullif(elem->>'legacy_item_id','')::bigint,
        coalesce(elem->>'name',''), coalesce(elem->>'note',''), coalesce(elem->>'cur','VND'),
        coalesce((elem->>'price')::double precision,0), coalesce((elem->>'times')::double precision,1),
        coalesce(elem->>'qty_mode','per_pax'), coalesce((elem->>'custom_qty')::double precision,0),
        coalesce(elem->>'unit',''), coalesce((elem->>'enabled')::boolean,true),
        coalesce((elem->>'foc')::boolean,false), (elem->>'optional')::boolean,
        (elem->>'included')::boolean, coalesce((elem->>'sort_order')::int,0));
  end loop;

  -- flights + segments + fares
  for elem in select * from jsonb_array_elements(coalesce(p->'flights','[]'::jsonb)) loop
    insert into public.quote_flights (quote_id, legacy_flight_id, note, sort_order)
    values (v_quote_id, elem->>'legacy_flight_id', elem->>'note', coalesce((elem->>'sort_order')::int,0))
    returning id into v_flight_id;
    for child in select * from jsonb_array_elements(coalesce(elem->'segments','[]'::jsonb)) loop
      insert into public.quote_flight_segments (flight_id, date, flight_no, airline_code, airline_name,
          dep_airport, arr_airport, dep_city, arr_city, dep_time, arr_time, dep_day_offset, arr_day_offset, sort_order)
      values (v_flight_id, child->>'date', child->>'flight_no', child->>'airline_code', child->>'airline_name',
          child->>'dep_airport', child->>'arr_airport', child->>'dep_city', child->>'arr_city',
          child->>'dep_time', child->>'arr_time', (child->>'dep_day_offset')::int, (child->>'arr_day_offset')::int,
          coalesce((child->>'sort_order')::int,0));
    end loop;
    for child in select * from jsonb_array_elements(coalesce(elem->'fares','[]'::jsonb)) loop
      insert into public.quote_flight_fares (flight_id, legacy_fare_id, label, amount, cur, sort_order)
      values (v_flight_id, child->>'legacy_fare_id', coalesce(child->>'label',''),
          coalesce((child->>'amount')::double precision,0), coalesce(child->>'cur','VND'),
          coalesce((child->>'sort_order')::int,0));
    end loop;
  end loop;

  -- workflow steps + logs
  for elem in select * from jsonb_array_elements(coalesce(p->'workflow','[]'::jsonb)) loop
    insert into public.quote_workflow_steps (quote_id, legacy_step_id, label, status, step_key,
        due_offset, start_date, due_date, done_date, assignee_username, note, sort_order)
    values (v_quote_id, elem->>'legacy_step_id', coalesce(elem->>'label',''),
        coalesce(elem->>'status','todo'), elem->>'step_key', (elem->>'due_offset')::int,
        nullif(elem->>'start_date','')::date, nullif(elem->>'due_date','')::date,
        nullif(elem->>'done_date','')::date, elem->>'assignee_username', elem->>'note',
        coalesce((elem->>'sort_order')::int,0))
    returning id into v_flight_id;  -- reuse var as step id
    for child in select * from jsonb_array_elements(coalesce(elem->'logs','[]'::jsonb)) loop
      insert into public.quote_workflow_logs (step_id, at, by_name, action, sort_order)
      values (v_flight_id, coalesce(nullif(child->>'at','')::timestamptz, now()),
          coalesce(child->>'by_name',''), coalesce(child->>'action',''),
          coalesce((child->>'sort_order')::int,0));
    end loop;
  end loop;

  -- groups + group_items
  for elem in select * from jsonb_array_elements(coalesce(p->'groups','[]'::jsonb)) loop
    insert into public.quote_groups (quote_id, legacy_group_id, label, pax, cat_enabled, sort_order)
    values (v_quote_id, elem->>'legacy_group_id', coalesce(elem->>'label',''),
        coalesce((elem->>'pax')::int,0), coalesce(elem->'cat_enabled','{}'::jsonb),
        coalesce((elem->>'sort_order')::int,0))
    returning id into v_group_id;
    for child in select * from jsonb_array_elements(coalesce(elem->'items','[]'::jsonb)) loop
      insert into public.quote_group_items (group_id, category, legacy_item_id, name, note, cur,
          price, times, qty_mode, custom_qty, unit, enabled, foc, optional, included, sort_order)
      values (v_group_id, child->>'category', nullif(child->>'legacy_item_id','')::bigint,
          coalesce(child->>'name',''), coalesce(child->>'note',''), coalesce(child->>'cur','VND'),
          coalesce((child->>'price')::double precision,0), coalesce((child->>'times')::double precision,1),
          coalesce(child->>'qty_mode','per_pax'), coalesce((child->>'custom_qty')::double precision,0),
          coalesce(child->>'unit',''), coalesce((child->>'enabled')::boolean,true),
          coalesce((child->>'foc')::boolean,false), (child->>'optional')::boolean,
          (child->>'included')::boolean, coalesce((child->>'sort_order')::int,0));
    end loop;
  end loop;

  -- payments
  for elem in select * from jsonb_array_elements(coalesce(p->'payments','[]'::jsonb)) loop
    insert into public.quote_payments (quote_id, legacy_payment_id, label, amount, note, sort_order)
    values (v_quote_id, elem->>'legacy_payment_id', coalesce(elem->>'label',''),
        coalesce((elem->>'amount')::double precision,0), coalesce(elem->>'note',''),
        coalesce((elem->>'sort_order')::int,0));
  end loop;

  -- (c) append version snapshot, trim to newest 20
  if p ? 'version' then
    insert into public.quote_versions (quote_id, version_no, saved_at, saved_by, note, state)
    values (v_quote_id, coalesce((p->'version'->>'version_no')::int, 1),
        coalesce(nullif(p->'version'->>'saved_at','')::timestamptz, now()),
        coalesce(p->'version'->>'saved_by',''), coalesce(p->'version'->>'note',''),
        coalesce(p->'version'->'state','{}'::jsonb))
    on conflict (quote_id, version_no) do update set
        saved_at = excluded.saved_at, saved_by = excluded.saved_by,
        note = excluded.note, state = excluded.state;
    delete from public.quote_versions where quote_id = v_quote_id and id not in (
      select id from public.quote_versions where quote_id = v_quote_id
      order by version_no desc limit 20);
  end if;
end;
$$;
