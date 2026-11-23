-- 기관 시범기간(dev-decisions 결정 117, 분석 grill Q8, 계획 5번). 스키마와 함수만 바꾼다. 데이터 문장이 없다.
--
-- 1. tenants.trial_start_date, trial_end_date(KST 날짜, 둘 다 포함). 둘 다 비우거나 둘 다 채운다. 시작일은 종료일보다 늦을 수 없다.
--    종료일 없는 시범기간은 서비스가 끝없이 열리므로 받지 않는다.
-- 2. fn_log_settings_change: 시범기간 두 칼럼도 기존 기관 계약 변경 기록(settings_change)에 남긴다. 트리거 칼럼 목록도 늘린다.
-- 3. fn_tenant_usage_state: 시범기간 안이면 계약일과 서비스 기간(starts_on, ends_on), 유예와 상관없이 기간 판정을 통과한다.
--    계약일이 둘 다 없는 기관은 시범기간을 기관 기간으로 쓴다. 그래서 시범 종료일이 지나면 outside_period 로 자동으로 닫힌다.
--    시범기간이 없는 기관, 계약일이 있는 기관의 시범기간 밖은 예전과 같다. 시그니처, 반환 열, deny_reason 값은 그대로다.
--    설정 꺼짐(disabled), 선생님, 기타 소속, 한도(term_cap, month_cap)는 시범기간에도 그대로 본다.
-- 4. fn_hq_tenant_overview: 반환 열에 trial_start_date, trial_end_date 를 더하고 contract_status 에 trial 을 더한다.
--    trial = 오늘이 시범기간 안이고 계약 기간 안(active, ending_soon)이 아닌 기관. 반환 타입이 바뀌어 drop + create, service_role 만 실행.

alter table public.tenants
  add column trial_start_date date,
  add column trial_end_date date,
  add constraint tenants_trial_order check (
    (trial_start_date is null and trial_end_date is null)
    or (trial_start_date is not null and trial_end_date is not null and trial_start_date <= trial_end_date)
  );

comment on column public.tenants.trial_start_date is '시범 시작일(KST, 포함). 시범기간 안이면 계약 없이도 서비스가 열린다(결정 117).';
comment on column public.tenants.trial_end_date is '시범 종료일(KST, 포함). 지나면 시범이 자동으로 끝난다.';

create or replace function public.fn_log_settings_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_row jsonb;
  v_cols text[];
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_col text;
  v_tenant uuid;
  v_target uuid;
  v_meta jsonb;
begin
  v_row := coalesce(v_new, v_old);
  v_cols := case tg_table_name
    when 'tenant_service_settings' then array['enabled', 'starts_on', 'ends_on', 'monthly_limit', 'term_limit']
    when 'student_usage_overrides' then array['monthly_limit', 'term_limit']
    else array['contract_start_date', 'contract_end_date', 'term_months', 'grace_ends_on', 'mou_status',
                'trial_start_date', 'trial_end_date']
  end;

  foreach v_col in array v_cols loop
    if (v_old ->> v_col) is distinct from (v_new ->> v_col) then
      v_before := v_before || jsonb_build_object(v_col, v_old -> v_col);
      v_after := v_after || jsonb_build_object(v_col, v_new -> v_col);
    end if;
  end loop;
  if v_before = '{}'::jsonb and v_after = '{}'::jsonb then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'student_usage_overrides' then
    v_target := (v_row ->> 'profile_id')::uuid;
    select p.tenant_id into v_tenant from public.profiles p where p.id = v_target;
    v_meta := jsonb_build_object('program_key', v_row ->> 'program_key');
  elsif tg_table_name = 'tenant_service_settings' then
    v_target := (v_row ->> 'tenant_id')::uuid;
    v_tenant := v_target;
    v_meta := jsonb_build_object('program_key', v_row ->> 'program_key');
  else
    v_target := (v_row ->> 'id')::uuid;
    v_tenant := v_target;
    v_meta := '{}'::jsonb;
  end if;
  -- 기관이 지워지는 중(cascade)이면 외래키를 걸 수 없으니 기관 칸을 비운다.
  select t.id into v_tenant from public.tenants t where t.id = v_tenant;

  if v_uid is not null then
    select p.email into v_email from public.profiles p where p.id = v_uid;
    v_email := coalesce(v_email, v_uid::text);
  end if;

  insert into public.admin_access_logs (
    profile_id, actor_email, actor_login_id, actor_kind, action, resource_key, tenant_id, target_id, meta, created_at
  ) values (
    v_uid, v_email, case when v_uid is null then 'system' end, 'hq', 'settings_change', tg_table_name,
    v_tenant, v_target, v_meta || jsonb_build_object('before', v_before, 'after', v_after),
    clock_timestamp()
  );
  return coalesce(new, old);
end;
$$;

drop trigger trg_tenants_contract_history on public.tenants;
create trigger trg_tenants_contract_history
  after update of contract_start_date, contract_end_date, term_months, grace_ends_on, mou_status,
                  trial_start_date, trial_end_date on public.tenants
  for each row execute function public.fn_log_settings_change();

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
  v_in_trial boolean;
begin
  v_month_end := public.fn_add_months_kst(v_month_start, 1);

  select t.* into v_tenant
    from public.profiles p join public.tenants t on t.id = p.tenant_id
   where p.id = p_profile;
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
    (v_month_end at time zone 'Asia/Seoul')::date,
    case when v_term_end is null then null else (v_term_end at time zone 'Asia/Seoul')::date end;
end;
$$;

comment on function public.fn_tenant_usage_state(uuid, text) is '학생의 한 서비스 사용 상태. deny_reason: teacher(선생님 계정), catch_all(기타 소속), disabled, outside_period, grace, term_cap, month_cap. 허용이면 null. 시범기간 안이면 기간 판정을 통과한다(결정 117).';

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
         t.trial_start_date,
         t.trial_end_date,
         case
           when today.d between t.trial_start_date and t.trial_end_date
                and c.status not in ('active', 'ending_soon') then 'trial'
           else c.status
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
    cross join lateral (
      select case
               when t.contract_start_date is null and t.contract_end_date is null then 'none'
               when t.contract_start_date is not null and today.d < t.contract_start_date then 'upcoming'
               when t.contract_end_date is null then 'active'
               when today.d <= t.contract_end_date then
                 case when t.contract_end_date - today.d <= 30 then 'ending_soon' else 'active' end
               when g.grace_end is not null and today.d <= g.grace_end then 'grace'
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
