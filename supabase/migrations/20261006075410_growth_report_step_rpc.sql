-- 성장설계 리포트 생성(P4) 단계 선점, 종료, 완료 RPC.
--
-- 왜 RPC 인가
--   1) supabase-js 는 여러 문장을 한 트랜잭션으로 묶는 수단이 없다. 단계 상태 갱신, 결과 컬럼
--      반영, 계획 항목 insert, 프로필 upsert 를 원자적으로 하려면 함수 하나로 감싸야 한다.
--   2) 같은 학생의 동시 요청(더블클릭, 다중 탭, 재시도)을 직렬화한다. 잠금은 차감 RPC 와 같은
--      advisory(salt 101, 프로필 단위)이고 그 뒤에 회차 행을 for update 로 잡아 순서를 공유한다.
--   3) 서버리스 함수는 중간에 끊길 수 있다. 선점한 단계가 running 으로 남으면 영영 막히므로
--      startedAt 이 p_stale_seconds 보다 오래된 running 은 다시 선점할 수 있게 한다(stale 복구).
--      이때 이전 요청이 뒤늦게 끝을 보고하면 fn_growth_finish_step 이 running 이 아니거나
--      덮어쓴 선점이라 false 를 돌려 결과 반영을 막는다.
--
-- 시도 상한 10 의 출처
--   No.89. 단계당 모델 호출 누계(성공과 실패 합산)가 10 에 도달하면 더 선점할 수 없다.
--   api/_lib/growth/validation.ts 의 MAX_MODEL_ATTEMPTS_PER_STEP 과 같은 값이다.
--
-- jsonb 키는 api/_lib/growth/report/types.ts 의 StepRecord, ClaimResult 와 같다.
--   StepRecord: status, attempts, startedAt, finishedAt, issues
--   ClaimResult.kind: claimed, done, locked, order, running, exhausted

-- 1) 단계 선점 ----------------------------------------------------------------
create or replace function public.fn_growth_claim_step(
  p_report_id uuid,
  p_profile_id uuid,
  p_step smallint,
  p_stale_seconds integer default 120
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  c_max_attempts constant integer := 10;

  v_report   public.growth_reports;
  v_rec      jsonb;
  v_prev     jsonb;
  v_attempts integer;
  v_started  timestamptz;
  v_now_iso  text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if p_step is null or p_step < 1 or p_step > 8 then
    raise exception 'growth_step_out_of_range' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 101));

  select * into v_report
    from public.growth_reports r
   where r.id = p_report_id and r.profile_id = p_profile_id
     for update;

  if not found then
    return jsonb_build_object('kind', 'locked');
  end if;

  if v_report.status not in ('draft', 'in_progress') then
    return jsonb_build_object('kind', 'locked');
  end if;

  if (v_report.step_state -> 'terminal') is not null
     and jsonb_typeof(v_report.step_state -> 'terminal') <> 'null' then
    return jsonb_build_object('kind', 'locked');
  end if;

  v_rec := v_report.step_state -> 'steps' -> (p_step::text);

  if v_rec ->> 'status' = 'ok' then
    return jsonb_build_object('kind', 'done');
  end if;

  if p_step > 1 then
    v_prev := v_report.step_state -> 'steps' -> ((p_step - 1)::text);
    if v_prev is null or v_prev ->> 'status' is distinct from 'ok' then
      return jsonb_build_object('kind', 'order', 'currentStep', v_report.current_step);
    end if;
  end if;

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

  update public.growth_reports r
     set step_state = jsonb_set(
           coalesce(r.step_state, '{}'::jsonb),
           '{steps}',
           coalesce(r.step_state -> 'steps', '{}'::jsonb)
             || jsonb_build_object(
                  p_step::text,
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
         status = case when r.status = 'draft' then 'in_progress' else r.status end,
         last_activity_at = now(),
         updated_at = now()
   where r.id = p_report_id;

  return jsonb_build_object('kind', 'claimed', 'attempts', v_attempts + 1);
end;
$$;

comment on function public.fn_growth_claim_step(uuid, uuid, smallint, integer) is
  '성장설계 단계 선점(P4). 프로필 advisory 잠금(101) 뒤 회차 행을 for update 로 읽어 단계를 running 으로 표시한다. 반환 kind 어휘: claimed(attempts)/done/locked/order(currentStep)/running/exhausted(attempts). 시도 상한은 단계당 10(No.89). startedAt 이 p_stale_seconds 보다 오래된 running 은 서버리스 중단으로 보고 다시 선점한다. draft 회차는 in_progress 로 올린다. p_step 이 1~8 밖이면 예외.';

revoke all on function public.fn_growth_claim_step(uuid, uuid, smallint, integer) from public, anon, authenticated;
grant execute on function public.fn_growth_claim_step(uuid, uuid, smallint, integer) to service_role;

-- 2) 단계 종료 ----------------------------------------------------------------
-- p_patch 는 허용 키만 컬럼에 반영한다(signals, narrative_theme, grade_subthemes, stage,
-- axis_scores, consistency, sections 는 해당 컬럼, planDraft 는 step_state.planDraft).
-- 반영은 키 단위 덮어쓰기라 컬럼의 기존 값을 합치지 않는다. 여러 단계가 같은 컬럼을 나눠 쓰는
-- 경우(signals, sections)는 호출자가 합쳐진 전체 값을 보내야 한다.
create or replace function public.fn_growth_finish_step(
  p_report_id uuid,
  p_profile_id uuid,
  p_step smallint,
  p_ok boolean,
  p_patch jsonb default '{}'::jsonb,
  p_issues jsonb default '[]'::jsonb,
  p_extra_attempts integer default 0
) returns boolean
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_report   public.growth_reports;
  v_rec      jsonb;
  v_attempts integer;
  v_now_iso  text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_new_rec  jsonb;
  v_state    jsonb;
  v_patch    jsonb := coalesce(p_patch, '{}'::jsonb);
begin
  if p_step is null or p_step < 1 or p_step > 8 then
    raise exception 'growth_step_out_of_range' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 101));

  select * into v_report
    from public.growth_reports r
   where r.id = p_report_id and r.profile_id = p_profile_id
     for update;

  if not found then
    return false;
  end if;

  if v_report.status not in ('draft', 'in_progress') then
    return false;
  end if;

  v_rec := v_report.step_state -> 'steps' -> (p_step::text);

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
    coalesce(v_report.step_state, '{}'::jsonb),
    '{steps}',
    coalesce(v_report.step_state -> 'steps', '{}'::jsonb)
      || jsonb_build_object(p_step::text, v_new_rec),
    true
  );

  if not p_ok then
    update public.growth_reports r
       set step_state = v_state,
           last_activity_at = now(),
           updated_at = now()
     where r.id = p_report_id;
    return true;
  end if;

  if v_patch ? 'planDraft' then
    v_state := jsonb_set(v_state, '{planDraft}', v_patch -> 'planDraft', true);
  end if;

  update public.growth_reports r
     set step_state = v_state,
         current_step = greatest(r.current_step, p_step)::smallint,
         signals = case when v_patch ? 'signals' then v_patch -> 'signals' else r.signals end,
         narrative_theme = case when v_patch ? 'narrative_theme' then v_patch ->> 'narrative_theme' else r.narrative_theme end,
         grade_subthemes = case when v_patch ? 'grade_subthemes' then v_patch -> 'grade_subthemes' else r.grade_subthemes end,
         stage = case when v_patch ? 'stage' then v_patch ->> 'stage' else r.stage end,
         axis_scores = case when v_patch ? 'axis_scores' then v_patch -> 'axis_scores' else r.axis_scores end,
         consistency = case when v_patch ? 'consistency' then v_patch -> 'consistency' else r.consistency end,
         sections = case when v_patch ? 'sections' then v_patch -> 'sections' else r.sections end,
         last_activity_at = now(),
         updated_at = now()
   where r.id = p_report_id;

  return true;
end;
$$;

comment on function public.fn_growth_finish_step(uuid, uuid, smallint, boolean, jsonb, jsonb, integer) is
  '성장설계 단계 종료(P4). 선점한 running 단계를 ok 또는 failed 로 닫는다. 반환 boolean: true 는 반영됨, false 는 행 없음, 회차가 draft/in_progress 아님, 단계가 running 아님(다른 요청이 끝냈거나 stale 선점이 덮어씀). p_ok 면 current_step 을 올리고 p_patch 허용 키(signals, narrative_theme, grade_subthemes, stage, axis_scores, consistency, sections, planDraft)만 반영하며 허용 밖 키는 무시한다. 실패면 issues 를 p_issues 로 기록하고 current_step 은 유지한다. attempts 는 선점 때 이미 1 올라가 있고 p_extra_attempts 를 더 더한다.';

revoke all on function public.fn_growth_finish_step(uuid, uuid, smallint, boolean, jsonb, jsonb, integer) from public, anon, authenticated;
grant execute on function public.fn_growth_finish_step(uuid, uuid, smallint, boolean, jsonb, jsonb, integer) to service_role;

-- 3) 회차 완료 ----------------------------------------------------------------
-- growth_plan_items 에는 insert 를 막는 트리거가 없다. 있는 트리거는 before update 가드
-- (fn_growth_plan_items_guard_student_update)뿐이고 그것도 auth.role() 이 authenticated 가
-- 아니면 통과한다. RLS 는 insert 정책이 없어 authenticated 는 막히지만, 이 함수는 security
-- definer 로 소유자 권한에서 실행되고 호출자도 service_role 이라 둘 다 문제없이 insert 된다.
--
-- 이월 처리: carried_from_report_id 가 있는 항목은 이전 회차 원본 항목에서 이어진 것이다.
-- 원본 pending 항목은 지우지도 바꾸지도 않는다(이력 보존). 새 회차 항목만 추가한다.
create or replace function public.fn_growth_complete_report(
  p_report_id uuid,
  p_profile_id uuid,
  p_sections jsonb,
  p_plan_items jsonb,
  p_profile jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_report    public.growth_reports;
  v_rec8      jsonb;
  v_issued_at timestamptz;
  v_now_iso   text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_items     jsonb := coalesce(p_plan_items, '[]'::jsonb);
  v_count     integer := 0;
begin
  if jsonb_typeof(v_items) is distinct from 'array' then
    raise exception 'growth_plan_items_not_array' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 101));

  select * into v_report
    from public.growth_reports r
   where r.id = p_report_id and r.profile_id = p_profile_id
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_ready');
  end if;

  -- 멱등: 이미 완료된 회차는 다시 쓰지 않는다. completed 는 in_progress 가 아니므로 먼저 본다.
  if v_report.status = 'completed' then
    return jsonb_build_object('ok', true, 'reason', 'already_completed');
  end if;

  if v_report.status <> 'in_progress'
     or v_report.step_state -> 'steps' -> '7' ->> 'status' is distinct from 'ok' then
    return jsonb_build_object('ok', false, 'reason', 'not_ready');
  end if;

  v_rec8 := v_report.step_state -> 'steps' -> '8';
  v_issued_at := now();

  update public.growth_reports r
     set sections = p_sections,
         status = 'completed',
         current_step = 8,
         issued_at = v_issued_at,
         step_state = jsonb_set(
           coalesce(r.step_state, '{}'::jsonb),
           '{steps}',
           coalesce(r.step_state -> 'steps', '{}'::jsonb)
             || jsonb_build_object(
                  '8',
                  jsonb_build_object(
                    'status', 'ok',
                    'attempts', coalesce((v_rec8 ->> 'attempts')::integer, 0) + 1,
                    'startedAt', v_now_iso,
                    'finishedAt', v_now_iso,
                    'issues', '[]'::jsonb
                  )
                ),
           true
         ),
         last_activity_at = now(),
         updated_at = now()
   where r.id = p_report_id;

  insert into public.growth_plan_items (
    report_id, profile_id, program, title, description, priority, axis, category,
    period, period_label, deadline, carried_from_report_id, sort_order
  )
  select
    p_report_id, p_profile_id, i.program, i.title, i.description, i.priority, i.axis, i.category,
    i.period, i.period_label, i.deadline, i.carried_from_report_id, coalesce(i.sort_order, 0)
    from jsonb_to_recordset(v_items) as i(
      program text,
      title text,
      description text,
      priority text,
      axis text,
      category text,
      period text,
      period_label text,
      deadline date,
      carried_from_report_id uuid,
      sort_order integer
    );

  get diagnostics v_count = row_count;

  if p_profile is not null and jsonb_typeof(p_profile) = 'object' then
    insert into public.growth_profiles (profile_id, track, survey_answers, survey_saved_at)
    values (
      p_profile_id,
      p_profile ->> 'track',
      coalesce(p_profile -> 'survey_answers', '{}'::jsonb),
      (p_profile ->> 'survey_saved_at')::timestamptz
    )
    on conflict (profile_id) do update
      set track = coalesce(excluded.track, public.growth_profiles.track),
          survey_answers = excluded.survey_answers,
          survey_saved_at = excluded.survey_saved_at,
          updated_at = now();
  end if;

  return jsonb_build_object(
    'ok', true,
    'reason', 'completed',
    'issuedAt', v_issued_at,
    'planItemCount', v_count
  );
end;
$$;

comment on function public.fn_growth_complete_report(uuid, uuid, jsonb, jsonb, jsonb) is
  '성장설계 회차 완료(P4 8단계). 한 트랜잭션에서 sections 확정, status completed, current_step 8, issued_at 기록, 8단계 ok 기록, growth_plan_items insert, growth_profiles upsert 를 한다. 반환 jsonb: {ok:false, reason:not_ready}(행 없음, in_progress 아님, 7단계 ok 아님)/{ok:true, reason:already_completed}(멱등)/{ok:true, reason:completed, issuedAt, planItemCount}. p_plan_items 는 report_id, profile_id 없는 배열이며 둘은 인자로 채운다. 이월 항목의 원본은 건드리지 않는다. p_profile 의 profile_id 는 인자로 강제한다.';

revoke all on function public.fn_growth_complete_report(uuid, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.fn_growth_complete_report(uuid, uuid, jsonb, jsonb, jsonb) to service_role;

comment on column public.growth_reports.step_state is
  '성장설계 리포트 생성 단계 상태(api/_lib/growth/report/types.ts 의 StepState 와 같은 키). steps 는 키 "1"~"8" 에 {status(pending/running/ok/failed), attempts, startedAt, finishedAt, issues} 를 담는다. planDraft 는 7단계가 만든 실행계획 초안이고 8단계가 growth_plan_items 로 옮긴다. terminal 은 {reason, at, step} 형태의 종결 실패다. 재시도와 장애 추적용이며 결과 데이터는 각 결과 컬럼에 둔다.';
