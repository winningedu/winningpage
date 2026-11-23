-- 본사 기관 현황의 마지막 활동을 순간으로 주고 계약, 시범 판정을 기관 time_zone 의 오늘로 한다(UTC 이전 D1, D3).
-- last_activity_on date 를 last_activity_at timestamptz 로 바꿔 옛 함수를 지우고 새로 만든다. 권한은 그대로 service_role 만 실행한다.
-- last_activity_at = 센 회원의 last_seen_at 과 profile_login_slots.slot_start 중 가장 늦은 순간.

drop function public.fn_hq_tenant_overview(boolean);

create function public.fn_hq_tenant_overview(p_include_internal boolean)
returns table (
  tenant_id uuid,
  name text,
  region text,
  org_type text,
  contract_start_date date,
  contract_end_date date,
  grace_end date,
  trial_start_date date,
  trial_end_date date,
  contract_status text,
  student_count integer,
  student_without_enrollment_count integer,
  teacher_count integer,
  last_activity_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with today as (
    select now() as ts
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
             p.last_seen_at,
             (select max(l.slot_start) from public.profile_login_slots l where l.profile_id = m.profile_id)
           )) as last_at
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
         t.trial_start_date,
         t.trial_end_date,
         case
           when ld.d between t.trial_start_date and t.trial_end_date
                and c.status not in ('active', 'ending_soon') then 'trial'
           else c.status
         end,
         coalesce((select count(*) from students s where s.tenant_id = t.id), 0)::integer,
         coalesce((select count(*) from students s where s.tenant_id = t.id and not s.has_enrollment), 0)::integer,
         coalesce((select count(*) from teachers th where th.tenant_id = t.id), 0)::integer,
         (select a.last_at from activity a where a.tenant_id = t.id)
    from public.tenants t
    cross join today
    cross join grace_days
    cross join lateral (select public.fn_local_date(today.ts, t.time_zone) as d) ld
    cross join lateral (
      select coalesce(t.grace_ends_on, t.contract_end_date + grace_days.days) as grace_end
    ) g
    cross join lateral (
      select case
               when t.contract_start_date is null and t.contract_end_date is null then 'none'
               when t.contract_start_date is not null and ld.d < t.contract_start_date then 'upcoming'
               when t.contract_end_date is null then 'active'
               when ld.d <= t.contract_end_date then
                 case when t.contract_end_date - ld.d <= 30 then 'ending_soon' else 'active' end
               when g.grace_end is not null and ld.d <= g.grace_end then 'grace'
               else 'expired'
             end as status
    ) c
   where not t.is_catch_all
   order by t.name, t.id
$$;

comment on function public.fn_hq_tenant_overview(boolean) is
  '본사 대시보드 기관 현황 한 기관 한 행. 계약 상태 trial(시범기간 중, 계약 기간 밖), none, upcoming, active, ending_soon(30일 이하), grace, expired. 학생 수는 fn_hq_tenant_students. 기타 소속 제외.';

revoke all on function public.fn_hq_tenant_overview(boolean) from public, anon, authenticated;
grant execute on function public.fn_hq_tenant_overview(boolean) to service_role;
