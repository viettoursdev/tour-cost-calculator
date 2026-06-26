-- Đào tạo — Đợt 3: cấp chứng nhận.
--  • next_cert_code(): sinh mã chứng nhận ATOMIC dạng VTC.YY.NNNN (advisory lock
--    theo năm → chống trùng STT giữa 2 người cấp cùng lúc). UNIQUE không bắt buộc
--    (mã chỉ để hiển thị/tra cứu) nhưng lock đảm bảo không trùng trong thực tế.

create or replace function public.next_cert_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year text := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YY');
  v_seq  int;
begin
  perform pg_advisory_xact_lock(hashtext('vtc_cert_' || v_year));
  select count(*) into v_seq
    from public.training_enrollments
   where cert_code like 'VTC.' || v_year || '.%';
  return 'VTC.' || v_year || '.' || lpad((v_seq + 1)::text, 4, '0');
end;
$$;

grant execute on function public.next_cert_code() to authenticated, anon;
