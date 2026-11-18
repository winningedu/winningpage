-- 수행평가 최종본을 확정할 때 activity_records 에 승격한다.
-- 심화탐구와 자기평가서 확정 함수는 이미 승격하고 수행평가만 빠져 있어, 최종본이
-- 「위닝 기록에서 불러오기」에 나타나지 않았다. 함수 본문은 직전 정의에서 승격 insert 하나만 더한 것이다.

CREATE OR REPLACE FUNCTION "public"."finalize_performance_submission"("p_session_id" "uuid", "p_profile_id" "uuid", "p_submission_id" "uuid", "p_reason" "text", "p_sections" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_owns         boolean;
  v_revision     smallint;
  v_is_final     boolean;
  v_finalized_at timestamptz;
  v_reason       text;
  v_other_id     uuid;
  v_eval_ok      boolean;
  v_report_id    uuid;
begin
  if p_reason is null or p_reason not in ('confirm', 'new_assessment') then
    return jsonb_build_object('status', 'invalid_reason');
  end if;

  -- ── 1) 세션 존재 + 소유권.
  select exists (
    select 1
      from public.performance_sessions s
     where s.id = p_session_id
       and s.profile_id = p_profile_id
  ) into v_owns;

  if not v_owns then
    return jsonb_build_object('status', 'session_not_found');
  end if;

  -- ── 2) 제출본이 이 세션의 것인가. **행을 잠근다** - 아래 "이미 확정됐는가" 판정과
  --       update 사이에 다른 탭이 끼어들면 두 요청이 모두 "미확정"으로 읽고 둘 다
  --       update를 시도한다. 부분 UNIQUE가 뒤늦은 쪽을 23505로 막아 주기는 하지만,
  --       그 경우 호출부는 500을 보게 된다. 잠그면 뒤늦은 쪽이 `already_final`
  --       (같은 제출본) 또는 `already_finalized_other`로 **정상 분기**한다.
  select sub.revision, sub.is_final, sub.finalized_at, sub.finalize_reason
    into v_revision, v_is_final, v_finalized_at, v_reason
    from public.performance_submissions sub
   where sub.id = p_submission_id
     and sub.session_id = p_session_id
     for update;

  if v_revision is null then
    return jsonb_build_object('status', 'submission_not_in_session');
  end if;

  -- ── 2-1) 세션 행 잠금 - **세션 단위 직렬화 지점**.
  --       (2)의 잠금은 대상 제출본 **한 행**뿐이라, 같은 세션의 **서로 다른** 제출본
  --       2건에 대한 finalize 가 동시에 들어오면 잠금이 겹치지 않는다. 그러면 둘 다
  --       (4)를 "확정된 행 없음"으로 읽고 (6)까지 진행해, 뒤늦은 쪽이
  --       `performance_submissions_one_final_per_session_idx`(54번 1-6)에서 23505를
  --       맞는다 -> 호출부는 `commitError` 분기로 **500**을 본다(`finalize.js`).
  --       즉 위 (2) 주석과 파일 상단 멱등 ③이 약속한 `already_finalized_other` 분기가
  --       그 조합에서만 성립하지 않았다(검토 P11). 세션 행을 잠가 (4)~(7)을 세션 단위로
  --       직렬화한다 - 뒤늦은 쪽은 앞선 트랜잭션이 커밋된 뒤에 (4)를 읽으므로 정상 분기한다.
  --
  --       ⚠ 잠금 순서는 **제출본 -> 세션**이다. (4) `commit_performance_evaluation_report`
  --       도 제출본 update -> 세션 update 순이라 두 함수의 순서가 같다. 여기서 세션을
  --       먼저 잠그면 순서가 뒤집혀 두 함수가 교착(deadlock)할 수 있다 - 이 블록을
  --       (2) 위로 올리지 마라.
  perform 1
    from public.performance_sessions s
   where s.id = p_session_id
     for update;

  -- ── 3) 이미 이 제출본이 최종본이면 **아무것도 바꾸지 않고** 성공을 돌려준다(멱등 ②).
  --       finalize_reason을 덮어쓰지 않는다 - 최초 확정이 정본이다.
  if v_is_final then
    select id into v_report_id
      from public.performance_reports
     where session_id = p_session_id
       and report_type = 'final_submission';

    return jsonb_build_object(
      'status', 'already_final',
      'submission_id', p_submission_id,
      'revision', v_revision,
      'finalized_at', v_finalized_at,
      'finalize_reason', v_reason,
      'report_id', v_report_id
    );
  end if;

  -- ── 4) 다른 제출본이 이미 확정돼 있는가(멱등 ③ -> §8.6 409 ALREADY_FINALIZED_OTHER).
  select sub.id
    into v_other_id
    from public.performance_submissions sub
   where sub.session_id = p_session_id
     and sub.is_final = true
   limit 1;

  if v_other_id is not null then
    return jsonb_build_object(
      'status', 'already_finalized_other',
      'submission_id', v_other_id
    );
  end if;

  -- ── 5) 평가 선행 조건(§8.6 400 NO_EVALUATION_YET).
  select exists (
    select 1
      from public.performance_reports r
     where r.session_id = p_session_id
       and r.report_type = 'evaluation'
       and r.submission_id = p_submission_id
  ) into v_eval_ok;

  if not v_eval_ok then
    return jsonb_build_object('status', 'no_evaluation');
  end if;

  -- ── 6) 최종본 고정.
  update public.performance_submissions sub
     set is_final = true,
         is_draft = false,
         finalized_at = now(),
         finalize_reason = p_reason,
         submitted_at = coalesce(sub.submitted_at, now()),
         updated_at = now()
   where sub.id = p_submission_id
  returning sub.finalized_at into v_finalized_at;

  -- ── 6-1) 활동 기록 승격 - 심화탐구 「위닝 기록에서 불러오기」의 재료가 된다.
  --       새로 확정하는 경로에서만 올린다(already_final, already_finalized_other,
  --       no_evaluation 은 위에서 이미 반환했다). 세션 행은 2-1)에서 잠갔으므로 읽는 값이 안정적이다.
  --       subject_group 은 세션 값(국어, 수학 등)이 아니라 상수 '교과'다(CHECK 허용값).
  --       학년과 학기는 API 가 값을 거르지 않으므로 허용 밖 값은 NULL 로 둬 확정이 중단되지 않게 한다.
  --       concept, limitation 은 비워 둔다(학생이 채운다).
  insert into public.activity_records
      (profile_id, source_program, source_ref_id, status, grade_label, semester,
       subject_group, subject, topic, confirmed_at)
  select p_profile_id, 'performance', p_session_id, 'confirmed',
         case when s.grade_label in ('고1', '고2', '고3') then s.grade_label end,
         case s.semester when '1학기' then 1 when '2학기' then 2 end,
         '교과',
         s.subject,
         (select t.title
            from public.performance_topics t
           where t.id = s.selected_topic_id
             and t.session_id = p_session_id),
         now()
    from public.performance_sessions s
   where s.id = p_session_id
  on conflict (source_program, source_ref_id) where source_ref_id is not null do nothing;

  -- ── 7) 최종 제출 리포트 upsert(세션당 1행, (2)의 부분 UNIQUE가 충돌 대상).
  --       score/summary는 null이다 - 모델 산출물이 아니라 학생 원고다.
  insert into public.performance_reports
      (session_id, submission_id, report_type, sections)
  values
      (p_session_id, p_submission_id, 'final_submission', p_sections)
  on conflict (session_id) where (report_type = 'final_submission')
  do update
     set submission_id = excluded.submission_id,
         sections      = excluded.sections,
         updated_at    = now()
  returning id into v_report_id;

  -- ── 8) 세션 종료 표시(위 「세션 상태」 주석 - 잠그는 것이 아니다).
  update public.performance_sessions s
     set status = 'completed',
         current_step = greatest(coalesce(s.current_step, 1), 5),
         completed_steps = (
           select coalesce(array_agg(distinct e order by e), '{}'::smallint[])
             from unnest(coalesce(s.completed_steps, '{}'::smallint[]) || array[4, 5]::smallint[]) as e
         ),
         updated_at = now()
   where s.id = p_session_id;

  -- ── 9) rag_use 승격 2번째 지점(§8.3 「평가 리포트 생성 또는 최종 제출 확정 시에만」).
  update public.performance_session_vectors v
     set rag_use = true
   where v.session_id = p_session_id
     and v.rag_use is distinct from true;

  return jsonb_build_object(
    'status', 'finalized',
    'submission_id', p_submission_id,
    'revision', v_revision,
    'finalized_at', v_finalized_at,
    'finalize_reason', p_reason,
    'report_id', v_report_id
  );
end;
$$;


ALTER FUNCTION "public"."finalize_performance_submission"("p_session_id" "uuid", "p_profile_id" "uuid", "p_submission_id" "uuid", "p_reason" "text", "p_sections" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."finalize_performance_submission"("p_session_id" "uuid", "p_profile_id" "uuid", "p_submission_id" "uuid", "p_reason" "text", "p_sections" "jsonb") IS '최종 확정 단일 트랜잭션 - is_final 고정(세션당 1건 부분 UNIQUE) + final_submission 리포트 upsert + 세션 completed + rag_use 승격 + activity_records 승격(source_program=performance, status=confirmed, 세션 id 를 source_ref_id 로 쓰고 중복은 건너뜀; 학년 학기가 허용 밖이면 NULL, concept 와 limitation 은 NULL). 같은 제출본 재확정은 already_final(멱등 200), 다른 제출본이 이미 확정이면 already_finalized_other(409)다. 회차는 건드리지 않는다.';


COMMENT ON TABLE "public"."activity_records" IS '활동 기록 저장소. status: planned(재료 조회 제외) / draft(직접 입력 작성 중, 업로드 추출 초안) / confirmed(수행평가 최종본, 심화탐구 확정본) / final(자기평가서 최종본). source_program=upload 는 growth_uploads.id 를 source_ref_id 로 쓴다. (source_program, source_ref_id) 부분 유니크로 중복 승격을 막는다. 본인은 manual 행만 쓰고 나머지 source 는 service_role 만 쓴다. 직접 입력(manual)은 planned/draft 까지만 허용하고 확정 승격(confirmed/final)은 service_role 이 한다.';


revoke execute on function public.finalize_performance_submission(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_performance_submission(uuid, uuid, uuid, text, jsonb) to service_role;
