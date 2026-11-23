-- 본사 대시보드 서비스 사용량과 한도(분석 grill Q6, 계획 6번 A5). 스키마만 바꾼다(함수 1개).
--
-- fn_hq_tenant_usage: 기관 한 곳, 서비스 하나에 한 행. 서비스는 학습진단, 성장설계, 수행평가, 심화탐구, 자기평가 5개(목표관리 target 제외).
--   한도는 학생 단위라(학생별 조정 student_usage_overrides) 기관 전체 % 로 바꾸지 않고
--   "쓴 횟수 + 한도 다 쓴 학생 수"를 이번 달과 이번 학기로 따로 준다(Q6).
--   학생은 fn_hq_tenant_students(Q9 학생 수 규칙, 기본 제외 Q3)이고, 학생마다 fn_tenant_usage_state 를 그대로 불러
--   달과 학기 구간, 한도(조정 우선), 사용 횟수를 학생이 실제로 받는 판정과 같게 센다. 학기 계산을 다시 쓰지 않는다.
--   쓴 횟수 = 센 학생들의 이번 달(학기) 사용 합. 졸업하거나 나간 학생의 사용은 들어가지 않는다.
--   한도 다 쓴 학생 = 그 한도가 있고 사용 횟수가 한도 이상인 학생.
--   provided, month_limit, term_limit 은 기관 설정(tenant_service_settings) 원값이다. 행이 없거나 꺼져 있으면 provided false.
--   term_resets_on 은 이번 학기가 끝나는 날(다음 학기 첫날). 학기 개월 수가 없으면 null.
--   기타 소속(is_catch_all)은 뺀다. 학생이 없는 기관도 5행(0)이다.
-- fn_hq_tenant_overview 는 바꾸지 않는다. 화면이 tenant_id 로 합친다.
-- security definer, service_role 만 실행한다.

create function public.fn_hq_tenant_usage(p_include_internal boolean)
returns table (
  tenant_id uuid,
  program_key text,
  provided boolean,
  month_limit integer,
  term_limit integer,
  month_used integer,
  month_capped_students integer,
  term_used integer,
  term_capped_students integer,
  term_resets_on date
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with programs (program_key, ord) as (
    values ('diagnose', 1), ('growth', 2), ('suhaeng', 3), ('inquiry', 4), ('selfeval', 5)
  ),
  usage as (
    select s.tenant_id,
           pr.program_key,
           sum(u.month_used) as month_used,
           count(*) filter (where u.month_limit is not null and u.month_used >= u.month_limit) as month_capped,
           sum(u.term_used) as term_used,
           count(*) filter (where u.term_limit is not null and u.term_used >= u.term_limit) as term_capped,
           max(u.term_resets_on) as term_resets_on
      from public.fn_hq_tenant_students(p_include_internal) s
      cross join programs pr
      cross join lateral public.fn_tenant_usage_state(s.profile_id, pr.program_key) u
     group by s.tenant_id, pr.program_key
  )
  select t.id,
         pr.program_key,
         coalesce(ss.enabled, false),
         ss.monthly_limit::integer,
         ss.term_limit::integer,
         coalesce(u.month_used, 0)::integer,
         coalesce(u.month_capped, 0)::integer,
         coalesce(u.term_used, 0)::integer,
         coalesce(u.term_capped, 0)::integer,
         u.term_resets_on
    from public.tenants t
    cross join programs pr
    left join public.tenant_service_settings ss on ss.tenant_id = t.id and ss.program_key = pr.program_key
    left join usage u on u.tenant_id = t.id and u.program_key = pr.program_key
   where not t.is_catch_all
   order by t.name, t.id, pr.ord
$$;

comment on function public.fn_hq_tenant_usage(boolean) is
  '본사 대시보드 기관별 서비스 사용량(Q6). 기관 x 5개 서비스(목표관리 제외) 한 행: 이번 달, 이번 학기 쓴 횟수와 한도 다 쓴 학생 수. 학생은 fn_hq_tenant_students, 판정은 학생별 fn_tenant_usage_state.';

revoke all on function public.fn_hq_tenant_usage(boolean) from public, anon, authenticated;
grant execute on function public.fn_hq_tenant_usage(boolean) to service_role;
