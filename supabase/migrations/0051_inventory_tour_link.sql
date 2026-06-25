-- Quản lý kho — Đợt 4: NỐI kho ↔ hồ sơ tour.
--  • inventory_movements / inventory_asset_logs: thêm tour_profile_id + tour_code
--    để xuất kho / cấp thiết bị gắn vào một tour → thống kê chi phí kho theo tour.
--  • inventory_issue / inventory_asset_action: thêm 2 tham số tour (DEFAULT NULL —
--    tương thích ngược, lời gọi cũ không cần đổi).

alter table public.inventory_movements
  add column if not exists tour_profile_id text references public.tour_profiles(id) on delete set null,
  add column if not exists tour_code text;
create index if not exists inventory_movements_tour_idx on public.inventory_movements(tour_profile_id);

alter table public.inventory_asset_logs
  add column if not exists tour_profile_id text references public.tour_profiles(id) on delete set null,
  add column if not exists tour_code text;

-- ── Xuất kho FIFO + gắn tour ────────────────────────────────────────────────────
drop function if exists public.inventory_issue(text, text, text, int, text, text, timestamptz, text);
create or replace function public.inventory_issue(
  p_item_id     text,
  p_color       text,
  p_size        text,
  p_qty         int,
  p_reason      text,
  p_ref         text,
  p_occurred_at timestamptz,
  p_by          text,
  p_tour_profile_id text default null,
  p_tour_code   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_need  int := p_qty;
  v_total int;
  r       record;
  v_take  int;
begin
  if not public.is_viettours_user() then raise exception 'forbidden'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Số lượng xuất phải > 0'; end if;
  perform pg_advisory_xact_lock(hashtext(p_item_id || ':' || coalesce(p_color,'') || ':' || coalesce(p_size,'')));

  select coalesce(sum(ll.qty_remaining), 0) into v_total
    from public.inventory_lot_lines ll
    join public.inventory_lots l on l.id = ll.lot_id
   where l.item_id = p_item_id and l.color = p_color and ll.size = p_size;
  if v_total < p_qty then
    raise exception 'Không đủ tồn: cần %, còn % (% / %)', p_qty, v_total, p_color, p_size;
  end if;

  for r in
    select ll.id as ll_id, ll.qty_remaining, l.id as lot_id, l.unit_cost
      from public.inventory_lot_lines ll
      join public.inventory_lots l on l.id = ll.lot_id
     where l.item_id = p_item_id and l.color = p_color and ll.size = p_size
       and ll.qty_remaining > 0
     order by l.received_at asc, l.created_at asc
  loop
    exit when v_need <= 0;
    v_take := least(v_need, r.qty_remaining);
    update public.inventory_lot_lines set qty_remaining = qty_remaining - v_take where id = r.ll_id;
    insert into public.inventory_movements (
      id, item_id, lot_id, lot_line_id, color, size, type, qty, unit_cost,
      reason, ref, occurred_at, created_by_name, tour_profile_id, tour_code
    ) values (
      'mv_' || replace(gen_random_uuid()::text, '-', ''), p_item_id, r.lot_id, r.ll_id,
      coalesce(p_color,''), coalesce(p_size,''), 'out', v_take, r.unit_cost,
      coalesce(p_reason,''), coalesce(p_ref,''), coalesce(p_occurred_at, now()), coalesce(p_by,''),
      p_tour_profile_id, p_tour_code
    );
    v_need := v_need - v_take;
  end loop;
end;
$$;
grant execute on function public.inventory_issue(text, text, text, int, text, text, timestamptz, text, text, text) to authenticated;

-- ── Thao tác tài sản + gắn tour ─────────────────────────────────────────────────
drop function if exists public.inventory_asset_action(text, text, text, text, text, text, timestamptz, text);
create or replace function public.inventory_asset_action(
  p_asset_id    text,
  p_action      text,
  p_to_status   text,
  p_holder      text,
  p_reason      text,
  p_ref         text,
  p_occurred_at timestamptz,
  p_by          text,
  p_tour_profile_id text default null,
  p_tour_code   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from text;
begin
  if not public.is_viettours_user() then raise exception 'forbidden'; end if;
  select status into v_from from public.inventory_assets where id = p_asset_id;
  if v_from is null then raise exception 'Không tìm thấy tài sản %', p_asset_id; end if;

  update public.inventory_assets
     set status = p_to_status,
         holder = case when p_to_status = 'in_use' then coalesce(p_holder, '') else '' end,
         updated_at = now(), updated_by_name = coalesce(p_by, '')
   where id = p_asset_id;

  insert into public.inventory_asset_logs (
    id, asset_id, action, from_status, to_status, holder, reason, ref, occurred_at,
    created_by_name, tour_profile_id, tour_code
  ) values (
    'al_' || replace(gen_random_uuid()::text, '-', ''), p_asset_id, p_action, v_from, p_to_status,
    coalesce(p_holder, ''), coalesce(p_reason, ''), coalesce(p_ref, ''), coalesce(p_occurred_at, now()),
    coalesce(p_by, ''), p_tour_profile_id, p_tour_code
  );
end;
$$;
grant execute on function public.inventory_asset_action(text, text, text, text, text, text, timestamptz, text, text, text) to authenticated;
