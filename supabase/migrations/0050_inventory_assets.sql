-- Quản lý kho — Đợt 2: TÀI SẢN quản lý theo TỪNG CÁI (máy móc, thiết bị).
--  • Loại SP `kind='asset'` → inventory_items đóng vai "model/loại máy" (vd Máy chiếu Epson),
--    mỗi CÁI vật lý là một dòng inventory_assets với mã riêng + serial + tình trạng.
--  • inventory_asset_logs: nhật ký cấp phát / thu hồi / bảo trì / thanh lý (lý do + thời gian).
--  • Mã tài sản `{item.code}-{NNN}` (vd TB-001-007) sinh atomic qua asset_seq trên item.

alter table public.inventory_items add column if not exists asset_seq int not null default 0;

create table public.inventory_assets (
  id            text primary key,
  code          text unique not null,                  -- TB-001-007
  item_id       text not null references public.inventory_items(id) on delete cascade,
  name          text not null default '',              -- tên cụ thể (nếu khác model)
  serial        text not null default '',              -- số serial nhà SX
  purchase_cost numeric not null default 0,            -- nguyên giá
  purchased_at  date,
  status        text not null default 'available',     -- available|in_use|maintenance|retired|lost
  holder        text not null default '',              -- người đang giữ (khi in_use)
  location      text not null default '',              -- vị trí
  condition     text not null default '',              -- tình trạng: tốt|khá|hỏng…
  note          text not null default '',
  created_by_name text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  updated_by_name text
);
create index inventory_assets_item_idx on public.inventory_assets(item_id);
create index inventory_assets_status_idx on public.inventory_assets(status);

create table public.inventory_asset_logs (
  id            text primary key,
  asset_id      text not null references public.inventory_assets(id) on delete cascade,
  action        text not null,                         -- checkout|checkin|maintenance|retire|status
  from_status   text not null default '',
  to_status     text not null default '',
  holder        text not null default '',
  reason        text not null default '',
  ref           text not null default '',
  occurred_at   timestamptz not null default now(),
  created_by_name text not null default '',
  created_at    timestamptz not null default now()
);
create index inventory_asset_logs_asset_idx on public.inventory_asset_logs(asset_id);

do $$
declare t text;
begin
  foreach t in array array['inventory_assets','inventory_asset_logs'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I on public.%I for select using (public.is_viettours_user());', t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.is_viettours_user()) with check (public.is_viettours_user());', t||'_write', t);
    execute format('alter publication supabase_realtime add table public.%I;', t);
  end loop;
end $$;

-- ── Sinh mã tài sản ATOMIC: {item.code}-{NNN} ──────────────────────────────────
create or replace function public.inventory_next_asset_code(p_item_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_seq  int;
begin
  if not public.is_viettours_user() then raise exception 'forbidden'; end if;
  update public.inventory_items
     set asset_seq = asset_seq + 1
   where id = p_item_id
   returning code, asset_seq into v_code, v_seq;
  if v_code is null then raise exception 'Không tìm thấy model %', p_item_id; end if;
  return v_code || '-' || lpad(v_seq::text, 3, '0');
end;
$$;
grant execute on function public.inventory_next_asset_code(text) to authenticated;

-- ── Thao tác tài sản (cấp phát/thu hồi/bảo trì/thanh lý) — đổi trạng thái + ghi log ──
create or replace function public.inventory_asset_action(
  p_asset_id    text,
  p_action      text,
  p_to_status   text,
  p_holder      text,
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
    id, asset_id, action, from_status, to_status, holder, reason, ref, occurred_at, created_by_name
  ) values (
    'al_' || replace(gen_random_uuid()::text, '-', ''), p_asset_id, p_action, v_from, p_to_status,
    coalesce(p_holder, ''), coalesce(p_reason, ''), coalesce(p_ref, ''), coalesce(p_occurred_at, now()), coalesce(p_by, '')
  );
end;
$$;
grant execute on function public.inventory_asset_action(text, text, text, text, text, text, timestamptz, text) to authenticated;
