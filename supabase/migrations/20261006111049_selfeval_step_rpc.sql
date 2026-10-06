-- 자기평가서 단계 선점, 종료, 종결, 최종 저장 RPC.
--
-- 왜 RPC 인가
--   1) supabase-js 는 여러 문장을 한 트랜잭션으로 묶는 수단이 없다. 단계 상태 갱신, 리포트 이력
--      insert, 활동별 분석 반영, 활동 기록 승격을 원자적으로 하려면 함수 하나로 감싸야 한다.
--   2) 같은 학생의 동시 요청(더블클릭, 다중 탭, 재시도)을 직렬화한다. 잠금은 차감 RPC 와 같은
--      advisory(salt 101, 프로필 단위)이고 그 뒤에 세션 행을 for update 로 잡아 순서를 공유한다.
--   3) 서버리스 함수는 중간에 끊길 수 있다. 선점한 단계가 running 으로 남으면 영영 막히므로
--      startedAt 이 p_stale_seconds 보다 오래된 running 은 다시 선점할 수 있게 한다(stale 복구).
--      이때 이전 요청이 뒤늦게 끝을 보고하면 fn_selfeval_finish_step 이 running 이 아니거나
--      덮어쓴 선점이라 false 를 돌려 결과 반영을 막는다.
--
-- 성장설계(20261006075410)와 다른 점
--   - 단계 키가 숫자가 아니라 analyze, write, verify 세 개의 text 다.
--   - 이미 ok 인 단계도 다시 선점한다. 재분석, 재생성, 재검증이 정상 경로이기 때문이다.
--     그래서 'done' 분기가 없다.
--   - 순서 가드는 이전 단계의 ok 기록이 아니라 current_step 으로 본다(명세 No.65). 학생이
--     앞 단계로 돌아가 고쳐도 current_step 은 줄지 않아 뒤 단계가 막히지 않는다.
--
-- 시도 상한 10 의 출처
--   No.89. 단계당 모델 호출 누계(성공과 실패 합산)가 10 에 도달하면 더 선점할 수 없다.
--   api/_lib/selfeval/types.ts 의 MAX_MODEL_ATTEMPTS_PER_STEP 과 같은 값이다.
--
-- jsonb 키는 api/_lib/selfeval/types.ts 의 StepRecord, StepState 와 같다.
--   StepRecord: status, attempts, startedAt, finishedAt, issues
--   claim 반환 kind: claimed, locked, order, running, exhausted
--
-- 함수 목록: fn_selfeval_claim_step, fn_selfeval_finish_step, fn_selfeval_terminate_session,
--   fn_selfeval_finalize
--
-- 이 파일의 문장은 전부 create or replace, comment, revoke, grant 라 재실행해도 안전하다.

-- 1) 단계 선점 ----------------------------------------------------------------
create or replace function public.fn_selfeval_claim_step(
  p_session_id uuid,
  p_profile_id uuid,
  p_step text,
  p_stale_seconds integer default 120
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  c_max_attempts constant integer := 10;

  v_session  public.selfeval_sessions;
  v_rec      jsonb;
  v_min_step integer;
  v_attempts integer;
  v_started  timestamptz;
  v_now_iso  text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if p_step is null or p_step not in ('analyze', 'write', 'verify') then
    raise exception 'selfeval_step_unknown' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 101));

  select * into v_session
    from public.selfeval_sessions s
   where s.id = p_session_id and s.profile_id = p_profile_id
     for update;

  if not found then
    return jsonb_build_object('kind', 'locked');
  end if;

  if v_session.status not in ('draft', 'in_progress') then
    return jsonb_build_object('kind', 'locked');
  end if;

  if (v_session.step_state -> 'terminal') is not null
     and jsonb_typeof(v_session.step_state -> 'terminal') <> 'null' then
    return jsonb_build_object('kind', 'locked');
  end if;

  -- 순서 가드(명세 No.65): 분석은 활동 선택 확정 뒤, 생성은 분석 뒤, 검증은 생성 뒤에만 한다.
  v_min_step := case p_step when 'analyze' then 2 when 'write' then 3 else 4 end;
  if v_session.current_step < v_min_step then
    return jsonb_build_object('kind', 'order', 'currentStep', v_session.current_step);
  end if;

  v_rec := v_session.step_state -> 'steps' -> p_step;

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

  update public.selfeval_sessions s
     set step_state = jsonb_set(
           coalesce(s.step_state, '{}'::jsonb),
           '{steps}',
           coalesce(s.step_state -> 'steps', '{}'::jsonb)
             || jsonb_build_object(
                  p_step,
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
         status = case when s.status = 'draft' then 'in_progress' else s.status end,
         last_activity_at = now(),
         updated_at = now()
   where s.id = p_session_id;

  return jsonb_build_object('kind', 'claimed', 'attempts', v_attempts + 1);
end;
$$;

comment on function public.fn_selfeval_claim_step(uuid, uuid, text, integer) is
  '자기평가서 단계 선점. 프로필 advisory 잠금(101) 뒤 세션 행을 for update 로 읽어 단계를 running 으로 표시한다. 반환 kind 어휘: claimed(attempts)/locked/order(currentStep)/running/exhausted(attempts). 순서 가드는 current_step 기준으로 analyze 2 이상, write 3 이상, verify 4 이상이다(명세 No.65). 이미 ok 인 단계도 다시 선점할 수 있다(재분석, 재생성, 재검증). 시도 상한은 단계당 10(No.89). startedAt 이 p_stale_seconds 보다 오래된 running 은 서버리스 중단으로 보고 다시 선점한다. draft 세션은 in_progress 로 올린다. p_step 이 analyze, write, verify 밖이면 예외(selfeval_step_unknown).';

revoke all on function public.fn_selfeval_claim_step(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.fn_selfeval_claim_step(uuid, uuid, text, integer) to service_role;

-- 2) 단계 종료 ----------------------------------------------------------------
-- p_patch 는 허용 키만 반영한다(current_step, regenerate_increment, report, analyses).
-- 리포트는 이력이라 덮어쓰지 않고 같은 (세션, 유형)의 다음 revision 으로 쌓는다.
create or replace function public.fn_selfeval_finish_step(
  p_session_id uuid,
  p_profile_id uuid,
  p_step text,
  p_ok boolean,
  p_patch jsonb default '{}'::jsonb,
  p_issues jsonb default '[]'::jsonb,
  p_extra_attempts integer default 0
) returns boolean
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_session  public.selfeval_sessions;
  v_rec      jsonb;
  v_attempts integer;
  v_now_iso  text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_new_rec  jsonb;
  v_state    jsonb;
  v_patch    jsonb := coalesce(p_patch, '{}'::jsonb);
  v_report   jsonb;
  v_step_to  integer;
  v_regen    boolean;
  v_item     jsonb;
begin
  if p_step is null or p_step not in ('analyze', 'write', 'verify') then
    raise exception 'selfeval_step_unknown' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 101));

  select * into v_session
    from public.selfeval_sessions s
   where s.id = p_session_id and s.profile_id = p_profile_id
     for update;

  if not found then
    return false;
  end if;

  if v_session.status not in ('draft', 'in_progress') then
    return false;
  end if;

  v_rec := v_session.step_state -> 'steps' -> p_step;

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

  v_state := jsonb_set(
    coalesce(v_session.step_state, '{}'::jsonb),
    '{steps}',
    coalesce(v_session.step_state -> 'steps', '{}'::jsonb)
      || jsonb_build_object(p_step, v_new_rec),
    true
  );

  if not p_ok then
    update public.selfeval_sessions s
       set step_state = v_state,
           last_activity_at = now(),
           updated_at = now()
     where s.id = p_session_id;
    return true;
  end if;

  v_step_to := case when v_patch ? 'current_step' then (v_patch ->> 'current_step')::integer else null end;
  v_regen := coalesce((v_patch ->> 'regenerate_increment')::boolean, false);

  update public.selfeval_sessions s
     set step_state = v_state,
         current_step = greatest(s.current_step, coalesce(v_step_to, s.current_step))::smallint,
         regenerate_count = s.regenerate_count + case when v_regen then 1 else 0 end,
         last_activity_at = now(),
         updated_at = now()
   where s.id = p_session_id;

  v_report := v_patch -> 'report';
  if v_report is not null and jsonb_typeof(v_report) = 'object' then
    insert into public.selfeval_reports (
      session_id, profile_id, report_type, revision,
      sections, char_count, score, mandatory_fixes
    )
    values (
      p_session_id, p_profile_id, v_report ->> 'report_type',
      coalesce((
        select max(r.revision) from public.selfeval_reports r
         where r.session_id = p_session_id and r.report_type = v_report ->> 'report_type'
      ), 0) + 1,
      v_report -> 'sections',
      v_report -> 'char_count',
      (v_report ->> 'score')::integer,
      v_report -> 'mandatory_fixes'
    );
  end if;

  if jsonb_typeof(v_patch -> 'analyses') = 'array' then
    for v_item in select * from jsonb_array_elements(v_patch -> 'analyses')
    loop
      update public.selfeval_session_activities a
         set analysis = v_item -> 'analysis',
             analysis_source = v_item ->> 'analysis_source',
             updated_at = now()
       where a.session_id = p_session_id
         and a.activity_record_id = (v_item ->> 'activity_record_id')::uuid;
    end loop;
  end if;

  return true;
end;
$$;

comment on function public.fn_selfeval_finish_step(uuid, uuid, text, boolean, jsonb, jsonb, integer) is
  '자기평가서 단계 종료. 선점한 running 단계를 ok 또는 failed 로 닫는다. 반환 boolean: true 는 반영됨, false 는 행 없음, 세션이 draft/in_progress 아님, 단계가 running 아님(다른 요청이 끝냈거나 stale 선점이 덮어씀). p_ok 면 p_patch 허용 키만 반영하고 허용 밖 키는 무시한다. current_step(정수, greatest 로만 올림), regenerate_increment(true 면 regenerate_count 1 증가, 상한 3 은 호출자가 검사하고 CHECK 가 최종 방어), report({report_type, sections, char_count, score, mandatory_fixes}, selfeval_reports 에 같은 세션과 유형의 max(revision)+1 로 insert), analyses(배열 {activity_record_id, analysis, analysis_source}, selfeval_session_activities 갱신). 실패면 issues 를 p_issues 로 기록하고 그 밖은 건드리지 않는다. attempts 는 선점 때 이미 1 올라가 있고 p_extra_attempts 를 더 더한다.';

revoke all on function public.fn_selfeval_finish_step(uuid, uuid, text, boolean, jsonb, jsonb, integer) from public, anon, authenticated;
grant execute on function public.fn_selfeval_finish_step(uuid, uuid, text, boolean, jsonb, jsonb, integer) to service_role;

-- 3) 세션 종결 ----------------------------------------------------------------
-- 시도 상한 초과나 학생의 파기로 더 진행할 수 없는 세션을 archived 로 닫고 terminal 사유를 남긴다.
-- 파기는 특정 단계에서 일어난 일이 아니므로 p_step 은 null 을 허용한다.
-- 차감 원장이 있고 아직 환원 전이면 needsReverse 로 알려, 호출자가 환원을 이어서 처리한다.
create or replace function public.fn_selfeval_terminate_session(
  p_session_id uuid,
  p_profile_id uuid,
  p_step text,
  p_reason text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.selfeval_sessions;
  v_now_iso text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if p_step is not null and p_step not in ('analyze', 'write', 'verify') then
    raise exception 'selfeval_step_unknown' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 101));

  select * into v_session
    from public.selfeval_sessions s
   where s.id = p_session_id and s.profile_id = p_profile_id
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_session.status not in ('draft', 'in_progress') then
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;

  update public.selfeval_sessions s
     set status = 'archived',
         step_state = jsonb_set(
           coalesce(s.step_state, '{}'::jsonb),
           '{terminal}',
           jsonb_build_object('reason', p_reason, 'at', v_now_iso, 'step', p_step),
           true
         ),
         last_activity_at = now(),
         updated_at = now()
   where s.id = p_session_id;

  return jsonb_build_object(
    'ok', true,
    'needsReverse', (v_session.ledger_id is not null and v_session.ledger_reversed_at is null),
    'ledgerId', v_session.ledger_id
  );
end;
$$;

comment on function public.fn_selfeval_terminate_session(uuid, uuid, text, text) is
  '자기평가서 세션 종결. draft 또는 in_progress 세션을 archived 로 바꾸고 step_state.terminal 에 {reason, at, step} 을 병합한다(steps 는 보존). p_step 은 파기처럼 단계가 없는 종결을 위해 null 을 허용한다. 반환 jsonb: {ok:false, reason:not_found}(행 없음)/{ok:false, reason:not_open}(draft, in_progress 아님)/{ok:true, needsReverse, ledgerId}. needsReverse 는 ledger_id 가 있고 ledger_reversed_at 이 비어 있을 때 true 다. 프로필 advisory 잠금(101) 뒤 세션 행을 for update 로 잡는다.';

revoke all on function public.fn_selfeval_terminate_session(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.fn_selfeval_terminate_session(uuid, uuid, text, text) to service_role;

-- 4) 최종 저장 ----------------------------------------------------------------
-- 한 트랜잭션에서 final 리포트 insert, activity_records 승격(7항목), 세션 완료를 한다.
-- 승격은 (source_program, source_ref_id) 부분 유니크를 충돌 키로 써서 upsert 한다. 응답 유실 뒤
-- 재요청이 와도 같은 행을 갱신하므로 중복 승격이 생기지 않는다(명세 No.18, No.65).
create or replace function public.fn_selfeval_finalize(
  p_session_id uuid,
  p_profile_id uuid,
  p_promoted jsonb,
  p_sections jsonb,
  p_char_count jsonb,
  p_score integer
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_session   public.selfeval_sessions;
  v_revision  integer;
  v_record_id uuid;
  v_group     text;
  v_subject   text;
  v_promoted  jsonb := coalesce(p_promoted, '{}'::jsonb);
begin
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 101));

  select * into v_session
    from public.selfeval_sessions s
   where s.id = p_session_id and s.profile_id = p_profile_id
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- 멱등: 이미 완료된 세션은 다시 쓰지 않는다. completed 는 in_progress 가 아니므로 먼저 본다.
  if v_session.status = 'completed' then
    select a.id into v_record_id
      from public.activity_records a
     where a.source_program = 'self' and a.source_ref_id = p_session_id;

    select max(r.revision) into v_revision
      from public.selfeval_reports r
     where r.session_id = p_session_id and r.report_type = 'final';

    return jsonb_build_object(
      'ok', true, 'reason', 'already_completed',
      'activityRecordId', v_record_id, 'finalRevision', v_revision
    );
  end if;

  if v_session.status <> 'in_progress' or v_session.current_step < 5 then
    return jsonb_build_object('ok', false, 'reason', 'not_ready');
  end if;

  select coalesce(max(r.revision), 0) + 1 into v_revision
    from public.selfeval_reports r
   where r.session_id = p_session_id and r.report_type = 'final';

  insert into public.selfeval_reports (
    session_id, profile_id, report_type, revision, sections, char_count, score
  )
  values (
    p_session_id, p_profile_id, 'final', v_revision, p_sections, p_char_count, p_score
  );

  -- 교과면 과목명이 구분이고, 창체면 영역 라벨이 구분이다. subject 는 교과면 과목명, 창체면 활동명.
  v_group := case v_session.area
    when 'subject' then v_session.subject
    when 'autonomy' then '자율'
    when 'club' then '동아리'
    when 'career' then '진로'
    else null
  end;
  v_subject := case when v_session.area = 'subject' then v_session.subject else v_session.activity_name end;

  insert into public.activity_records (
    profile_id, source_program, source_ref_id, status, grade_label, semester,
    subject_group, subject, topic, concept, method, result, limitation,
    numbers, sources, confirmed_at
  )
  values (
    p_profile_id, 'self', p_session_id, 'final', v_session.grade_label, v_session.semester,
    v_group, v_subject,
    v_promoted ->> 'topic', v_promoted ->> 'concept', v_promoted ->> 'method',
    v_promoted ->> 'result', v_promoted ->> 'limitation',
    v_promoted -> 'numbers', v_promoted -> 'sources', now()
  )
  on conflict (source_program, source_ref_id) where source_ref_id is not null
  do update set
    status = excluded.status,
    grade_label = excluded.grade_label,
    semester = excluded.semester,
    subject_group = excluded.subject_group,
    subject = excluded.subject,
    topic = excluded.topic,
    concept = excluded.concept,
    method = excluded.method,
    result = excluded.result,
    limitation = excluded.limitation,
    numbers = excluded.numbers,
    sources = excluded.sources,
    confirmed_at = excluded.confirmed_at,
    updated_at = now()
  returning id into v_record_id;

  update public.selfeval_sessions s
     set status = 'completed',
         current_step = 6,
         completed_at = now(),
         last_activity_at = now(),
         updated_at = now()
   where s.id = p_session_id;

  return jsonb_build_object(
    'ok', true, 'reason', 'completed',
    'activityRecordId', v_record_id, 'finalRevision', v_revision
  );
end;
$$;

comment on function public.fn_selfeval_finalize(uuid, uuid, jsonb, jsonb, jsonb, integer) is
  '자기평가서 최종 저장(6단계). 한 트랜잭션에서 final 리포트 insert(revision max+1), activity_records 승격(source_program=self, source_ref_id=세션 id, status=final, 7항목은 p_promoted 의 topic, concept, method, result, limitation, numbers, sources), 세션 completed 와 current_step 6 기록을 한다. 승격은 (source_program, source_ref_id) 충돌 시 갱신해 재요청에도 중복되지 않는다. 반환 jsonb: {ok:false, reason:not_found}/{ok:false, reason:not_ready}(in_progress 아님 또는 current_step 5 미만)/{ok:true, reason:already_completed, activityRecordId, finalRevision}(멱등)/{ok:true, reason:completed, activityRecordId, finalRevision}.';

revoke all on function public.fn_selfeval_finalize(uuid, uuid, jsonb, jsonb, jsonb, integer) from public, anon, authenticated;
grant execute on function public.fn_selfeval_finalize(uuid, uuid, jsonb, jsonb, jsonb, integer) to service_role;
