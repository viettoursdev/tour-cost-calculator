-- VisaProcDoc/VisaProjectDoc carry both createdByUsername (ownership key) and
-- createdByName (display). Add a column to persist the username distinctly.
alter table public.visa_procedures add column if not exists created_by_username text;
alter table public.visa_projects   add column if not exists created_by_username text;
