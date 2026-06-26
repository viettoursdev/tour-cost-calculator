-- ════════════════════════════════════════════════════════════════════════
--  0056 — Nâng cấp "Hồ sơ tour":
--   • category       : phân loại 5 loại (incentive nội địa/nước ngoài/visa/event/khác)
--   • event_staff     : Nhân sự event (vai trò chia sẻ thứ 3, cạnh collaborators/followers)
--   • delete_request  : yêu cầu duyệt xoá đang chờ (người dưới Trưởng Phòng)
--   • next_tour_code  : mở rộng prefix cho VS (visa) / EV (event) / DV (dịch vụ khác)
--  CỘNG THÊM — không destructive, không đụng dữ liệu cũ. Backfill category từ kind.
-- ════════════════════════════════════════════════════════════════════════

alter table public.tour_profiles add column if not exists category text;
alter table public.tour_profiles add column if not exists event_staff jsonb not null default '[]'::jsonb;
alter table public.tour_profiles add column if not exists delete_request jsonb;

-- Backfill: hồ sơ cũ → loại incentive theo kind (NĐ/NN). Chỉ ghi dòng còn trống.
update public.tour_profiles
   set category = case when kind = 'intl' then 'incentive_intl' else 'incentive_domestic' end
 where category is null;

-- ── Mở rộng RPC sinh mã: nhận kind CŨ (domestic/intl) HOẶC category MỚI ──
-- Tương thích ngược: 'domestic'/'intl' vẫn ra NĐ/NN.
create or replace function public.next_tour_code(p_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text := case p_kind
                     when 'intl'              then 'NN'
                     when 'incentive_intl'    then 'NN'
                     when 'visa'              then 'VS'
                     when 'event'             then 'EV'
                     when 'other'             then 'DV'
                     else 'NĐ'   -- domestic / incentive_domestic / fallback
                   end;
  v_date   text := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD.MM.YY');
  v_seq    int;
begin
  perform pg_advisory_xact_lock(hashtext(v_prefix || v_date));
  -- Mã dạng `PREFIX.DD.MM.YY.NN` — ngày ở GIỮA, STT ở cuối.
  select count(*) into v_seq
    from public.tour_profiles
   where code like v_prefix || '.' || v_date || '.%';
  return v_prefix || '.' || v_date || '.' || lpad((v_seq + 1)::text, 2, '0');
end;
$$;

grant execute on function public.next_tour_code(text) to authenticated, anon;
