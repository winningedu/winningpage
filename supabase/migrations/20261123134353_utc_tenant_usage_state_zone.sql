-- UTC 전환 U4a-tenant: fn_tenant_usage_state 의 기간, 유예, 월과 학기 한도 초기화를 기관 시간대(tenants.time_zone)로 판정한다.
-- 시그니처가 같아 권한(service_role 전용)은 그대로다.

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
  v_tz text;
  v_today date;
  v_starts date;
  v_ends date;
  v_anchor date;
  v_anchor_ts timestamptz;
  v_k integer := 0;
  v_months integer;
  v_term_start timestamptz;
  v_term_end timestamptz;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_mused integer;
  v_tused integer;
  v_mlimit integer;
  v_tlimit integer;
  v_reason text;
  v_grace_end date;
  v_is_teacher boolean;
  v_in_trial boolean;
begin
  select t.* into v_tenant
    from public.profiles p join public.tenants t on t.id = p.tenant_id
   where p.id = p_profile;
  -- 기관 시간대로 오늘과 월 경계를 정한다(결정 D1). 소속 기관이 없으면 시간대도 없다(disabled 로 막힌다).
  v_tz := v_tenant.time_zone;
  v_today := public.fn_local_date(v_now, v_tz);
  v_month_start := public.fn_day_start(date_trunc('month', v_today)::date, v_tz);
  v_month_end := public.fn_add_months(v_month_start, 1, v_tz);
  v_is_teacher := exists (select 1 from public.teachers th where th.profile_id = p_profile);
  select s.* into v_set from public.tenant_service_settings s
   where s.tenant_id = v_tenant.id and s.program_key = p_program_key;
  select o.* into v_ovr from public.student_usage_overrides o
   where o.profile_id = p_profile and o.program_key = p_program_key;

  v_mlimit := coalesce(v_ovr.monthly_limit, v_set.monthly_limit);
  v_tlimit := coalesce(v_ovr.term_limit, v_set.term_limit);
  -- 시범기간(결정 117): 계약일이 둘 다 없는 기관은 시범기간을 기관 기간으로 쓴다(종료일이 지나면 자동으로 끝난다).
  -- 계약일이 하나라도 있으면 기간은 예전 그대로이고, 시범기간 안에서만 아래 기간 판정을 건너뛴다.
  v_in_trial := v_tenant.trial_start_date is not null
    and v_today between v_tenant.trial_start_date and v_tenant.trial_end_date;
  if v_tenant.contract_start_date is null and v_tenant.contract_end_date is null then
    v_starts := coalesce(v_set.starts_on, v_tenant.trial_start_date);
    v_ends := coalesce(v_set.ends_on, v_tenant.trial_end_date);
  else
    v_starts := coalesce(v_set.starts_on, v_tenant.contract_start_date);
    v_ends := coalesce(v_set.ends_on, v_tenant.contract_end_date);
  end if;

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
    v_anchor_ts := public.fn_day_start(v_anchor, v_tz);
    if v_tenant.term_months is not null and v_today > v_anchor then
      v_months := (extract(year from v_today)::integer - extract(year from v_anchor)::integer) * 12
                + extract(month from v_today)::integer - extract(month from v_anchor)::integer;
      v_k := greatest(0, v_months / v_tenant.term_months - 1);
      while public.fn_add_months(v_anchor_ts, (v_k + 1) * v_tenant.term_months, v_tz) <= v_now loop
        v_k := v_k + 1;
      end loop;
      v_term_start := public.fn_add_months(v_anchor_ts, v_k * v_tenant.term_months, v_tz);
      v_term_end := public.fn_add_months(v_anchor_ts, (v_k + 1) * v_tenant.term_months, v_tz);
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
    when not v_in_trial and v_starts is not null and v_today < v_starts then 'outside_period'
    when not v_in_trial and v_ends is not null and v_today > v_ends
      then case when v_grace_end is not null and v_today <= v_grace_end then 'grace' else 'outside_period' end
    when v_tlimit is not null and v_tused >= v_tlimit then 'term_cap'
    when v_mlimit is not null and v_mused >= v_mlimit then 'month_cap'
  end;

  return query select
    v_reason is null, v_reason,
    v_mused, v_mlimit, case when v_mlimit is null then null else greatest(v_mlimit - v_mused, 0) end,
    v_tused, v_tlimit, case when v_tlimit is null then null else greatest(v_tlimit - v_tused, 0) end,
    public.fn_local_date(v_month_end, v_tz),
    case when v_term_end is null then null else public.fn_local_date(v_term_end, v_tz) end;
end;
$$;
