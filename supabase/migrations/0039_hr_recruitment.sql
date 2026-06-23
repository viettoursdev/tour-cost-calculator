-- Module Nhân sự — Đợt 4: tuyển dụng (ATS).
--  • hr_job_postings: tin tuyển dụng (job requisition) theo phòng ban.
--  • hr_candidates: hồ sơ ứng viên, stage = pipeline Kanban; interview_notes jsonb.
--    "Nhận việc" ở client tạo hr_employees + ghi converted_employee_id để truy vết.
-- App id ở legacy_id; candidate.posting_legacy_id tham chiếu mềm (không FK cứng).

create table public.hr_job_postings (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  title         text not null default '',
  department    text not null default '',
  level         text not null default '',
  headcount     int  not null default 1,
  salary_range  text not null default '',
  status        text not null default 'open',         -- open|onhold|closed
  description   text not null default '',
  created_by_username text not null default '',
  created_by_name     text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  updated_by_name text
);

create table public.hr_candidates (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  posting_legacy_id text,
  full_name     text not null default '',
  phone         text not null default '',
  email         text not null default '',
  source        text not null default '',
  position      text not null default '',
  department    text not null default '',
  cv_url        text,
  stage         text not null default 'new',          -- new|screening|interview1|interview2|offer|hired|rejected
  rating        numeric,
  applied_date  date,
  notes         text not null default '',
  interview_notes jsonb not null default '[]'::jsonb,  -- CandidateNote[]
  converted_employee_id text,                          -- legacy_id NV sau khi nhận việc
  created_by_username text not null default '',
  created_by_name     text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  updated_by_name text
);

create index hr_candidates_posting_idx on public.hr_candidates(posting_legacy_id);
create index hr_candidates_stage_idx   on public.hr_candidates(stage);

do $$
declare t text;
begin
  foreach t in array array['hr_job_postings','hr_candidates'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I on public.%I for select using (public.is_viettours_user());', t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.is_viettours_user()) with check (public.is_viettours_user());', t||'_write', t);
    execute format('alter publication supabase_realtime add table public.%I;', t);
  end loop;
end $$;
