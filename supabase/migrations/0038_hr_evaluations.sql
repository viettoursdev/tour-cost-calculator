-- Module Nhân sự — Đợt 3: đánh giá / KPI / lộ trình thăng tiến.
--  • hr_evaluations: một kỳ đánh giá cho 1 nhân viên (employee_legacy_id), gồm
--    competencies (khung năng lực) + kpis dạng jsonb, điểm tổng, điểm mạnh/cải thiện,
--    mục tiêu kỳ tới + đề xuất thăng tiến. status draft|finalized.
-- App id ở legacy_id như các bảng hr_* khác.

create table public.hr_evaluations (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  employee_legacy_id text not null default '',
  period        text not null default '',            -- "2026-Q2" | "2026"
  review_date   date,
  reviewer_name text not null default '',
  competencies  jsonb not null default '[]'::jsonb,   -- EvalCompetency[]
  kpis          jsonb not null default '[]'::jsonb,   -- EvalKpi[]
  overall_score numeric,
  strengths     text not null default '',
  improvements  text not null default '',
  next_goals    text not null default '',
  promotion     text not null default '',
  status        text not null default 'draft',        -- draft|finalized
  created_by_username text not null default '',
  created_by_name     text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  updated_by_name text
);

create index hr_evaluations_emp_idx on public.hr_evaluations(employee_legacy_id);

do $$
declare t text;
begin
  foreach t in array array['hr_evaluations'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I on public.%I for select using (public.is_viettours_user());', t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.is_viettours_user()) with check (public.is_viettours_user());', t||'_write', t);
    execute format('alter publication supabase_realtime add table public.%I;', t);
  end loop;
end $$;
