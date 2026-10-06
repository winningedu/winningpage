-- 성장설계 회차 차감·되돌림 RPC (No.14 차감 규칙).
--
-- No.14 차감 규칙: 첫 모델 호출 단계가 성공했을 때 회차 1개를 한 번만 차감한다.
-- 같은 회차의 재요청은 추가로 차감하지 않고, 생성이 실패하면 차감을 되돌린다.
--
-- 소비 원장은 새로 만들지 않고 performance_credit_ledger 를 재사용한다(진단 게이팅
-- 20260821000005 와 같은 이유 — 회차 요약·입장 판정·환불 소비 판정이 이 원장 하나를
-- 정본으로 재계산한다). source_kind 에 'growth_report' 를 추가한다. 원본 행은
-- session_id NULL 형태이고 되돌림 행은 session_id 가 항상 NULL 이라 기존
-- performance_credit_ledger_session_id_shape_check 가 이미 허용한다(변경 없음).
alter table public.performance_credit_ledger
  drop constraint performance_credit_ledger_source_kind_check;
alter table public.performance_credit_ledger
  add constraint performance_credit_ledger_source_kind_check
  check (source_kind = any (array[
    'performance_session'::text,
    'mentor_call_booking'::text,
    'diagnosis_attempt'::text,
    'growth_report'::text
  ]));

-- 회차 차감 — consume_diagnosis_attempt 미러. 무료 1회 분기는 없다.
-- 잠금은 같은 salt(101)·프로필 단위라 부여·회수·수행평가·진단 차감과 순서를 공유해
-- 데드락을 피하고 같은 사용자의 동시 요청을 직렬화한다.
create or replace function public.consume_growth_credit(
  "p_report_id" uuid,
  "p_profile_id" uuid,
  "p_reason" text default 'growth:step1-success'
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  c_program_key constant text := 'growth';

  v_report      public.growth_reports;
  v_summary     record;
  v_access      public.program_access;
  v_grant       record;
  v_selected_id uuid;
  v_live_count  int := 0;
  v_ever_exists boolean;
  v_consumed    int;
  v_ledger_id   uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 101));

  select * into v_report
    from public.growth_reports r
   where r.id = p_report_id and r.profile_id = p_profile_id
     for update;

  if not found then
    return jsonb_build_object(
      'status', 'session_not_found', 'charged', false,
      'ledger_id', null, 'grant_id', null,
      'quota_total', null, 'quota_used', null, 'quota_remaining', null,
      'plan_ends_at', null, 'program_key', c_program_key
    );
  end if;

  -- 멱등: 이미 차감했고 되돌리지 않은 회차는 다시 차감하지 않는다.
  -- 되돌림이 끝난 회차(ledger_reversed_at 있음)의 재시도는 새로 차감한다.
  if v_report.ledger_id is not null and v_report.ledger_reversed_at is null then
    select * into v_summary
      from public.fn_program_access_grants_summary(p_profile_id, c_program_key);

    return jsonb_build_object(
      'status', 'already_charged', 'charged', false,
      'ledger_id', v_report.ledger_id, 'grant_id', null,
      'quota_total', v_summary.quota_total, 'quota_used', v_summary.quota_used,
      'quota_remaining', case when v_summary.quota_total is null then null
                              else greatest(v_summary.quota_total - v_summary.quota_used, 0) end,
      'plan_ends_at', v_summary.expires_at, 'program_key', c_program_key
    );
  end if;

  -- 운영자 제재만 program_access 캐시에서 읽는다. 기간·회차는 원장에서만 판정한다.
  select * into v_access
    from public.program_access
   where id = p_profile_id and program_key = c_program_key;

  if found and v_access.access_status = 'suspended' then
    return jsonb_build_object(
      'status', 'entitlement_expired', 'charged', false,
      'ledger_id', null, 'grant_id', null,
      'quota_total', null, 'quota_used', 0, 'quota_remaining', null,
      'plan_ends_at', null, 'program_key', c_program_key
    );
  end if;

  -- 살아있고 만료되지 않은 부여를 소비 순서로 잠근다(만료 임박 우선).
  v_selected_id := null;
  for v_grant in
    select g.id, g.granted_sessions
      from public.program_access_grants g
     where g.profile_id  = p_profile_id
       and g.program_key = c_program_key
       and g.revoked_at is null
       and (g.expires_at is null or g.expires_at > now())
     order by g.expires_at asc nulls last, g.starts_at asc, g.created_at asc, g.id asc
       for update
  loop
    v_live_count := v_live_count + 1;

    if v_selected_id is not null then
      continue;
    end if;

    if v_grant.granted_sessions is null then
      v_selected_id := v_grant.id;   -- 무제한 부여. 즉시 채택.
      continue;
    end if;

    select coalesce(sum(-l.delta), 0) into v_consumed
      from public.performance_credit_ledger l
     where l.grant_id = v_grant.id;

    if v_grant.granted_sessions - v_consumed > 0 then
      v_selected_id := v_grant.id;
    end if;
  end loop;

  if v_live_count = 0 then
    select exists (
      select 1 from public.program_access_grants g
       where g.profile_id = p_profile_id and g.program_key = c_program_key
    ) into v_ever_exists;

    return jsonb_build_object(
      'status', case when v_ever_exists then 'entitlement_expired' else 'no_entitlement' end,
      'charged', false, 'ledger_id', null, 'grant_id', null,
      'quota_total', null, 'quota_used', 0, 'quota_remaining', null,
      'plan_ends_at', null, 'program_key', c_program_key
    );
  end if;

  if v_selected_id is null then
    select * into v_summary
      from public.fn_program_access_grants_summary(p_profile_id, c_program_key);

    return jsonb_build_object(
      'status', 'quota_exhausted', 'charged', false,
      'ledger_id', null, 'grant_id', null,
      'quota_total', v_summary.quota_total, 'quota_used', v_summary.quota_used,
      'quota_remaining', 0, 'plan_ends_at', v_summary.expires_at,
      'program_key', c_program_key
    );
  end if;

  -- 차감 성립 = 원장 INSERT + 회차 행 연결. 회차 행을 위에서 잠갔고 advisory lock 이
  -- 동시 요청을 직렬화하므로 경합 재방어는 필요 없다.
  insert into public.performance_credit_ledger
    (profile_id, grant_id, delta, reason, source_kind)
  values (
    p_profile_id, v_selected_id, -1,
    coalesce(nullif(btrim(p_reason), ''), 'growth:step1-success') || ':' || p_report_id::text,
    'growth_report'
  )
  returning id into v_ledger_id;

  update public.growth_reports
     set ledger_id = v_ledger_id,
         ledger_reversed_at = null,
         updated_at = now()
   where id = p_report_id;

  select * into v_summary
    from public.fn_program_access_grants_summary(p_profile_id, c_program_key);

  return jsonb_build_object(
    'status', 'charged', 'charged', true,
    'ledger_id', v_ledger_id, 'grant_id', v_selected_id,
    'quota_total', v_summary.quota_total, 'quota_used', v_summary.quota_used,
    'quota_remaining', case when v_summary.quota_total is null then null
                            else greatest(v_summary.quota_total - v_summary.quota_used, 0) end,
    'plan_ends_at', v_summary.expires_at, 'program_key', c_program_key
  );
end;
$$;

comment on function public.consume_growth_credit(uuid, uuid, text) is
  '성장설계 회차 1개 차감(No.14: 첫 모델 호출 단계 성공 시 1회, 같은 회차 재요청은 추가 차감 없음). growth 부여에서 performance_credit_ledger(source_kind=growth_report, session_id NULL)에 -1 을 적재하고 growth_reports.ledger_id 를 갱신한다. 원장 reason 은 사유 뒤에 콜론과 report_id 를 붙여 회차를 추적할 수 있다. 무료 1회 분기 없음. status 어휘: charged/already_charged/session_not_found/no_entitlement/entitlement_expired/quota_exhausted. 이미 되돌린 회차(ledger_reversed_at 있음)의 재호출은 새로 차감한다. 잠금은 consume_diagnosis_attempt 와 같은 advisory(101, 프로필 단위).';

revoke all on function public.consume_growth_credit(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.consume_growth_credit(uuid, uuid, text) to service_role;

-- 차감 되돌림 — 생성 실패 시 No.14 에 따라 차감 1건을 그대로 상쇄한다.
-- performance_credit_ledger_validate_reversal(BEFORE INSERT)이 요구하는 조건을 맞춘다:
--   reversal_of = 원본 행 id (원본이 되돌림 행이면 WC014)
--   grant_id / profile_id / source_kind = 원본과 동일 (WC015/016/017)
--   delta = -원본.delta (= +1, WC018)
--   session_id NULL (되돌림 행 shape check)
create or replace function public.reverse_growth_credit(
  "p_report_id" uuid,
  "p_profile_id" uuid,
  "p_reason" text default 'growth:generation-failed'
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_report public.growth_reports;
  v_orig   public.performance_credit_ledger;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 101));

  select * into v_report
    from public.growth_reports r
   where r.id = p_report_id and r.profile_id = p_profile_id
     for update;

  if not found then
    return jsonb_build_object('status', 'session_not_found', 'reversed', false);
  end if;

  if v_report.ledger_id is null then
    return jsonb_build_object('status', 'nothing_to_reverse', 'reversed', false);
  end if;

  if v_report.ledger_reversed_at is not null
     or exists (
       select 1 from public.performance_credit_ledger l
        where l.reversal_of = v_report.ledger_id
     ) then
    -- 되돌림 행은 있는데 회차 시각이 비어 있는 불일치를 복구한다.
    if v_report.ledger_reversed_at is null then
      update public.growth_reports
         set ledger_reversed_at = now(),
             updated_at = now()
       where id = p_report_id;
    end if;

    return jsonb_build_object(
      'status', 'already_reversed', 'reversed', false,
      'ledger_id', v_report.ledger_id
    );
  end if;

  -- 정상 발급된 회차는 되돌리지 않는다(발급 완료 회차의 무료화 방지).
  if v_report.status = 'completed' then
    return jsonb_build_object('status', 'report_completed', 'reversed', false);
  end if;

  select * into v_orig
    from public.performance_credit_ledger l
   where l.id = v_report.ledger_id;

  insert into public.performance_credit_ledger
    (profile_id, grant_id, delta, reason, source_kind, reversal_of, session_id)
  values (
    v_orig.profile_id, v_orig.grant_id, -v_orig.delta,
    coalesce(nullif(btrim(p_reason), ''), 'growth:generation-failed') || ':' || p_report_id::text,
    v_orig.source_kind, v_orig.id, null
  );

  update public.growth_reports
     set ledger_reversed_at = now(),
         updated_at = now()
   where id = p_report_id;

  return jsonb_build_object(
    'status', 'reversed', 'reversed', true, 'ledger_id', v_report.ledger_id
  );
end;
$$;

comment on function public.reverse_growth_credit(uuid, uuid, text) is
  '성장설계 차감 되돌림(No.14: 생성 실패 시 되돌림). growth_reports.ledger_id 의 원장 행을 reversal_of 로 참조하는 +1 행을 적재하고 ledger_reversed_at 을 기록한다. status 어휘: reversed/nothing_to_reverse/already_reversed/report_completed/session_not_found. completed 회차는 되돌리지 않고 report_completed 를 돌려준다. 되돌림 행은 있는데 ledger_reversed_at 이 비어 있으면 already_reversed 분기에서 시각을 채워 복구한다. 원장 reason 에는 report_id 를 붙인다. 되돌림 행은 원본의 grant_id·profile_id·source_kind 를 상속하고 session_id 는 NULL(performance_credit_ledger_validate_reversal 요구). 잠금은 consume_growth_credit 과 같은 advisory(101).';

revoke all on function public.reverse_growth_credit(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reverse_growth_credit(uuid, uuid, text) to service_role;
