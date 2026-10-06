-- 심화탐구 생성 단계 선점, 종료, 종결 RPC.
--
-- 왜 RPC 인가 (성장설계 20261006075410 과 같은 이유)
--   1) 같은 학생의 동시 요청(더블클릭, 다중 탭, 재시도)을 직렬화한다. 잠금은 차감 RPC 와 같은
--      advisory(salt 101, 프로필 단위)이고 그 뒤에 세션 행을 for update 로 잡아 순서를 공유한다.
--   2) 서버리스 함수는 중간에 끊길 수 있다. 선점한 mode 가 running 으로 남으면 영영 막히므로
--      startedAt 이 p_stale_seconds 보다 오래된 running 은 다시 선점할 수 있게 한다(stale 복구).
--      이때 이전 요청이 뒤늦게 끝을 보고하면 fn_inquiry_finish_generation 이 running 이 아니거나
--      덮어쓴 선점이라 false 를 돌려 결과 반영을 막는다.
--
-- 성장설계와 다른 점
--   - 단계 번호가 아니라 mode 3종(topic_recommendation, design_report, evaluation_report)을
--     선점한다. 재추천과 재평가가 같은 mode 를 다시 쓰므로 단계 순서(order)와 done 멱등은
--     두지 않는다. 선행 조건(주제 선택 여부, 작성본 존재 여부)은 앱이 검사한다.
--   - draft 세션을 in_progress 로 올리지 않는다. 차감 시점(첫 추천 성공 직후)에 앱이 올린다.
--   - finish 는 결과 컬럼을 patch 하지 않는다. 결과(주제, 리포트)는 앱이 service_role 로
--     직접 insert 한다.
--
-- generation_state 구조 (inquiry_sessions.generation_state)
--   { "modes": { "<mode>": { "status": "pending|running|ok|failed", "attempts": n,
--                            "startedAt": iso, "finishedAt": iso|null, "issues": [] } },
--     "terminal": { "reason": text, "at": iso, "mode": text } }   terminal 은 없을 수 있다.
--
-- 함수 목록: fn_inquiry_claim_generation, fn_inquiry_finish_generation,
--   fn_inquiry_terminate_session
--
-- 이 파일의 문장은 전부 create or replace, comment, revoke, grant 라 재실행해도 안전하다.

-- 1) 생성 선점 ----------------------------------------------------------------
create or replace function public.fn_inquiry_claim_generation(
  p_session_id uuid,
  p_profile_id uuid,
  p_mode text,
  p_stale_seconds integer default 120
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  -- api/_lib/inquiry/constants.ts 의 MAX_MODEL_ATTEMPTS_PER_MODE 와 같은 값이다.
  c_max_attempts constant integer := 10;

  v_session  public.inquiry_sessions;
  v_rec      jsonb;
  v_attempts integer;
  v_started  timestamptz;
  v_now_iso  text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if p_mode is null
     or p_mode not in ('topic_recommendation', 'design_report', 'evaluation_report') then
    raise exception 'inquiry_mode_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 101));

  select * into v_session
    from public.inquiry_sessions s
   where s.id = p_session_id and s.profile_id = p_profile_id
     for update;

  if not found then
    return jsonb_build_object('kind', 'locked');
  end if;

  if v_session.status not in ('draft', 'in_progress') then
    return jsonb_build_object('kind', 'locked');
  end if;

  if (v_session.generation_state -> 'terminal') is not null
     and jsonb_typeof(v_session.generation_state -> 'terminal') <> 'null' then
    return jsonb_build_object('kind', 'locked');
  end if;

  v_rec := v_session.generation_state -> 'modes' -> p_mode;

  -- 신선한 running 이면 다른 요청이 처리 중이다. startedAt 이 없거나 오래됐으면 선점 가능.
  if v_rec ->> 'status' = 'running' and v_rec ->> 'startedAt' is not null then
    v_started := (v_rec ->> 'startedAt')::timestamptz;
    if v_started > now() - make_interval(secs => p_stale_seconds) then
      return jsonb_build_object('kind', 'running');
    end if;
  end if;

  v_attempts := coalesce((v_rec ->> 'attempts')::integer, 0);
  if v_attempts >= c_max_attempts then
    return jsonb_build_object('kind', 'exhausted', 'attempts', v_attempts);
  end if;

  update public.inquiry_sessions s
     set generation_state = jsonb_set(
           coalesce(s.generation_state, '{}'::jsonb),
           '{modes}',
           coalesce(s.generation_state -> 'modes', '{}'::jsonb)
             || jsonb_build_object(
                  p_mode,
                  jsonb_build_object(
                    'status', 'running',
                    'attempts', v_attempts + 1,
                    'startedAt', v_now_iso,
                    'finishedAt', null,
                    'issues', coalesce(v_rec -> 'issues', '[]'::jsonb)
                  )
                ),
           true
         ),
         last_activity_at = now(),
         updated_at = now()
   where s.id = p_session_id;

  return jsonb_build_object('kind', 'claimed', 'attempts', v_attempts + 1);
end;
$$;

comment on function public.fn_inquiry_claim_generation(uuid, uuid, text, integer) is
  '심화탐구 생성 선점. 프로필 advisory 잠금(101) 뒤 세션 행을 for update 로 읽어 mode 를 running 으로 표시한다. 반환 kind 어휘: claimed(attempts)/locked/running/exhausted(attempts). locked 는 세션 없음, draft/in_progress 아님, terminal 있음이다. 시도 상한은 mode 당 10(MAX_MODEL_ATTEMPTS_PER_MODE). startedAt 이 p_stale_seconds 보다 오래된 running 은 서버리스 중단으로 보고 다시 선점한다. 단계 순서와 done 멱등은 두지 않으며(재추천, 재평가가 같은 mode 를 다시 쓴다) draft 를 in_progress 로 올리지도 않는다. p_mode 가 topic_recommendation, design_report, evaluation_report 가 아니면 예외(22023).';

revoke all on function public.fn_inquiry_claim_generation(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.fn_inquiry_claim_generation(uuid, uuid, text, integer) to service_role;

-- 2) 생성 종료 ----------------------------------------------------------------
create or replace function public.fn_inquiry_finish_generation(
  p_session_id uuid,
  p_profile_id uuid,
  p_mode text,
  p_ok boolean,
  p_issues jsonb default '[]'::jsonb,
  p_extra_attempts integer default 0
) returns boolean
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_session  public.inquiry_sessions;
  v_rec      jsonb;
  v_attempts integer;
  v_now_iso  text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_new_rec  jsonb;
begin
  if p_mode is null
     or p_mode not in ('topic_recommendation', 'design_report', 'evaluation_report') then
    raise exception 'inquiry_mode_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 101));

  select * into v_session
    from public.inquiry_sessions s
   where s.id = p_session_id and s.profile_id = p_profile_id
     for update;

  if not found then
    return false;
  end if;

  if v_session.status not in ('draft', 'in_progress') then
    return false;
  end if;

  v_rec := v_session.generation_state -> 'modes' -> p_mode;

  -- 다른 요청이 이미 끝냈거나 stale 선점이 덮어쓴 경우.
  if v_rec is null or v_rec ->> 'status' is distinct from 'running' then
    return false;
  end if;

  v_attempts := coalesce((v_rec ->> 'attempts')::integer, 0) + coalesce(p_extra_attempts, 0);

  v_new_rec := jsonb_build_object(
    'status', case when p_ok then 'ok' else 'failed' end,
    'attempts', v_attempts,
    'startedAt', v_rec -> 'startedAt',
    'finishedAt', v_now_iso,
    'issues', case when p_ok then '[]'::jsonb else coalesce(p_issues, '[]'::jsonb) end
  );

  update public.inquiry_sessions s
     set generation_state = jsonb_set(
           coalesce(s.generation_state, '{}'::jsonb),
           '{modes}',
           coalesce(s.generation_state -> 'modes', '{}'::jsonb)
             || jsonb_build_object(p_mode, v_new_rec),
           true
         ),
         last_activity_at = now(),
         updated_at = now()
   where s.id = p_session_id;

  return true;
end;
$$;

comment on function public.fn_inquiry_finish_generation(uuid, uuid, text, boolean, jsonb, integer) is
  '심화탐구 생성 종료. 선점한 running mode 를 ok 또는 failed 로 닫는다. 반환 boolean: true 는 반영됨, false 는 행 없음, 세션이 draft/in_progress 아님, mode 가 running 아님(다른 요청이 끝냈거나 stale 선점이 덮어씀). attempts 는 선점 때 이미 1 올라가 있고 p_extra_attempts 를 더 더한다. ok 면 issues 를 비우고 실패면 p_issues 를 기록한다. 결과 컬럼은 건드리지 않는다(주제, 리포트는 앱이 service_role 로 직접 insert 한다).';

revoke all on function public.fn_inquiry_finish_generation(uuid, uuid, text, boolean, jsonb, integer) from public, anon, authenticated;
grant execute on function public.fn_inquiry_finish_generation(uuid, uuid, text, boolean, jsonb, integer) to service_role;

-- 3) 세션 종결 ----------------------------------------------------------------
-- 시도 상한 초과나 복구 불가 오류로 더 진행할 수 없는 세션을 archived 로 닫고 terminal 사유를
-- 남긴다. 차감 원장이 있고 아직 되돌리기 전이면 needsReverse 로 알려, 호출자가
-- reverse_inquiry_credit 을 이어서 부르게 한다.
create or replace function public.fn_inquiry_terminate_session(
  p_session_id uuid,
  p_profile_id uuid,
  p_mode text,
  p_reason text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.inquiry_sessions;
  v_now_iso text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if p_mode is null
     or p_mode not in ('topic_recommendation', 'design_report', 'evaluation_report') then
    raise exception 'inquiry_mode_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 101));

  select * into v_session
    from public.inquiry_sessions s
   where s.id = p_session_id and s.profile_id = p_profile_id
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'kind', 'not_found');
  end if;

  -- 확정된 세션과 이미 닫힌 세션은 건드리지 않는다.
  if v_session.status not in ('draft', 'in_progress') then
    return jsonb_build_object('ok', false, 'kind', 'locked');
  end if;

  update public.inquiry_sessions s
     set status = 'archived',
         generation_state = jsonb_set(
           coalesce(s.generation_state, '{}'::jsonb),
           '{terminal}',
           jsonb_build_object('reason', p_reason, 'at', v_now_iso, 'mode', p_mode),
           true
         ),
         last_activity_at = now(),
         updated_at = now()
   where s.id = p_session_id;

  return jsonb_build_object(
    'ok', true,
    'kind', 'terminated',
    'needsReverse', (v_session.ledger_id is not null and v_session.ledger_reversed_at is null),
    'ledgerId', v_session.ledger_id
  );
end;
$$;

comment on function public.fn_inquiry_terminate_session(uuid, uuid, text, text) is
  '심화탐구 세션 종결. draft 또는 in_progress 세션을 archived 로 바꾸고 generation_state.terminal 에 {reason, at, mode} 를 병합한다(modes 는 보존). 반환 jsonb: {ok:false, kind:not_found}(행 없음)/{ok:false, kind:locked}(draft, in_progress 아님, completed 포함)/{ok:true, kind:terminated, needsReverse, ledgerId}. needsReverse 는 ledger_id 가 있고 ledger_reversed_at 이 비어 있을 때 true 다. 프로필 advisory 잠금(101) 뒤 세션 행을 for update 로 잡는다. p_mode 가 허용 3종이 아니면 예외(22023).';

revoke all on function public.fn_inquiry_terminate_session(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.fn_inquiry_terminate_session(uuid, uuid, text, text) to service_role;
