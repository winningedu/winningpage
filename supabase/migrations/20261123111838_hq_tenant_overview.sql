-- 본사 대시보드 기관 현황(분석 grill Q5, Q9, 계획 4번 A1 A2 A3 A4). 스키마만 바꾼다(함수 2개).
--
-- 1. fn_hq_tenant_students: 기관별로 셀 학생(Q9). 두 사이트 공통 규칙이다.
--    (그 기관의 올해 학년도 활성 학적) 또는 (학적이 하나도 없고 profiles.tenant_id 가 그 기관이며 이름이 '삭제된 학생'이 아닌 학생).
--    profiles.tenant_id 는 졸업과 계약 종료 삭제 때 지워지지 않아 혼자 쓰면 과대 집계된다.
--    학적이 없는 학생(위닝 옛 학생)은 has_enrollment = false 로 돌려주고 화면은 "학년, 반 미상"으로 따로 보인다.
--    기본 제외는 fn_hq_stat_included(Q3). 목표 실행률 평균은 서버가 이 목록으로 goalRate.ts 계산을 그대로 쓴다.
-- 2. fn_hq_tenant_overview: 기관 한 행에 기본 정보, 계약 상태, 학생 수, 선생님 수, 마지막 활동일.
--    기타 소속(is_catch_all)은 대행 기관 목록(console/proxy/tenants.ts)처럼 뺀다.
--    계약 상태: none(계약일 없음), upcoming(시작 전), active, ending_soon(종료일까지 30일 이하), grace(유예 중), expired.
--    유예 종료일 = coalesce(grace_ends_on, contract_end_date + app_settings.contract_grace_days). 같은 식이 fn_tenant_usage_state 등
--    5곳에 따로 있고 공통 함수는 없다. 기본 일수가 없고 grace_ends_on 도 없으면 종료 다음 날부터 expired(fn_tenant_usage_state 와 같다).
--    선생님 수: 삭제되지 않은 활성(status active) 선생님. 계정이 없는 선생님도 센다.
--    마지막 활동일: 센 학생과 선생님의 last_seen_at(KST 날짜)과 profile_login_days 중 가장 늦은 날. 없으면 null.
--    나중에 시범기간, 사용량과 한도 열을 이 함수 반환 열에 더한다(반환 타입이 바뀌면 drop + create).
-- 둘 다 security definer, service_role 만 실행한다.

create function public.fn_hq_tenant_students(p_include_internal boolean)
returns table (tenant_id uuid, profile_id uuid, has_enrollment boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.tenant_id, e.student_id, true
    from public.student_enrollments e
    join public.tenants t on t.id = e.tenant_id and t.school_year = e.school_year
   where e.status = 'active'
     and public.fn_hq_stat_included(e.student_id, p_include_internal)
  union all
  select p.tenant_id, p.id, false
    from public.profiles p
   where p.tenant_id is not null
     and p.member_type = 'student'
     and p.name is distinct from '삭제된 학생'
     and not exists (select 1 from public.student_enrollments e where e.student_id = p.id)
     and public.fn_hq_stat_included(p.id, p_include_internal)
$$;

comment on function public.fn_hq_tenant_students(boolean) is
  '본사 통계의 기관별 학생(Q9). 올해 활성 학적, 또는 학적이 없고 tenant_id 가 그 기관이며 삭제된 학생이 아닌 학생. has_enrollment false 는 학년, 반 미상.';

revoke all on function public.fn_hq_tenant_students(boolean) from public, anon, authenticated;
grant execute on function public.fn_hq_tenant_students(boolean) to service_role;

create function public.fn_hq_tenant_overview(p_include_internal boolean)
returns table (
  tenant_id uuid,
  name text,
  region text,
  org_type text,
  contract_start_date date,
  contract_end_date date,
  grace_end date,
  contract_status text,
  student_count integer,
  student_without_enrollment_count integer,
  teacher_count integer,
  last_activity_on date
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with today as (
    select (now() at time zone 'Asia/Seoul')::date as d
  ),
  grace_days as (
    select (select case when jsonb_typeof(a.value) = 'number' then (a.value #>> '{}')::integer end
              from public.app_settings a where a.key = 'contract_grace_days') as days
  ),
  students as (
    select * from public.fn_hq_tenant_students(p_include_internal)
  ),
  teachers as (
    select th.tenant_id, th.profile_id
      from public.teachers th
     where th.deleted_at is null
       and th.status = 'active'
       and (th.profile_id is null or public.fn_hq_stat_included(th.profile_id, p_include_internal))
  ),
  members as (
    select s.tenant_id, s.profile_id from students s
    union
    select th.tenant_id, th.profile_id from teachers th where th.profile_id is not null
  ),
  activity as (
    select m.tenant_id,
           max(greatest(
             (p.last_seen_at at time zone 'Asia/Seoul')::date,
             (select max(l.kst_date) from public.profile_login_days l where l.profile_id = m.profile_id)
           )) as last_on
      from members m
      join public.profiles p on p.id = m.profile_id
     group by m.tenant_id
  )
  select t.id,
         t.name,
         t.region,
         t.org_type,
         t.contract_start_date,
         t.contract_end_date,
         g.grace_end,
         case
           when t.contract_start_date is null and t.contract_end_date is null then 'none'
           when t.contract_start_date is not null and today.d < t.contract_start_date then 'upcoming'
           when t.contract_end_date is null then 'active'
           when today.d <= t.contract_end_date then
             case when t.contract_end_date - today.d <= 30 then 'ending_soon' else 'active' end
           when g.grace_end is not null and today.d <= g.grace_end then 'grace'
           else 'expired'
         end,
         coalesce((select count(*) from students s where s.tenant_id = t.id), 0)::integer,
         coalesce((select count(*) from students s where s.tenant_id = t.id and not s.has_enrollment), 0)::integer,
         coalesce((select count(*) from teachers th where th.tenant_id = t.id), 0)::integer,
         (select a.last_on from activity a where a.tenant_id = t.id)
    from public.tenants t
    cross join today
    cross join grace_days
    cross join lateral (
      select coalesce(t.grace_ends_on, t.contract_end_date + grace_days.days) as grace_end
    ) g
   where not t.is_catch_all
   order by t.name, t.id
$$;

comment on function public.fn_hq_tenant_overview(boolean) is
  '본사 대시보드 기관 현황 한 기관 한 행. 계약 상태 none, upcoming, active, ending_soon(30일 이하), grace, expired. 학생 수는 fn_hq_tenant_students. 기타 소속 제외.';

revoke all on function public.fn_hq_tenant_overview(boolean) from public, anon, authenticated;
grant execute on function public.fn_hq_tenant_overview(boolean) to service_role;
