set local lock_timeout = '5s';

-- 선생님 계정은 학생 서비스를 쓰지 못한다(deny_reason teacher, 가장 먼저 본다). 이용 횟수도 세지 않는다.
-- 선생님은 profiles.member_type = 'teacher' 로 가르고, 삭제한 선생님도 member_type 이 남아 계속 막힌다.
-- 시그니처, security definer, search_path 와 나머지 본문은 20261106045002 와 같고 변수 하나와 case 의 첫 갈래만 늘었다.
-- 스키마와 함수만 있고 데이터 문장이 없다. 위닝 사이트는 이 함수를 부르지 않아 동작이 그대로다.
create or replace function public.fn_tenant_usage_state(p_profile uuid, p_program_key text)
returns table (
  allowed boolean,
  deny_reason text,
  month_used integer,
  month_limit integer,
  month_remaining integer,
  term_used integer,
  term_limit integer,
  term_remaining integer,
  month_resets_on date,
  term_resets_on date
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_tenant public.tenants;
  v_set public.tenant_service_settings;
  v_ovr public.student_usage_overrides;
  v_now timestamptz := now();
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_starts date;
  v_ends date;
  v_anchor date;
  v_anchor_ts timestamptz;
  v_k integer := 0;
  v_months integer;
  v_term_start timestamptz;
  v_term_end timestamptz;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  v_month_end timestamptz;
  v_mused integer;
  v_tused integer;
  v_mlimit integer;
  v_tlimit integer;
  v_reason text;
  v_grace_end date;
  v_is_teacher boolean;
begin
  v_month_end := public.fn_add_months_kst(v_month_start, 1);

  select t.* into v_tenant
    from public.profiles p join public.tenants t on t.id = p.tenant_id
   where p.id = p_profile;
  v_is_teacher := exists (select 1 from public.profiles p where p.id = p_profile and p.member_type = 'teacher');
  select s.* into v_set from public.tenant_service_settings s
   where s.tenant_id = v_tenant.id and s.program_key = p_program_key;
  select o.* into v_ovr from public.student_usage_overrides o
   where o.profile_id = p_profile and o.program_key = p_program_key;

  v_mlimit := coalesce(v_ovr.monthly_limit, v_set.monthly_limit);
  v_tlimit := coalesce(v_ovr.term_limit, v_set.term_limit);
  v_starts := coalesce(v_set.starts_on, v_tenant.contract_start_date);
  v_ends := coalesce(v_set.ends_on, v_tenant.contract_end_date);

  -- 유예 종료일: 계약이 끝났을 때만 의미가 있다.
  if v_tenant.contract_end_date is not null and v_today > v_tenant.contract_end_date then
    v_grace_end := coalesce(
      v_tenant.grace_ends_on,
      v_tenant.contract_end_date + (
        select case when jsonb_typeof(a.value) = 'number' then (a.value #>> '{}')::integer end
          from public.app_settings a where a.key = 'contract_grace_days')
    );
  end if;

  -- 학기 구간
  v_anchor := v_starts;
  if v_anchor is not null then
    v_anchor_ts := v_anchor::timestamp at time zone 'Asia/Seoul';
    if v_tenant.term_months is not null and v_today > v_anchor then
      v_months := (extract(year from v_today)::integer - extract(year from v_anchor)::integer) * 12
                + extract(month from v_today)::integer - extract(month from v_anchor)::integer;
      v_k := greatest(0, v_months / v_tenant.term_months - 1);
      while public.fn_add_months_kst(v_anchor_ts, (v_k + 1) * v_tenant.term_months) <= v_now loop
        v_k := v_k + 1;
      end loop;
      v_term_start := public.fn_add_months_kst(v_anchor_ts, v_k * v_tenant.term_months);
      v_term_end := public.fn_add_months_kst(v_anchor_ts, (v_k + 1) * v_tenant.term_months);
    else
      v_term_start := v_anchor_ts;
    end if;
  end if;

  select count(*) filter (where e.used_at >= v_month_start and e.used_at < v_month_end),
         count(*) filter (where (v_term_start is null or e.used_at >= v_term_start)
                            and (v_term_end is null or e.used_at < v_term_end))
    into v_mused, v_tused
    from public.tenant_usage_events e
   where e.profile_id = p_profile and e.program_key = p_program_key;

  v_reason := case
    when v_is_teacher then 'teacher'
    when v_tenant.is_catch_all then 'catch_all'
    when v_tenant.id is null or v_set.tenant_id is null or not v_set.enabled then 'disabled'
    when v_starts is not null and v_today < v_starts then 'outside_period'
    when v_ends is not null and v_today > v_ends
      then case when v_grace_end is not null and v_today <= v_grace_end then 'grace' else 'outside_period' end
    when v_tlimit is not null and v_tused >= v_tlimit then 'term_cap'
    when v_mlimit is not null and v_mused >= v_mlimit then 'month_cap'
  end;

  return query select
    v_reason is null, v_reason,
    v_mused, v_mlimit, case when v_mlimit is null then null else greatest(v_mlimit - v_mused, 0) end,
    v_tused, v_tlimit, case when v_tlimit is null then null else greatest(v_tlimit - v_tused, 0) end,
    (v_month_end at time zone 'Asia/Seoul')::date,
    case when v_term_end is null then null else (v_term_end at time zone 'Asia/Seoul')::date end;
end;
$$;

comment on function public.fn_tenant_usage_state(uuid, text) is '학생의 한 서비스 사용 상태. deny_reason: teacher(선생님 계정), catch_all(기타 소속), disabled, outside_period, grace, term_cap, month_cap. 허용이면 null.';
