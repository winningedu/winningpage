-- B2B 기반 11: 기관 이용 한도(서비스 설정, 학생별 조정, 사용 기록)와 상태, 소비 함수.
-- 새 테이블은 비어 있고 어디서도 참조하지 않아 위닝 사이트 DB 동작은 바뀌지 않는다.
-- 한도 숫자는 데이터(HQ 화면이 채운다)이고 이 파일에는 상수가 없다. 설정 행이 없는 서비스는 제공하지 않는 서비스다(P20).
-- 에러 코드는 쓰지 않는다. 소비 결과는 문자열로 돌려준다.

-- 기관별 서비스 설정. enabled 는 마스터 스위치, starts_on/ends_on 은 서비스별 체험 기간(null 이면 기관 계약일),
-- monthly_limit/term_limit 의 null 은 해당 상한 없음.
create table public.tenant_service_settings (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_key text not null check (program_key in ('diagnose', 'target', 'growth', 'suhaeng', 'inquiry', 'selfeval')),
  enabled boolean not null default true,
  starts_on date,
  ends_on date,
  monthly_limit smallint check (monthly_limit > 0),
  term_limit smallint check (term_limit > 0),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, program_key),
  constraint tenant_service_settings_period_order check (starts_on is null or ends_on is null or starts_on <= ends_on)
);

-- 학생별 조정. 월과 학기 횟수만 학생별로 바꾼다. null 은 기관 설정을 따른다.
create table public.student_usage_overrides (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  program_key text not null check (program_key in ('diagnose', 'target', 'growth', 'suhaeng', 'inquiry', 'selfeval')),
  monthly_limit smallint check (monthly_limit > 0),
  term_limit smallint check (term_limit > 0),
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  primary key (profile_id, program_key)
);

-- 사용 기록. 1회는 과제 1개이고 (source_kind, source_id) 가 유일해 같은 과제는 한 번만 센다.
create table public.tenant_usage_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id),
  program_key text not null check (program_key in ('diagnose', 'target', 'growth', 'suhaeng', 'inquiry', 'selfeval')),
  source_kind text not null check (source_kind in
    ('performance_session', 'diagnosis_attempt', 'growth_report', 'selfeval_session', 'inquiry_session')),
  source_id uuid not null,
  used_at timestamptz not null default now()
);

create unique index tenant_usage_events_source_idx on public.tenant_usage_events (source_kind, source_id);
create index tenant_usage_events_profile_program_idx
  on public.tenant_usage_events (profile_id, program_key, used_at);

alter table public.tenant_service_settings enable row level security;
alter table public.student_usage_overrides enable row level security;
alter table public.tenant_usage_events enable row level security;
revoke all on table public.tenant_service_settings, public.student_usage_overrides, public.tenant_usage_events
  from anon, authenticated;
grant select, insert, update on table public.tenant_service_settings, public.student_usage_overrides to authenticated;
grant all on table public.tenant_service_settings, public.student_usage_overrides, public.tenant_usage_events
  to service_role;

-- 본사 화면: 기관 관리 권한이 설정을, 서비스이용횟수조정 권한이 학생별 조정을 읽고 쓴다.
create policy tenant_service_settings_select on public.tenant_service_settings
  for select to authenticated using (public.fn_admin_can('tenants', 'view'));
create policy tenant_service_settings_insert on public.tenant_service_settings
  for insert to authenticated with check (public.fn_admin_can('tenants', 'edit'));
create policy tenant_service_settings_update on public.tenant_service_settings
  for update to authenticated using (public.fn_admin_can('tenants', 'edit'))
  with check (public.fn_admin_can('tenants', 'edit'));
create policy student_usage_overrides_select on public.student_usage_overrides
  for select to authenticated using (public.fn_admin_can('serviceCreditAdjust', 'view'));
create policy student_usage_overrides_insert on public.student_usage_overrides
  for insert to authenticated with check (public.fn_admin_can('serviceCreditAdjust', 'edit'));
create policy student_usage_overrides_update on public.student_usage_overrides
  for update to authenticated using (public.fn_admin_can('serviceCreditAdjust', 'edit'))
  with check (public.fn_admin_can('serviceCreditAdjust', 'edit'));

comment on table public.tenant_service_settings is '기관별 서비스 제공 설정과 한도. 행이 없으면 제공하지 않는 서비스. 숫자는 데이터.';
comment on table public.student_usage_overrides is '학생별 월, 학기 횟수 조정. null 은 기관 설정을 따른다.';
comment on table public.tenant_usage_events is '기관 학생의 서비스 사용 기록. 1회는 과제 1개. 클라이언트 접근 없음(학생은 fn_my_usage_state).';

-- 설정 변경 이력(사 #164, #166): 기관 서비스 설정, 학생별 조정, 기관 계약 컬럼이 바뀌면 변경자(auth.uid()), 일시, 이전 값을
-- admin_access_logs(action settings_change)에 남긴다. 값이 실제로 바뀐 컬럼만 meta.before, meta.after 에 담는다.
-- 로그인 없이(service_role 데이터 작업) 바꾸면 행위자는 actor_login_id 'system' 이다.
-- 트리거는 함수 소유자 권한으로 로그를 넣는다. 이 파일의 마지막에 붙인 트리거는 기존 테이블 동작을 바꾸지 않는다.
create function public.fn_log_settings_change()
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
    else array['contract_start_date', 'contract_end_date', 'term_months', 'grace_ends_on', 'mou_status']
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

revoke all on function public.fn_log_settings_change() from public, anon, authenticated;

create trigger trg_tenant_service_settings_history
  after insert or update or delete on public.tenant_service_settings
  for each row execute function public.fn_log_settings_change();
create trigger trg_student_usage_overrides_history
  after insert or update or delete on public.student_usage_overrides
  for each row execute function public.fn_log_settings_change();
create trigger trg_tenants_contract_history
  after update of contract_start_date, contract_end_date, term_months, grace_ends_on, mou_status on public.tenants
  for each row execute function public.fn_log_settings_change();

-- 학생의 한 서비스 사용 상태. 한도는 학생별 조정이 있으면 그 값, 없으면 기관 설정이다.
-- 기간(period): 서비스의 starts_on/ends_on, 없으면 기관의 계약 시작일과 종료일(둘 다 포함, KST 날짜).
-- 월은 KST 달력 월(1일에 초기화). 학기는 기준일(서비스 starts_on, 없으면 계약 시작일)부터 term_months 개월씩
-- fn_add_months_kst 로 나눈 구간이다. 기준일이 없거나 term_months 가 없으면 기준일부터 하나의 학기로 본다.
-- 체험 기간이어도 학기 한도는 줄이지 않는다(설정 값 그대로).
-- deny_reason: disabled(설정 없음, 꺼짐, 기관 없음), outside_period, grace, term_cap, month_cap. 허용이면 null.
-- grace: 기관 계약이 끝난 뒤 유예 안(사 #160, 결정 r15). 서비스는 막히지만 정보는 아직 지우지 않는 기간이다.
-- 유예 종료일은 tenants.grace_ends_on, 없으면 계약 종료일 + app_settings.contract_grace_days(숫자 데이터, 없으면 유예 없음).
-- 한도를 사용량 아래로 낮추면 남은 횟수는 0 으로 보인다.
create function public.fn_tenant_usage_state(p_profile uuid, p_program_key text)
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
begin
  v_month_end := public.fn_add_months_kst(v_month_start, 1);

  select t.* into v_tenant
    from public.profiles p join public.tenants t on t.id = p.tenant_id
   where p.id = p_profile;
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

-- 소비. 학생 단위 advisory lock(consume_performance_credit 와 같은 클래스 101)으로 순서를 세운다.
-- 같은 과제(source_kind, source_id)가 이미 있으면 한도와 상관없이 already_consumed(시작한 과제는 이어서 한다).
-- 아니면 상태를 보고 거부 사유를 그대로 돌려주고, 허용이면 기록을 넣고 consumed.
create function public.fn_consume_tenant_usage(
  p_profile uuid,
  p_program_key text,
  p_source_kind text,
  p_source_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_state record;
  v_tenant uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_profile::text, 101));

  if exists (select 1 from public.tenant_usage_events e
              where e.source_kind = p_source_kind and e.source_id = p_source_id) then
    return 'already_consumed';
  end if;

  select s.* into v_state from public.fn_tenant_usage_state(p_profile, p_program_key) s;
  if not v_state.allowed then
    return v_state.deny_reason;
  end if;

  select p.tenant_id into v_tenant from public.profiles p where p.id = p_profile;
  insert into public.tenant_usage_events (profile_id, tenant_id, program_key, source_kind, source_id)
  values (p_profile, v_tenant, p_program_key, p_source_kind, p_source_id);
  return 'consumed';
end;
$$;

-- 학생 본인 화면용(auth.uid()).
create function public.fn_my_usage_state(p_program_key text)
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
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  return query select * from public.fn_tenant_usage_state(auth.uid(), p_program_key);
end;
$$;

revoke all on function public.fn_tenant_usage_state(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_tenant_usage_state(uuid, text) to service_role;
revoke all on function public.fn_consume_tenant_usage(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.fn_consume_tenant_usage(uuid, text, text, uuid) to service_role;
revoke all on function public.fn_my_usage_state(text) from public, anon;
grant execute on function public.fn_my_usage_state(text) to authenticated;
