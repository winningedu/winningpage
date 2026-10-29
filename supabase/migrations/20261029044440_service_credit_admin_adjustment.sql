-- 관리자 서비스이용횟수조정(어드민 서비스 관리 > 서비스이용횟수조정).
-- 1) performance_credit_ledger.source_kind 에 admin_adjustment 를 더한다.
--    관리자 차감 행은 session_id NULL 이라 session_id_shape_check 의 두 번째 갈래와 맞는다.
-- 2) 관리자 차감 함수. consume_*_credit 과 같은 advisory(101, 프로필 단위) 잠금 안에서
--    살아있는 부여를 소비 순서(만료 임박 우선)로 잠그고, 잔여를 확인한 뒤 부여별로 나눠 원장에 적재한다.
-- fn_program_access_grants_summary 는 소비를 grant_id 조인으로만 합산하고 source_kind 를 보지 않으므로
-- 함수 변경 없이 admin_adjustment 행도 quota_used 에 잡힌다.

alter table public.performance_credit_ledger
  drop constraint performance_credit_ledger_source_kind_check;

alter table public.performance_credit_ledger
  add constraint performance_credit_ledger_source_kind_check
  check (source_kind = any (array[
    'performance_session', 'mentor_call_booking', 'diagnosis_attempt',
    'growth_report', 'selfeval_session', 'inquiry_session', 'admin_adjustment'
  ]::text[]));

comment on column public.performance_credit_ledger.source_kind is
  '이 소비 행이 무엇을 차감한 것인지. performance_session(기본값, 배포된 consume_performance_credit 이 이 값으로 남긴다) / mentor_call_booking(콜멘토, 소비 함수 미구현) / diagnosis_attempt / growth_report / selfeval_session / inquiry_session / admin_adjustment(관리자 수기 차감, fn_admin_deduct_service_credit, session_id NULL, 사유에 행위자 id 포함). 새 종류가 생기면 CHECK 목록에 추가한다.';

create or replace function public.fn_admin_deduct_service_credit(
  p_profile_id uuid,
  p_program_key text,
  p_amount integer,
  p_reason text
) returns jsonb
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_grant record;
  v_consumed integer;
  v_room integer;
  v_live integer := 0;
  v_ids uuid[] := '{}';
  v_rooms integer[] := '{}';
  v_total integer := 0;
  v_left integer := p_amount;
  v_take integer;
  i integer;
begin
  if p_amount is null or p_amount < 1 then
    raise exception 'p_amount 는 1 이상이어야 합니다.' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'p_reason 이 필요합니다.' using errcode = '22023';
  end if;

  -- 소비 함수와 같은 잠금 순서: advisory(101) 다음 부여 행 for update.
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 101));

  for v_grant in
    select g.id, g.granted_sessions
      from public.program_access_grants g
     where g.profile_id  = p_profile_id
       and g.program_key = p_program_key
       and g.revoked_at is null
       and (g.expires_at is null or g.expires_at > now())
     order by g.expires_at asc nulls last, g.starts_at asc, g.created_at asc, g.id asc
       for update
  loop
    v_live := v_live + 1;

    if v_grant.granted_sessions is null then
      return jsonb_build_object('status', 'unlimited_sessions', 'deducted', 0, 'remaining', null);
    end if;

    select coalesce(sum(-l.delta), 0) into v_consumed
      from public.performance_credit_ledger l
     where l.grant_id = v_grant.id;

    v_room := greatest(v_grant.granted_sessions - v_consumed, 0);
    if v_room > 0 then
      v_ids := v_ids || v_grant.id;
      v_rooms := v_rooms || v_room;
      v_total := v_total + v_room;
    end if;
  end loop;

  if v_live = 0 then
    return jsonb_build_object('status', 'no_entitlement', 'deducted', 0, 'remaining', 0);
  end if;

  if v_total < p_amount then
    return jsonb_build_object('status', 'insufficient_credit', 'deducted', 0, 'remaining', v_total);
  end if;

  for i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
    exit when v_left = 0;
    v_take := least(v_rooms[i], v_left);
    insert into public.performance_credit_ledger
      (profile_id, grant_id, delta, reason, source_kind)
    values (p_profile_id, v_ids[i], -v_take, btrim(p_reason), 'admin_adjustment');
    v_left := v_left - v_take;
  end loop;

  return jsonb_build_object('status', 'deducted', 'deducted', p_amount, 'remaining', v_total - p_amount);
end;
$$;

alter function public.fn_admin_deduct_service_credit(uuid, text, integer, text) owner to postgres;

comment on function public.fn_admin_deduct_service_credit(uuid, text, integer, text) is
  '관리자 수기 차감. 프로필 advisory 잠금(101) 안에서 살아있는 부여를 만료 임박 순으로 잠그고, 잔여가 p_amount 이상일 때만 부여별로 나눠 performance_credit_ledger 에 source_kind=admin_adjustment, session_id NULL 행을 적재한다. 반환 jsonb {status, deducted, remaining}: deducted/no_entitlement/unlimited_sessions/insufficient_credit. 잔여 부족과 무제한 부여는 아무것도 적재하지 않는다. p_amount<1 또는 사유 공백은 예외(22023).';

revoke execute on function public.fn_admin_deduct_service_credit(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.fn_admin_deduct_service_credit(uuid, text, integer, text) to service_role;
