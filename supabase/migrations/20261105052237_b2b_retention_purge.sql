-- B2B 기반 12: 보관 기간 정리 함수. 스키마만 바꾼다(새 함수 1개, service_role 전용). 테이블과 기존 함수는 건드리지 않는다.
-- 크론 라우트(/api/cron/b2b-retention-purge)가 하루 한 번 부른다. 지운 행 수를 돌려준다.
--
-- 졸업 2년: 졸업한 지 2년이 지난 학생(졸업 학적의 graduated_at 기준)의 학적 변경 이력(enrollment_changes)과
-- 학적(student_enrollments, 모든 학년도)을 지운다. 지금 재학 중인 학적이 있는 학생은 건드리지 않는다.
-- 접근 로그: 2년이 지난 행을 지우되 member_purge 행은 1년이 지나면 지운다.
-- 선생님 메모(teacher_memos)는 아직 없는 테이블이라 여기서 다루지 않는다. 메모를 만드는 마이그레이션이 이 함수에 더한다.
create function public.fn_purge_b2b_retention()
returns table (
  enrollment_changes_deleted bigint,
  enrollments_deleted bigint,
  access_logs_deleted bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_students uuid[];
  v_changes bigint;
  v_enrollments bigint;
  v_logs bigint;
begin
  select coalesce(array_agg(distinct e.student_id), '{}')
    into v_students
    from public.student_enrollments e
   where e.status = 'graduated'
     and e.graduated_at < now() - interval '2 years'
     and not exists (
       select 1 from public.student_enrollments a
        where a.student_id = e.student_id and a.status = 'active'
     );

  delete from public.enrollment_changes c where c.student_id = any (v_students);
  get diagnostics v_changes = row_count;

  delete from public.student_enrollments e where e.student_id = any (v_students);
  get diagnostics v_enrollments = row_count;

  delete from public.admin_access_logs l
   where (l.action = 'member_purge' and l.created_at < now() - interval '1 year')
      or (l.action <> 'member_purge' and l.created_at < now() - interval '2 years');
  get diagnostics v_logs = row_count;

  return query select v_changes, v_enrollments, v_logs;
end;
$$;

revoke all on function public.fn_purge_b2b_retention() from public, anon, authenticated;
grant execute on function public.fn_purge_b2b_retention() to service_role;
