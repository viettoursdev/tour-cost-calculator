-- Hồ sơ tour (Tour Profile) — aggregate root MỎNG làm trung tâm liên kết.
--  • tour_profiles: 1 hồ sơ : NHIỀU báo giá. Sở hữu DANH TÍNH (code), chủ sở hữu +
--    collaborators (sửa) + followers (xem + thông báo), con trỏ primary_quote_id.
--    KHÔNG lưu giai đoạn/tổng — những thứ đó vẫn suy ra từ báo giá/HĐ liên kết.
--  • quotes.tour_profile_id / tour_code: gắn báo giá vào hồ sơ (cộng thêm, KHÔNG bỏ
--    linked_quote_id cũ → đọc kép, tương thích ngược).
--  • next_tour_code(): sinh mã ATOMIC (advisory lock theo ngày) → chống trùng STT.
--  • Backfill: mỗi báo giá cũ chưa có hồ sơ → tạo một hồ sơ (idempotent).

create table public.tour_profiles (
  id              text primary key,
  code            text unique not null,
  kind            text not null default 'domestic',     -- domestic(NĐ) | intl(NN)
  name            text not null default '',
  customer_id     uuid references public.customers(id) on delete set null,
  customer_name   text,
  dest            text,
  start_date      date,
  pax             int not null default 0,
  primary_quote_id text,                                 -- cloudId báo giá chính
  status          text not null default 'open',          -- open | archived
  note            text not null default '',
  collaborators   jsonb not null default '[]'::jsonb,    -- Collaborator[] (sửa)
  followers       jsonb not null default '[]'::jsonb,    -- Collaborator[] (theo dõi)
  created_by_username text not null default '',
  created_by_name     text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  updated_by_name text
);

create index tour_profiles_customer_idx on public.tour_profiles(customer_id);
create index tour_profiles_creator_idx  on public.tour_profiles(created_by_username);
create index tour_profiles_primary_idx  on public.tour_profiles(primary_quote_id);

alter table public.tour_profiles enable row level security;
create policy tour_profiles_read  on public.tour_profiles for select using (public.is_viettours_user());
create policy tour_profiles_write on public.tour_profiles for all using (public.is_viettours_user()) with check (public.is_viettours_user());
alter publication supabase_realtime add table public.tour_profiles;

-- Gắn báo giá vào hồ sơ (cộng thêm — KHÔNG đụng linked_quote_id cũ).
alter table public.quotes add column if not exists tour_profile_id text;
alter table public.quotes add column if not exists tour_code text;
create index if not exists quotes_tour_profile_idx on public.quotes(tour_profile_id);

-- ── Sinh mã hồ sơ tour ATOMIC: NĐ.DD.MM.YY.NN / NN.DD.MM.YY.NN ──
-- Khoá advisory theo (prefix + ngày) trong transaction để 2 người tạo cùng ngày
-- không bao giờ trùng STT. UNIQUE(code) là chốt chặn cuối.
create or replace function public.next_tour_code(p_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text := case when p_kind = 'intl' then 'NN' else 'NĐ' end;
  v_date   text := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD.MM.YY');
  v_seq    int;
begin
  perform pg_advisory_xact_lock(hashtext(v_prefix || v_date));
  -- Mã dạng `NĐ.DD.MM.YY.NN` — ngày ở GIỮA, STT ở cuối.
  select count(*) into v_seq
    from public.tour_profiles
   where code like v_prefix || '.' || v_date || '.%';
  return v_prefix || '.' || v_date || '.' || lpad((v_seq + 1)::text, 2, '0');
end;
$$;

grant execute on function public.next_tour_code(text) to authenticated, anon;

-- ── Backfill: mỗi báo giá chưa có hồ sơ → tạo một hồ sơ tour (idempotent) ──
-- Mã suy từ ngày tạo báo giá gốc; nếu trùng thì +STT. primary_quote_id = chính nó.
do $$
declare
  r record;
  v_prefix text;
  v_date   text;
  v_seq    int;
  v_code   text;
  v_pid    text;
begin
  for r in
    select cloud_id, name, template, pax, customer_id, customer_name,
           depart_date, status, created_by_name, created_at,
           coalesce(legacy_num_id, 0) as num_id
      from public.quotes
     where tour_profile_id is null
       and coalesce(template, '') not in ('dmc')   -- DMC link chéo, không tự là tour
     order by created_at asc
  loop
    v_prefix := case when r.template = 'intl' then 'NN' else 'NĐ' end;
    v_date   := to_char(coalesce(r.created_at, now()) at time zone 'Asia/Ho_Chi_Minh', 'DD.MM.YY');
    select count(*) into v_seq
      from public.tour_profiles
     where code like v_prefix || '.' || v_date || '.%';
    v_code := v_prefix || '.' || v_date || '.' || lpad((v_seq + 1)::text, 2, '0');
    v_pid  := 'tp_' || r.cloud_id;

    insert into public.tour_profiles (
      id, code, kind, name, customer_id, customer_name, dest, start_date, pax,
      primary_quote_id, status, created_by_name, created_at
    ) values (
      v_pid, v_code,
      case when r.template = 'intl' then 'intl' else 'domestic' end,
      coalesce(r.name, ''), r.customer_id, r.customer_name, null, r.depart_date,
      coalesce(r.pax, 0), r.cloud_id, 'open', coalesce(r.created_by_name, ''),
      coalesce(r.created_at, now())
    )
    on conflict (id) do nothing;

    update public.quotes
       set tour_profile_id = v_pid, tour_code = v_code
     where cloud_id = r.cloud_id;
  end loop;
end $$;
