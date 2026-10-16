-- 심화탐구 확정 RPC (명세 No.103~106, 25).
--
-- 확정은 세 가지가 한꺼번에 일어나야 한다: 활동 기록(activity_records) 적립, 확정 리포트
-- (inquiry_reports final) 저장, 세션 completed 전환. supabase-js 는 여러 문장을 한 트랜잭션으로
-- 묶지 못하므로 함수 하나로 감싼다. 잠금 순서는 다른 inquiry RPC 와 같다(프로필 advisory 101,
-- 그 뒤 세션 행 for update).
--
-- 멱등: 응답이 유실돼 다시 불려도 같은 결과를 돌려준다. 이미 completed 면 기존 final_report_id 와
-- 적립된 활동 기록 id 를 찾아 already_completed 로 답하고 아무것도 다시 쓰지 않는다.
-- 활동 기록은 (source_program, source_ref_id) 부분 유니크가 이중 적립을 막는다.
--
-- 성장설계 과제 완료 회신(completePlanItemFromProgram)은 이 함수가 하지 않는다. 호출부(앱)가
-- 성공 뒤 같은 요청 안에서 부르고, 실패하면 reply_pending 을 세운다.
create or replace function public.fn_inquiry_finalize(
  p_session_id uuid,
  p_profile_id uuid,
  p_fields jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_session   public.inquiry_sessions;
  v_fields    jsonb := coalesce(p_fields, '{}'::jsonb);
  v_missing   text[] := '{}';
  v_key       text;
  v_numbers   jsonb;
  v_sources   jsonb;
  v_record_id uuid;
  v_report_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 101));

  select * into v_session
    from public.inquiry_sessions s
   where s.id = p_session_id and s.profile_id = p_profile_id
     for update;

  if not found then
    return jsonb_build_object('status', 'session_not_found');
  end if;

  -- 멱등. completed 는 in_progress 가 아니므로 not_ready 보다 먼저 본다.
  if v_session.status = 'completed' then
    select a.id into v_record_id
      from public.activity_records a
     where a.source_program = 'deep' and a.source_ref_id = p_session_id;

    return jsonb_build_object(
      'status', 'already_completed',
      'activityRecordId', v_record_id,
      'finalReportId', v_session.final_report_id
    );
  end if;

  if v_session.status <> 'in_progress' or v_session.latest_evaluation_id is null then
    return jsonb_build_object('status', 'not_ready');
  end if;

  -- 7항목 중 문자열 5개는 비어 있으면 안 된다. 배열 2개(numbers, sources)는 비어도 된다.
  foreach v_key in array array['topic', 'concept', 'method', 'result', 'limitation'] loop
    if coalesce(btrim(v_fields ->> v_key), '') = '' then
      v_missing := v_missing || v_key;
    end if;
  end loop;

  if cardinality(v_missing) > 0 then
    return jsonb_build_object('status', 'fields_missing', 'missing', to_jsonb(v_missing));
  end if;

  v_numbers := case when jsonb_typeof(v_fields -> 'numbers') = 'array'
                    then v_fields -> 'numbers' else '[]'::jsonb end;
  v_sources := case when jsonb_typeof(v_fields -> 'sources') = 'array'
                    then v_fields -> 'sources' else '[]'::jsonb end;

  insert into public.activity_records (
    profile_id, source_program, source_ref_id, status,
    grade_label, semester, subject_group, subject,
    topic, concept, method, result, limitation, numbers, sources, confirmed_at
  ) values (
    p_profile_id, 'deep', p_session_id, 'confirmed',
    v_session.grade_label, v_session.semester, '교과', v_session.subject,
    btrim(v_fields ->> 'topic'), btrim(v_fields ->> 'concept'),
    btrim(v_fields ->> 'method'), btrim(v_fields ->> 'result'),
    btrim(v_fields ->> 'limitation'), v_numbers, v_sources, now()
  )
  on conflict (source_program, source_ref_id) where source_ref_id is not null do nothing;

  select a.id into v_record_id
    from public.activity_records a
   where a.source_program = 'deep' and a.source_ref_id = p_session_id;

  -- 확정 리포트는 세션당 1건(부분 유니크). 이미 있으면 그 행을 쓴다.
  insert into public.inquiry_reports (
    session_id, profile_id, report_type, topic_id, sections
  ) values (
    p_session_id, p_profile_id, 'final', v_session.selected_topic_id, v_fields
  )
  on conflict (session_id) where report_type = 'final' do nothing;

  select r.id into v_report_id
    from public.inquiry_reports r
   where r.session_id = p_session_id and r.report_type = 'final';

  update public.inquiry_sessions s
     set status = 'completed',
         completed_at = now(),
         current_step = 6,
         final_report_id = v_report_id,
         last_activity_at = now(),
         updated_at = now()
   where s.id = p_session_id;

  return jsonb_build_object(
    'status', 'completed',
    'activityRecordId', v_record_id,
    'finalReportId', v_report_id
  );
end;
$$;

comment on function public.fn_inquiry_finalize(uuid, uuid, jsonb) is
  '심화탐구 확정. 한 트랜잭션에서 activity_records 적립(source_program deep, source_ref_id 세션 id, status confirmed), inquiry_reports final 행 저장, 세션 completed 전환(current_step 6, completed_at, final_report_id)을 한다. p_fields 는 topic, concept, method, result, limitation(공백 아닌 문자열 필수), numbers, sources(jsonb 배열, 없으면 빈 배열). 반환 status 어휘: completed(activityRecordId, finalReportId)/already_completed(멱등, 같은 두 id)/session_not_found/not_ready(in_progress 아님 또는 평가 없음)/fields_missing(missing 배열). 성장설계 과제 회신은 하지 않는다(호출부 몫). 프로필 advisory 잠금(101) 뒤 세션 행을 for update 로 잡는다.';

revoke all on function public.fn_inquiry_finalize(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fn_inquiry_finalize(uuid, uuid, jsonb) to service_role;
