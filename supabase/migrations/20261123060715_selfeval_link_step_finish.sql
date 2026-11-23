-- 자기평가서 연계 판정(link) 단계를 종료 함수가 받게 한다(명세 No.174, 17).
-- 20261123055513 이 선점 함수만 link 를 허용해 종료 함수가 selfeval_step_unknown 을 던진다.
-- 아래 정의는 20261021014317 과 같고 단계 이름 검사에 link 만 더했다. 권한은 그대로 이어받는다.
CREATE OR REPLACE FUNCTION "public"."fn_selfeval_finish_step"("p_session_id" "uuid", "p_profile_id" "uuid", "p_step" "text", "p_ok" boolean, "p_patch" "jsonb" DEFAULT '{}'::"jsonb", "p_issues" "jsonb" DEFAULT '[]'::"jsonb", "p_extra_attempts" integer DEFAULT 0) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
  if p_step is null or p_step not in ('link', 'analyze', 'write', 'verify') then
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
