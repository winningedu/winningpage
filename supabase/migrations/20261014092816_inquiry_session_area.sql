-- 심화탐구 제출 영역(교과, 자율, 동아리, 진로) 선택.
--
-- 제출처를 과목명 자유 입력에서 영역 선택으로 바꾼다. 교과면 과목명이 필수이고, 그 외 영역은
-- 활동명을 선택 입력으로 받는다. 기존 행은 기본값(교과)을 유지하므로 데이터 이전이 필요 없다.
-- 확정 RPC(fn_inquiry_finalize)는 영역에 따라 활동 기록의 구분과 subject 를 정한다.

alter table public.inquiry_sessions
  add column area text not null default 'subject'
    check (area in ('subject', 'autonomy', 'club', 'career')),
  add column activity_name text;

alter table public.inquiry_sessions
  alter column subject drop not null;

alter table public.inquiry_sessions
  add constraint inquiry_sessions_subject_required_for_subject_area
    check ((area = 'subject' and subject is not null) or (area <> 'subject'));

comment on column public.inquiry_sessions.area is
  '제출 영역. subject(교과, 과목명 필수) / autonomy(자율활동) / club(동아리활동) / career(진로활동). 기본값 subject 라 기존 세션은 교과로 남는다.';
comment on column public.inquiry_sessions.subject is
  '교과 영역(area=subject)일 때의 과목명. 그 외 영역은 null 이다. 교과인데 null 이면 check 제약이 막는다.';
comment on column public.inquiry_sessions.activity_name is
  '교과가 아닌 영역(area<>subject)의 활동명. 선택 입력이라 비어 있을 수 있고 교과 영역에서는 null 이다.';

-- 시그니처는 그대로이고 본문만 바뀐다. 권한(grant)은 create or replace 가 유지한다.
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
  v_group     text;
  v_subject   text;
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

  -- 교과면 구분은 '교과'이고 subject 는 과목명이다(심화탐구 assets.ts 의 SUBJECT_GROUP 이 이 값을 읽는다).
  -- 그 외 영역은 구분이 영역 라벨이고 subject 는 활동명(없으면 null)이다.
  v_group := case v_session.area
    when 'subject' then '교과'
    when 'autonomy' then '자율'
    when 'club' then '동아리'
    when 'career' then '진로'
    else null
  end;
  v_subject := case when v_session.area = 'subject' then v_session.subject else v_session.activity_name end;

  insert into public.activity_records (
    profile_id, source_program, source_ref_id, status,
    grade_label, semester, subject_group, subject,
    topic, concept, method, result, limitation, numbers, sources, confirmed_at
  ) values (
    p_profile_id, 'deep', p_session_id, 'confirmed',
    v_session.grade_label, v_session.semester, v_group, v_subject,
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
  '심화탐구 확정. 한 트랜잭션에서 activity_records 적립(source_program deep, source_ref_id 세션 id, status confirmed), inquiry_reports final 행 저장, 세션 completed 전환(current_step 6, completed_at, final_report_id)을 한다. 활동 기록의 subject_group 과 subject 는 세션 영역을 따른다: 교과는 ''교과'' 와 과목명, 자율은 ''자율'', 동아리는 ''동아리'', 진로는 ''진로'' 이고 subject 에는 활동명(없으면 null). p_fields 는 topic, concept, method, result, limitation(공백 아닌 문자열 필수), numbers, sources(jsonb 배열, 없으면 빈 배열). 반환 status 어휘: completed(activityRecordId, finalReportId)/already_completed(멱등, 같은 두 id)/session_not_found/not_ready(in_progress 아님 또는 평가 없음)/fields_missing(missing 배열). 성장설계 과제 회신은 하지 않는다(호출부 몫). 프로필 advisory 잠금(101) 뒤 세션 행을 for update 로 잡는다.';
