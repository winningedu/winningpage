-- 보관 기간 정리와 계약 종료 회원 익명화를 시간대 기준으로 바꾼다(UTC 이전). 스키마만 바꾼다.
--
-- 1. fn_purge_b2b_retention: 로그인 기록 profile_login_slots 를 slot_start < now() - 2년 으로 지운다(순간 기준, 시간대 없음).
--    옛 profile_login_days 는 KST 날짜 열이라 그대로 KST 날짜로 지운다(더는 적지 않고 U6 에서 테이블째 지운다).
--    반환 열 login_days_deleted 는 두 테이블에서 지운 행의 합이다. 반환 열과 권한은 그대로다.
-- 2. fn_anonymize_expired_b2b_members: 오늘을 기관별 tenants.time_zone 날짜로 센다(fn_local_date). 계약 종료일, 유예 종료일은 date 그대로다.
-- 3. fn_member_purge_preview: 끝에 local_today(기관 시간대의 오늘)를 더한다. 화면의 D-day 가 실행 함수와 같은 오늘을 쓰게 한다.
--    반환 열이 바뀌어 옛 함수를 지우고 새로 만든다. 권한은 그대로 service_role 만 실행한다.

create or replace function public.fn_purge_b2b_retention()
returns table (
  enrollment_changes_deleted bigint,
  enrollments_deleted bigint,
  access_logs_deleted bigint,
  memos_deleted bigint,
  student_flags_deleted bigint,
  counsel_statuses_deleted bigint,
  login_days_deleted bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenants uuid[];
  v_students uuid[];
  v_changes bigint;
  v_enrollments bigint;
  v_logs bigint;
  v_memos bigint;
  v_flags bigint;
  v_counsel bigint;
  v_login_days bigint;
  v_old_days bigint;
begin
  delete from public.teacher_memos m
   using (
     select e.tenant_id, e.student_id
       from public.student_enrollments e
      where e.status = 'graduated'
      group by e.tenant_id, e.student_id
     having max(e.graduated_at) < now() - interval '1 year'
        and not exists (
          select 1 from public.student_enrollments a
           where a.tenant_id = e.tenant_id and a.student_id = e.student_id and a.status = 'active'
        )
   ) g
   where m.tenant_id = g.tenant_id and m.student_id = g.student_id;
  get diagnostics v_memos = row_count;

  select coalesce(array_agg(g.tenant_id), '{}'), coalesce(array_agg(g.student_id), '{}')
    into v_tenants, v_students
    from (
      select e.tenant_id, e.student_id
        from public.student_enrollments e
       where e.status = 'graduated'
       group by e.tenant_id, e.student_id
      having max(e.graduated_at) < now() - interval '2 years'
         and not exists (
           select 1 from public.student_enrollments a
            where a.tenant_id = e.tenant_id and a.student_id = e.student_id and a.status = 'active'
         )
    ) g;

  delete from public.student_flags f
   where (f.tenant_id, f.student_id) in (select * from unnest(v_tenants, v_students));
  get diagnostics v_flags = row_count;

  delete from public.counsel_statuses c
   where (c.tenant_id, c.student_id) in (select * from unnest(v_tenants, v_students));
  get diagnostics v_counsel = row_count;

  delete from public.enrollment_changes c
   where (c.tenant_id, c.student_id) in (select * from unnest(v_tenants, v_students));
  get diagnostics v_changes = row_count;

  delete from public.student_enrollments e
   where (e.tenant_id, e.student_id) in (select * from unnest(v_tenants, v_students));
  get diagnostics v_enrollments = row_count;

  delete from public.admin_access_logs l
   where l.actor_kind is not null
     and ((l.action = 'member_purge' and l.created_at < now() - interval '1 year')
       or (l.action <> 'member_purge' and l.created_at < now() - interval '2 years'));
  get diagnostics v_logs = row_count;

  -- 로그인 기록은 순간(slot_start) 기준이라 시간대가 없다.
  delete from public.profile_login_slots s
   where s.slot_start < now() - interval '2 years';
  get diagnostics v_login_days = row_count;

  -- 옛 profile_login_days 는 더는 적지 않는다(U6 에서 지운다). KST 날짜 열이라 KST 날짜로 자른다.
  delete from public.profile_login_days d
   where d.kst_date < ((now() at time zone 'Asia/Seoul')::date - interval '2 years')::date; -- tz-literal-ok: 옛 KST 날짜 열, U6 에서 테이블째 지운다
  get diagnostics v_old_days = row_count;
  v_login_days := v_login_days + v_old_days;

  return query select v_changes, v_enrollments, v_logs, v_memos, v_flags, v_counsel, v_login_days;
end;
$$;

revoke all on function public.fn_purge_b2b_retention() from public, anon, authenticated;
grant execute on function public.fn_purge_b2b_retention() to service_role;
