-- Module Quản lý kho (Inventory) — Đợt 1: hàng tiêu hao quản lý THEO LÔ.
--  • inventory_categories: loại sản phẩm do người quản lý TỰ THÊM (Áo đồng phục,
--    Travel kit, …). `code` = tiền tố mã (AO, TK…); `seq` = bộ đếm sinh mã item;
--    `kind` = 'consumable' (theo lô, Đợt 1) | 'asset' (từng cái, dành cho Đợt 2).
--  • inventory_items: sản phẩm. Mã `code` dạng `{tiền tố}-{NNN}` sinh atomic.
--  • inventory_lots: 1 LÔ = 1 MÀU của 1 sản phẩm (đơn giá nhập chung cho cả lô).
--  • inventory_lot_lines: mỗi SIZE trong lô — ĐƠN VỊ FIFO (qty_remaining trừ dần).
--  • inventory_movements: sổ NHẬP/XUẤT/ĐIỀU CHỈNH (lý do + thời gian + tham chiếu).
-- Tồn hiện tại = gộp qty_remaining theo (sản phẩm, màu, size); KHÔNG lưu số tồn rời —
-- mọi thay đổi đi qua RPC atomic để có lịch sử + giá vốn FIFO chính xác.

-- ── Bảng ───────────────────────────────────────────────────────────────────────
create table public.inventory_categories (
  id            text primary key,
  code          text unique not null,                  -- tiền tố mã: AO, TK, TB
  name          text not null default '',              -- "Áo đồng phục"
  kind          text not null default 'consumable',    -- consumable | asset
  seq           int  not null default 0,               -- bộ đếm sinh mã sản phẩm
  note          text not null default '',
  created_by_name text not null default '',
  created_at    timestamptz not null default now()
);

create table public.inventory_items (
  id            text primary key,
  code          text unique not null,                  -- AO-001
  category_id   text not null references public.inventory_categories(id) on delete restrict,
  name          text not null default '',
  unit          text not null default 'cái',           -- đơn vị tính
  sizes         text[] not null default '{}',          -- size áp dụng (S,M,L…); rỗng = không theo size
  min_stock     int  not null default 0,               -- tồn tối thiểu (cảnh báo — dùng ở Đợt 3)
  image_url     text,
  note          text not null default '',
  active        boolean not null default true,
  created_by_name text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  updated_by_name text
);
create index inventory_items_category_idx on public.inventory_items(category_id);

create table public.inventory_lots (
  id            text primary key,
  code          text unique not null,                  -- AO-001-DO-L2506251
  item_id       text not null references public.inventory_items(id) on delete cascade,
  color         text not null default '',              -- màu hiển thị (Đỏ)
  color_code    text not null default '',              -- mã màu trong code (DO)
  unit_cost     numeric not null default 0,            -- đơn giá nhập (VND) cho cả lô
  supplier      text not null default '',
  received_at   date not null,                         -- ngày nhập lô
  note          text not null default '',
  created_by_name text not null default '',
  created_at    timestamptz not null default now()
);
create index inventory_lots_item_idx on public.inventory_lots(item_id);

create table public.inventory_lot_lines (
  id            text primary key,
  lot_id        text not null references public.inventory_lots(id) on delete cascade,
  size          text not null default '',
  qty_in        int not null default 0,
  qty_remaining int not null default 0
);
create index inventory_lot_lines_lot_idx on public.inventory_lot_lines(lot_id);

create table public.inventory_movements (
  id            text primary key,
  item_id       text not null references public.inventory_items(id) on delete cascade,
  lot_id        text references public.inventory_lots(id) on delete set null,
  lot_line_id   text references public.inventory_lot_lines(id) on delete set null,
  color         text not null default '',
  size          text not null default '',
  type          text not null,                         -- in | out | adjust
  qty           int not null,                          -- LUÔN dương; chiều suy từ type
  unit_cost     numeric not null default 0,            -- giá vốn áp cho dòng này (FIFO)
  reason        text not null default '',
  ref           text not null default '',              -- tham chiếu: tour / người nhận
  occurred_at   timestamptz not null default now(),
  created_by_name text not null default '',
  created_at    timestamptz not null default now()
);
create index inventory_movements_item_idx on public.inventory_movements(item_id);
create index inventory_movements_time_idx on public.inventory_movements(occurred_at desc);

-- ── RLS + realtime (cổng thô @viettours; siết hiển thị ở lớp giao diện qua manageInventory) ──
do $$
declare t text;
begin
  foreach t in array array[
    'inventory_categories','inventory_items','inventory_lots',
    'inventory_lot_lines','inventory_movements'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I on public.%I for select using (public.is_viettours_user());', t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.is_viettours_user()) with check (public.is_viettours_user());', t||'_write', t);
    execute format('alter publication supabase_realtime add table public.%I;', t);
  end loop;
end $$;

-- ── Sinh mã sản phẩm ATOMIC: {tiền tố loại}-{NNN} ──────────────────────────────
-- UPDATE ... RETURNING khoá hàng category trong transaction → 2 người tạo cùng loại
-- không bao giờ trùng STT. UNIQUE(code) là chốt chặn cuối.
create or replace function public.inventory_next_item_code(p_category_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_seq    int;
begin
  if not public.is_viettours_user() then raise exception 'forbidden'; end if;
  update public.inventory_categories
     set seq = seq + 1
   where id = p_category_id
   returning code, seq into v_prefix, v_seq;
  if v_prefix is null then raise exception 'Không tìm thấy loại sản phẩm %', p_category_id; end if;
  return v_prefix || '-' || lpad(v_seq::text, 3, '0');
end;
$$;
grant execute on function public.inventory_next_item_code(text) to authenticated;

-- ── Nhập một LÔ (theo màu, nhiều size) — tạo lot + lot_lines + movement IN ──────
-- p_lines: jsonb mảng [{"size":"M","qty":20}, …]. Sinh mã lô atomic theo (item+màu+ngày).
create or replace function public.inventory_receive_lot(
  p_item_id     text,
  p_color       text,
  p_color_code  text,
  p_unit_cost   numeric,
  p_supplier    text,
  p_received_at date,
  p_note        text,
  p_lines       jsonb,
  p_by          text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_code text;
  v_date      text := to_char(coalesce(p_received_at, current_date), 'DDMMYY');
  v_n         int;
  v_lot_id    text := 'lot_' || replace(gen_random_uuid()::text, '-', '');
  v_lot_code  text;
  v_line      jsonb;
  v_size      text;
  v_qty       int;
  v_ll_id     text;
begin
  if not public.is_viettours_user() then raise exception 'forbidden'; end if;
  select code into v_item_code from public.inventory_items where id = p_item_id;
  if v_item_code is null then raise exception 'Không tìm thấy sản phẩm %', p_item_id; end if;

  -- Khoá theo (sản phẩm + mã màu + ngày) để STT lô trong ngày không trùng.
  perform pg_advisory_xact_lock(hashtext(p_item_id || ':' || p_color_code || ':' || v_date));
  select count(*) + 1 into v_n
    from public.inventory_lots
   where item_id = p_item_id and color_code = p_color_code
     and to_char(received_at, 'DDMMYY') = v_date;
  v_lot_code := v_item_code || '-' || p_color_code || '-L' || v_date || v_n;

  insert into public.inventory_lots (
    id, code, item_id, color, color_code, unit_cost, supplier, received_at, note, created_by_name
  ) values (
    v_lot_id, v_lot_code, p_item_id, coalesce(p_color, ''), coalesce(p_color_code, ''),
    coalesce(p_unit_cost, 0), coalesce(p_supplier, ''), coalesce(p_received_at, current_date),
    coalesce(p_note, ''), coalesce(p_by, '')
  );

  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_size := coalesce(v_line->>'size', '');
    v_qty  := coalesce((v_line->>'qty')::int, 0);
    if v_qty <= 0 then continue; end if;
    v_ll_id := 'll_' || replace(gen_random_uuid()::text, '-', '');
    insert into public.inventory_lot_lines (id, lot_id, size, qty_in, qty_remaining)
      values (v_ll_id, v_lot_id, v_size, v_qty, v_qty);
    insert into public.inventory_movements (
      id, item_id, lot_id, lot_line_id, color, size, type, qty, unit_cost, reason, occurred_at, created_by_name
    ) values (
      'mv_' || replace(gen_random_uuid()::text, '-', ''), p_item_id, v_lot_id, v_ll_id,
      coalesce(p_color, ''), v_size, 'in', v_qty, coalesce(p_unit_cost, 0),
      'Nhập lô ' || v_lot_code, coalesce(p_received_at, current_date)::timestamptz, coalesce(p_by, '')
    );
  end loop;

  return jsonb_build_object('lot_id', v_lot_id, 'lot_code', v_lot_code);
end;
$$;
grant execute on function public.inventory_receive_lot(text, text, text, numeric, text, date, text, jsonb, text) to authenticated;

-- ── Xuất kho theo FIFO (trừ lô cũ trước) ───────────────────────────────────────
create or replace function public.inventory_issue(
  p_item_id     text,
  p_color       text,
  p_size        text,
  p_qty         int,
  p_reason      text,
  p_ref         text,
  p_occurred_at timestamptz,
  p_by          text
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
      id, item_id, lot_id, lot_line_id, color, size, type, qty, unit_cost, reason, ref, occurred_at, created_by_name
    ) values (
      'mv_' || replace(gen_random_uuid()::text, '-', ''), p_item_id, r.lot_id, r.ll_id,
      coalesce(p_color,''), coalesce(p_size,''), 'out', v_take, r.unit_cost,
      coalesce(p_reason,''), coalesce(p_ref,''), coalesce(p_occurred_at, now()), coalesce(p_by,'')
    );
    v_need := v_need - v_take;
  end loop;
end;
$$;
grant execute on function public.inventory_issue(text, text, text, int, text, text, timestamptz, text) to authenticated;

-- ── Điều chỉnh tồn một lot_line (kiểm kê) — đặt lại qty_remaining + ghi movement ─
create or replace function public.inventory_adjust(
  p_lot_line_id text,
  p_new_qty     int,
  p_reason      text,
  p_by          text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old   int;
  v_lot   text;
  v_item  text;
  v_color text;
  v_size  text;
  v_cost  numeric;
  v_delta int;
begin
  if not public.is_viettours_user() then raise exception 'forbidden'; end if;
  if p_new_qty is null or p_new_qty < 0 then raise exception 'Số tồn mới không hợp lệ'; end if;
  select ll.qty_remaining, l.id, l.item_id, l.color, ll.size, l.unit_cost
    into v_old, v_lot, v_item, v_color, v_size, v_cost
    from public.inventory_lot_lines ll
    join public.inventory_lots l on l.id = ll.lot_id
   where ll.id = p_lot_line_id;
  if v_lot is null then raise exception 'Không tìm thấy dòng lô %', p_lot_line_id; end if;

  update public.inventory_lot_lines set qty_remaining = p_new_qty where id = p_lot_line_id;
  v_delta := p_new_qty - v_old;
  insert into public.inventory_movements (
    id, item_id, lot_id, lot_line_id, color, size, type, qty, unit_cost, reason, occurred_at, created_by_name
  ) values (
    'mv_' || replace(gen_random_uuid()::text, '-', ''), v_item, v_lot, p_lot_line_id,
    v_color, v_size, 'adjust', abs(v_delta), v_cost,
    coalesce(p_reason,'') || ' (kiểm kê: ' || v_old || '→' || p_new_qty || ')', now(), coalesce(p_by,'')
  );
end;
$$;
grant execute on function public.inventory_adjust(text, int, text, text) to authenticated;
