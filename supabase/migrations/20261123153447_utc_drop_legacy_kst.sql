-- 옛 KST 객체를 지운다(UTC 이전 정리). 스키마만 바꾼다.
--
-- 1. fn_purge_b2b_retention: profile_login_days 삭제 블록을 뺀다. 반환 열 login_days_deleted 는 profile_login_slots 에서 지운 행 수만이다.
--    시그니처, 반환 열, 권한, security definer, search_path 는 그대로다.
-- 2. profile_login_days 테이블을 지운다. 15분 칸 profile_login_slots 로 백필을 마쳤고 앱은 칸만 적는다.
-- 3. KST 고정 함수 fn_add_months_kst, fn_kst_day_start, fn_school_year_kst 를 지운다. 시간대 인자를 받는 fn_add_months, fn_day_start, fn_school_year 가 대신한다.

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

  return query select v_changes, v_enrollments, v_logs, v_memos, v_flags, v_counsel, v_login_days;
end;
$$;

revoke all on function public.fn_purge_b2b_retention() from public, anon, authenticated;
grant execute on function public.fn_purge_b2b_retention() to service_role;

drop table public.profile_login_days;

drop function public.fn_add_months_kst(timestamptz, integer);
drop function public.fn_kst_day_start(timestamptz);
drop function public.fn_school_year_kst(timestamptz);
