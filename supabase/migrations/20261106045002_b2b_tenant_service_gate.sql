set local lock_timeout = '5s';

-- 스쿨멘토 기관 서비스 게이트(4번): 기타 소속 막기, 학습진단 기관 소비, 기타에서 소속코드로 옮기기.
-- 스키마와 함수만 있고 데이터 문장이 없다. 새 함수는 service_role 만 부르고 기존 함수 중 바뀌는 것은
-- fn_tenant_usage_state 하나다(기타 소속 사유 추가). 위닝 사이트는 이 함수를 부르지 않아 동작이 그대로다.

-- 1) 기타(catch-all) 소속 학생은 설정 행이 있어도 막는다(deny_reason catch_all, 가장 먼저 본다).
-- 시그니처와 나머지 본문은 20261105045059 와 같고 case 의 첫 갈래만 늘었다.
-- fn_consume_tenant_usage 와 fn_my_usage_state 는 이 함수를 불러 새 사유를 그대로 받는다.
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

comment on function public.fn_tenant_usage_state(uuid, text) is '학생의 한 서비스 사용 상태. deny_reason: catch_all(기타 소속), disabled, outside_period, grace, term_cap, month_cap. 허용이면 null.';

-- 2) 학습진단 시도에 기관(tenant) 종류를 허용한다. 기관 학생은 무료 1회와 원장 없이 기관 한도로 센다.
-- credit_needs_ledger 는 그대로다(tenant 는 ledger_id 를 비운다).
alter table public.diagnosis_attempts
  drop constraint diagnosis_attempts_kind_check,
  add constraint diagnosis_attempts_kind_check check (kind in ('free', 'credit', 'tenant'));

-- 3) 학습진단 제출 1건을 기관 한도로 센다(consume_diagnosis_attempt 의 기관 학생용, 멱등 키는 p_attempt_id).
-- 같은 시도 id 가 다른 학생의 것이면 attempt_conflict, 같은 학생의 것이면 already_recorded 로 아무것도 다시 쓰지 않는다.
-- 아니면 fn_consume_tenant_usage 에 맡기고 consumed, already_consumed 일 때만 시도 행을 남긴다.
-- 거부 사유(month_cap, catch_all 등)는 그대로 돌려주고 시도 행을 남기지 않는다. 잠금은 소비 함수와 같은 advisory(101, 학생 단위).
create function public.fn_consume_tenant_diagnosis(p_attempt_id uuid, p_profile uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_result text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_profile::text, 101));

  select a.profile_id into v_owner from public.diagnosis_attempts a where a.id = p_attempt_id;
  if found then
    return case when v_owner = p_profile then 'already_recorded' else 'attempt_conflict' end;
  end if;

  v_result := public.fn_consume_tenant_usage(p_profile, 'diagnose', 'diagnosis_attempt', p_attempt_id);
  if v_result in ('consumed', 'already_consumed') then
    insert into public.diagnosis_attempts (id, profile_id, kind, reason)
    values (p_attempt_id, p_profile, 'tenant', 'diagnosis:survey-submit');
  end if;
  return v_result;
end;
$$;

revoke all on function public.fn_consume_tenant_diagnosis(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_consume_tenant_diagnosis(uuid, uuid) to service_role;

comment on function public.fn_consume_tenant_diagnosis(uuid, uuid) is '기관 학생의 학습진단 제출 1건을 기관 한도로 센다(service_role 전용). consumed, already_consumed 는 diagnosis_attempts(kind tenant)를 남기고, 같은 시도 재호출은 already_recorded, 남의 시도 id 는 attempt_conflict, 그 밖은 fn_consume_tenant_usage 의 거부 사유를 그대로 돌려준다.';

-- 4) 로그인 사용자 대신 user id 를 받는 소속코드 확인(fn_resolve_tenant_code 와 같은 본문).
-- 서버 API 는 service_role 로 부르므로 auth.uid() 가 없다. 사용자당 최근 1시간 실패 10회면 WC068(맞는 코드도 막는다),
-- 못 찾으면 실패 기록을 남기고 null 을 돌려준다. raise 하지 않는 이유는 fn_resolve_tenant_code 와 같다.
-- fn_resolve_tenant_code 와 fn_set_my_tenant 는 그대로 둔다(위닝 동작 불변).
create function public.fn_tenant_code_resolve_for(p_user uuid, p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_failures integer;
  v_id uuid;
begin
  delete from public.tenant_code_attempts a
   where a.user_id = p_user and a.attempted_at <= now() - interval '1 hour';

  select count(*) into v_failures from public.tenant_code_attempts a where a.user_id = p_user;
  if v_failures >= 10 then
    raise exception 'tenant_code_attempts_exceeded' using errcode = 'WC068';
  end if;

  select t.id into v_id from public.tenants t where t.code = public.fn_normalize_tenant_code(p_code);

  if v_id is null then
    insert into public.tenant_code_attempts (user_id) values (p_user);
    return null;
  end if;
  return v_id;
end;
$$;

-- 5) 기타 소속 학생의 소속코드 조회. 현재 소속이 기타가 아니면 WC098(기타에서만 옮길 수 있다, 다른 기관끼리는 본사만).
-- 못 찾았거나 기타 자신의 코드면 0행이다(raise 하면 실패 기록이 같이 롤백된다). id, name, org_type 만 내보낸다.
create function public.fn_catch_all_tenant_lookup(p_user uuid, p_code text)
returns table (id uuid, name text, org_type text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_catch_all boolean;
  v_target uuid;
begin
  select t.is_catch_all into v_current_catch_all
    from public.profiles p join public.tenants t on t.id = p.tenant_id
   where p.id = p_user;
  if not coalesce(v_current_catch_all, false) then
    raise exception 'only the catch-all tenant can move' using errcode = 'WC098';
  end if;

  v_target := public.fn_tenant_code_resolve_for(p_user, p_code);
  if v_target is null then
    return;
  end if;

  return query select t.id, t.name, t.org_type from public.tenants t where t.id = v_target and not t.is_catch_all;
end;
$$;

revoke all on function public.fn_tenant_code_resolve_for(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_tenant_code_resolve_for(uuid, text) to service_role;
revoke all on function public.fn_catch_all_tenant_lookup(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_catch_all_tenant_lookup(uuid, text) to service_role;

comment on function public.fn_tenant_code_resolve_for(uuid, text) is '소속코드 확인(service_role 전용, fn_resolve_tenant_code 와 같은 본문에 auth.uid() 대신 user id). 사용자당 1시간 실패 10회면 WC068, 못 찾으면 실패 기록을 남기고 null.';
comment on function public.fn_catch_all_tenant_lookup(uuid, text) is '기타 소속 학생의 소속코드 조회(service_role 전용). 현재 소속이 기타가 아니면 WC098, 못 찾았거나 기타 자신의 코드면 0행(raise 하지 않는다).';

-- 6) 기타 소속 학생이 소속코드로 실제 기관으로 옮긴다. 한 트랜잭션이라 어느 단계든 예외로 끝나면 전부 되돌아간다.
-- 순서: 프로필 행 잠금과 기타 확인(WC098), 코드 확인(WC068), 대상 기관 전화번호 유일성(WC096), 기타의 대기 신청 거절,
-- 기타 학적 행 삭제, 소속과 school_name 갱신, 대상 기관 학적 만들기(fn_enrollment_join: WC077, WC080, WC079, WC094).
-- 못 찾았거나 기타 자신의 코드면 0행이다(raise 하지 않아야 실패 기록이 남는다).
-- 기타 소속 때의 기록(학적 변경 이력, 메모, 플래그, 상담 상태)은 기타 기관에 그대로 둔다. student_enrollments.id 를 가리키는 외래키는 없어
-- 학적 행 삭제는 다른 테이블에 영향이 없다. 계약이 끝난 기관으로도 옮길 수 있다(가입과 같다, 서비스는 기간 사유로 막힌다).
create function public.fn_catch_all_join_tenant(
  p_user uuid,
  p_code text,
  p_grade text,
  p_group_name text,
  p_class_name text,
  p_number smallint
)
returns table (tenant_id uuid, tenant_name text, enrollment_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_from_tenant uuid;
  v_from_catch_all boolean;
  v_phone_digits text;
  v_target_id uuid;
  v_target public.tenants;
  v_enrollment uuid;
  v_constraint text;
begin
  select p.tenant_id, t.is_catch_all, regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g')
    into v_from_tenant, v_from_catch_all, v_phone_digits
    from public.profiles p left join public.tenants t on t.id = p.tenant_id
   where p.id = p_user
     for update of p;
  if not coalesce(v_from_catch_all, false) then
    raise exception 'only the catch-all tenant can move' using errcode = 'WC098';
  end if;

  v_target_id := public.fn_tenant_code_resolve_for(p_user, p_code);
  if v_target_id is null then
    return;
  end if;
  select * into v_target from public.tenants t where t.id = v_target_id;
  if v_target.is_catch_all then
    return;
  end if;

  if v_phone_digits <> '' and exists (
    select 1 from public.profiles pr
     where pr.id <> p_user
       and pr.member_type is not null
       and pr.tenant_id = v_target.id
       and regexp_replace(coalesce(pr.phone, ''), '[^0-9]', '', 'g') = v_phone_digits
  ) then
    raise exception 'phone_taken' using errcode = 'WC096';
  end if;

  update public.enrollment_changes c
     set status = 'rejected', reject_reason = '소속 변경', decided_at = now()
   where c.student_id = p_user and c.tenant_id = v_from_tenant and c.status = 'pending';

  delete from public.student_enrollments e where e.student_id = p_user and e.tenant_id = v_from_tenant;

  perform set_config('app.tenant_set_via_rpc', '1', true);
  begin
    update public.profiles pr
       set tenant_id = v_target.id,
           school_name = case when v_target.org_type = '학교' then v_target.name end,
           updated_at = now()
     where pr.id = p_user;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'profiles_tenant_phone_unique_idx' then
      raise exception 'phone_taken' using errcode = 'WC096';
    end if;
    raise;
  end;

  select j.enrollment_id into v_enrollment
    from public.fn_enrollment_join(p_user, v_target.id, p_grade, p_group_name, p_class_name, p_number) j;

  return query select v_target.id, v_target.name, v_enrollment;
end;
$$;

revoke all on function public.fn_catch_all_join_tenant(uuid, text, text, text, text, smallint) from public, anon, authenticated;
grant execute on function public.fn_catch_all_join_tenant(uuid, text, text, text, text, smallint) to service_role;

comment on function public.fn_catch_all_join_tenant(uuid, text, text, text, text, smallint) is '기타 소속 학생이 소속코드로 실제 기관으로 옮긴다(service_role 전용, 한 트랜잭션). 기타가 아니면 WC098, 시도 초과 WC068, 대상 기관 전화번호 중복 WC096, 번호 중복 WC077, 없는 그룹 WC080. 못 찾았거나 기타 코드면 0행. 기타의 대기 신청은 소속 변경 사유로 거절하고 기타 학적 행은 지운다.';
