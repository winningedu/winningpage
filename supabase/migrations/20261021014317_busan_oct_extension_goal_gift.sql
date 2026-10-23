


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pgroonga" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."check_email_signup_state"("p_email" "text") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  v_email     text;
  v_auth_id   uuid;
  v_confirmed timestamptz;
  v_completed boolean;
begin
  v_email := lower(trim(coalesce(p_email, '')));

  if v_email = '' then
    return 'available';
  end if;

  select u.id, u.email_confirmed_at
    into v_auth_id, v_confirmed
  from auth.users u
  where lower(trim(u.email)) = v_email
  limit 1;

  -- 계정이 없어도 profiles에 같은 이메일이 있으면 가입된 것으로 본다
  -- (계정이 지워졌는데 프로필만 남은 비정상 상태 방어).
  select exists (
    select 1
    from public.profiles p
    where lower(trim(p.email)) = v_email
      and p.member_type is not null
  ) into v_completed;

  if v_completed then
    return 'taken';
  end if;

  if v_auth_id is not null then
    if v_confirmed is null then
      return 'resumable_unverified';
    end if;
    return 'resumable_verified';
  end if;

  return 'available';
end;
$$;


ALTER FUNCTION "public"."check_email_signup_state"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."commit_performance_design_report"("p_session_id" "uuid", "p_profile_id" "uuid", "p_topic_id" "uuid", "p_sections" "jsonb", "p_model" "text" DEFAULT NULL::"text", "p_prompt_version" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_owns       boolean;
  v_topic_ok   boolean;
  v_report_id  uuid;
  v_generation integer;
begin
  -- ── 1) 세션 존재 + 소유권. SECURITY DEFINER라 RLS가 적용되지 않으므로 여기서
  --       직접 확인한다. 없는 세션과 남의 세션을 같은 결과로 묶는다.
  select exists (
    select 1
      from public.performance_sessions s
     where s.id = p_session_id
       and s.profile_id = p_profile_id
  ) into v_owns;

  if not v_owns then
    return jsonb_build_object(
      'status', 'session_not_found',
      'report_id', null,
      'topic_id', null,
      'generation_count', 0
    );
  end if;

  -- ── 2) 주제가 **이 세션의 것**인가(§8.6 `404 TOPIC_NOT_IN_SESSION`).
  --       핸들러도 같은 검사를 하지만 여기서 한 번 더 한다 — 이 함수는 RLS 밖에서
  --       도는 write 진입점이라 호출부의 선행 검사를 신뢰 근거로 삼지 않는다.
  select exists (
    select 1
      from public.performance_topics t
     where t.id = p_topic_id
       and t.session_id = p_session_id
  ) into v_topic_ok;

  if not v_topic_ok then
    return jsonb_build_object(
      'status', 'topic_not_in_session',
      'report_id', null,
      'topic_id', null,
      'generation_count', 0
    );
  end if;

  -- ── 3) 주제 확정. **세션 전체를 한 문장으로 다시 칠한다** —
  --       `set selected = (id = p_topic_id)`라 선택된 1건이 true, 나머지는 전부
  --       false가 된다. "이전 선택을 false로 지우는 update"를 따로 두면 두 문장
  --       사이에서 죽었을 때 선택이 2건인 세션이 생긴다.
  update public.performance_topics t
     set selected = (t.id = p_topic_id)
   where t.session_id = p_session_id;

  -- ── 4) 세션 진행 상태 + 생성 카운터.
  --
  --       completed_steps에 **3을 넣는다**: STEP3(주제 추천)이 끝나는 시점은 추천을
  --       받은 순간이 아니라 사용자가 주제를 확정하는 순간이다(§5.11, §3.3 활성 스텝
  --       표). `recommend-topics.js:stepPatch` 주석이 "그 확정은 design-report(P10)가
  --       기록한다"고 예고해 둔 바로 그 지점이다.
  --
  --       **4은 넣지 않는다.** STEP4(설계 리포트)는 리포트가 만들어진 순간이 아니라
  --       사용자가 리포트를 닫고 작성 단계로 넘어가는 순간에 끝난다(§5.13 푸터
  --       `창 닫고 작성하기`). current_step만 4로 올려 진행 표시를 옮긴다.
  --
  --       진행은 되돌리지 않는다(greatest) — 재생성이 이미 STEP5까지 간 세션을
  --       4로 끌어내리면 안 된다.
  update public.performance_sessions s
     set selected_topic_id = p_topic_id,
         status = case when s.status = 'draft' then 'in_progress' else s.status end,
         current_step = greatest(coalesce(s.current_step, 1), 4),
         completed_steps = (
           select coalesce(array_agg(distinct e order by e), '{}'::smallint[])
             from unnest(coalesce(s.completed_steps, '{}'::smallint[]) || array[3]::smallint[]) as e
         ),
         design_generation_count = coalesce(s.design_generation_count, 0) + 1,
         updated_at = now()
   where s.id = p_session_id
  returning s.design_generation_count into v_generation;

  -- ── 5) 리포트 upsert. 충돌 대상은 (2)의 부분 UNIQUE 인덱스다 —
  --       재생성은 **같은 행을 덮어쓴다**(새 행을 쌓지 않는다). 그래서
  --         · 응답의 `reportId`가 재생성 전후로 같고,
  --         · 세션당 design 행이 1개라는 조회 계약(§8.6 v_performance_saved_reports)이
  --           스키마로 보장되며,
  --         · 동시 요청 2건이 두 행을 만들 수 없다.
  --       created_at은 갱신하지 않는다(최초 생성 시각을 잃지 않는다).
  insert into public.performance_reports
      (session_id, topic_id, report_type, sections, model, prompt_version)
  values
      (p_session_id, p_topic_id, 'design', p_sections, p_model, p_prompt_version)
  on conflict (session_id) where (report_type = 'design')
  do update
     set topic_id       = excluded.topic_id,
         sections       = excluded.sections,
         model          = excluded.model,
         prompt_version = excluded.prompt_version,
         updated_at     = now()
  returning id into v_report_id;

  return jsonb_build_object(
    'status', 'committed',
    'report_id', v_report_id,
    'topic_id', p_topic_id,
    'generation_count', v_generation
  );
end;
$$;


ALTER FUNCTION "public"."commit_performance_design_report"("p_session_id" "uuid", "p_profile_id" "uuid", "p_topic_id" "uuid", "p_sections" "jsonb", "p_model" "text", "p_prompt_version" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."commit_performance_design_report"("p_session_id" "uuid", "p_profile_id" "uuid", "p_topic_id" "uuid", "p_sections" "jsonb", "p_model" "text", "p_prompt_version" "text") IS '설계 리포트 커밋 단일 트랜잭션 — 주제 확정(topics.selected + sessions.selected_topic_id) + 진행 단계 + 생성 카운터 + 리포트 upsert를 전부 성립시키거나 전부 없던 일로 만든다. 회차는 건드리지 않는다(설계 리포트는 무차감, §9.3).';



CREATE OR REPLACE FUNCTION "public"."commit_performance_evaluation_report"("p_session_id" "uuid", "p_profile_id" "uuid", "p_submission_id" "uuid", "p_sections" "jsonb", "p_score" smallint DEFAULT NULL::smallint, "p_summary" "text" DEFAULT NULL::"text", "p_model" "text" DEFAULT NULL::"text", "p_prompt_version" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_owns       boolean;
  v_revision   smallint;
  v_report_id  uuid;
  v_count      integer;
begin
  -- ── 1) 세션 존재 + 소유권. SECURITY DEFINER라 RLS가 적용되지 않으므로 여기서
  --       직접 확인한다. 없는 세션과 남의 세션을 같은 결과로 묶는다.
  select exists (
    select 1
      from public.performance_sessions s
     where s.id = p_session_id
       and s.profile_id = p_profile_id
  ) into v_owns;

  if not v_owns then
    return jsonb_build_object('status', 'session_not_found');
  end if;

  -- ── 2) 제출본이 **이 세션의 것**인가. 핸들러도 같은 검사를 하지만 여기서 한 번 더
  --       한다 — 이 함수는 RLS 밖에서 도는 write 진입점이라 호출부의 선행 검사를
  --       신뢰 근거로 삼지 않는다(57번 (4) 단계 2와 같은 판단).
  select sub.revision
    into v_revision
    from public.performance_submissions sub
   where sub.id = p_submission_id
     and sub.session_id = p_session_id;

  if v_revision is null then
    return jsonb_build_object('status', 'submission_not_in_session');
  end if;

  -- ── 3) 제출 확정. **`is_final`은 건드리지 않는다** — 최종본 고정은 (5)의 몫이고,
  --       여기서 손대면 세션당 1건 부분 UNIQUE와 다투게 된다.
  --       `submitted_at`은 최초 1회만 찍는다(재평가로 시각이 밀리면 "언제 낸 글인가"가
  --       사라진다). 이미 제출된 행을 다시 평가하는 경우 이 update는 사실상 no-op이다.
  update public.performance_submissions sub
     set is_draft = false,
         submitted_at = coalesce(sub.submitted_at, now()),
         updated_at = now()
   where sub.id = p_submission_id;

  -- ── 4) 세션 진행 상태 + 생성 카운터.
  update public.performance_sessions s
     set status = case when s.status = 'draft' then 'in_progress' else s.status end,
         current_step = greatest(coalesce(s.current_step, 1), 5),
         completed_steps = (
           select coalesce(array_agg(distinct e order by e), '{}'::smallint[])
             from unnest(coalesce(s.completed_steps, '{}'::smallint[]) || array[4]::smallint[]) as e
         ),
         evaluation_count = coalesce(s.evaluation_count, 0) + 1,
         updated_at = now()
   where s.id = p_session_id
  returning s.evaluation_count into v_count;

  -- ── 5) 리포트 upsert. 충돌 대상은 (2)의 부분 UNIQUE 인덱스다 — 재평가는
  --       **같은 행을 덮어쓴다**(새 행을 쌓지 않는다). created_at은 갱신하지 않는다.
  insert into public.performance_reports
      (session_id, submission_id, report_type, sections, score, summary, model, prompt_version)
  values
      (p_session_id, p_submission_id, 'evaluation', p_sections, p_score, p_summary, p_model, p_prompt_version)
  on conflict (session_id) where (report_type = 'evaluation')
  do update
     set submission_id  = excluded.submission_id,
         sections       = excluded.sections,
         score          = excluded.score,
         summary        = excluded.summary,
         model          = excluded.model,
         prompt_version = excluded.prompt_version,
         updated_at     = now()
  returning id into v_report_id;

  -- ── 6) rag_use 승격(위 ㄹ). 벡터 행이 아직 없으면 0행에 적중한다 — P14가 행을
  --       만들기 시작하면 이 지점이 그대로 규정대로 동작한다.
  update public.performance_session_vectors v
     set rag_use = true
   where v.session_id = p_session_id
     and v.rag_use is distinct from true;

  return jsonb_build_object(
    'status', 'committed',
    'report_id', v_report_id,
    'submission_id', p_submission_id,
    'revision', v_revision,
    'evaluation_count', v_count
  );
end;
$$;


ALTER FUNCTION "public"."commit_performance_evaluation_report"("p_session_id" "uuid", "p_profile_id" "uuid", "p_submission_id" "uuid", "p_sections" "jsonb", "p_score" smallint, "p_summary" "text", "p_model" "text", "p_prompt_version" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."commit_performance_evaluation_report"("p_session_id" "uuid", "p_profile_id" "uuid", "p_submission_id" "uuid", "p_sections" "jsonb", "p_score" smallint, "p_summary" "text", "p_model" "text", "p_prompt_version" "text") IS '평가 리포트 커밋 단일 트랜잭션 — 제출본 확정(is_draft/submitted_at) + 평가 리포트 upsert(세션당 1행) + 진행 단계 + evaluation_count + performance_session_vectors.rag_use 승격을 전부 성립시키거나 전부 없던 일로 만든다. 회차는 건드리지 않는다(평가는 무차감, §9.3).';



CREATE OR REPLACE FUNCTION "public"."complete_signup_profile"("p_name" "text", "p_username" "text", "p_phone" "text", "p_email" "text", "p_region" "text", "p_school_type" "text", "p_school_name" "text", "p_member_type" "text", "p_terms_service_agreed" boolean, "p_privacy_required_agreed" boolean, "p_identity_required_agreed" boolean, "p_privacy_optional_agreed" boolean, "p_marketing_agreed" boolean, "p_ads_agreed" boolean, "p_guardian_phone" "text" DEFAULT NULL::"text", "p_guardian_consent" boolean DEFAULT false, "p_identity_request_id" "text" DEFAULT NULL::"text", "p_birth_date" "date" DEFAULT NULL::"date", "p_gender" "text" DEFAULT NULL::"text", "p_org_code" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_user_id        uuid;
  v_name           text;
  v_username       text;
  v_phone          text;
  v_phone_digits   text;
  v_pv_id          uuid;
  v_email          text;
  v_region         text;
  v_school_type    text;
  v_school_name    text;
  v_member_type    text;
  v_link_code      text;
  v_guardian_phone        text;
  v_guardian_phone_digits text;
  v_identity_rid   text;
  v_iv_id          uuid;
  v_iv_purpose     text;
  v_iv_under14     boolean;
  v_iv_birth_date  date;
  v_iv_gender      text;
  v_iv_mobile      text;
  v_under14        boolean := false;
  v_birth_date     date;
  v_gender         text;
  v_org_code_input text;
  v_tenant_id      uuid;
  v_require_tenant boolean;
  v_signup_enabled boolean;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  -- ── 가입 on/off 게이트 (2026-09-22, S 가입 차단용) ────────────────
  -- 다른 검증보다 먼저 확인한다 — 꺼져 있으면 이후 어떤 입력도 볼 필요가
  -- 없다. 행이 없으면(설정 자체가 안 심겼으면) false 로 취급해 막는다 —
  -- 폴백으로 열어주지 않는다.
  select ((s.value #>> '{}')::boolean) into v_signup_enabled
    from public.app_settings s where s.key = 'signup_enabled';
  if not coalesce(v_signup_enabled, false) then
    raise exception 'signup_disabled' using errcode = 'WC074';
  end if;

  v_name        := trim(coalesce(p_name, ''));
  v_email       := lower(trim(coalesce(p_email, '')));
  v_username    := lower(trim(coalesce(nullif(p_username, ''), v_email)));
  v_phone       := trim(coalesce(p_phone, ''));
  v_region      := trim(coalesce(p_region, ''));
  v_school_type := trim(coalesce(p_school_type, ''));
  v_school_name := trim(coalesce(p_school_name, ''));
  v_member_type := lower(trim(coalesce(p_member_type, '')));

  v_guardian_phone := trim(coalesce(p_guardian_phone, ''));
  v_identity_rid   := trim(coalesce(p_identity_request_id, ''));

  -- 저장은 입력값 그대로 두고(기존 동작 유지), 조회만 숫자로 정규화한다.
  v_phone_digits := regexp_replace(v_phone, '[^0-9]', '', 'g');

  if v_name = '' then
    raise exception 'name_required';
  end if;

  if v_email = '' then
    raise exception 'email_required';
  end if;

  if v_username = '' then
    v_username := v_email;
  end if;

  if v_member_type = '' then
    raise exception 'member_type_required';
  end if;

  if v_member_type not in ('student', 'parent', 'mentor') then
    raise exception 'invalid_member_type';
  end if;

  -- 지역·재학 구분은 학생에게만 필수([13]).
  if v_member_type = 'student' and v_region = '' then
    raise exception 'region_required';
  end if;

  if v_member_type = 'student' and v_school_type = '' then
    raise exception 'school_type_required';
  end if;

  if coalesce(p_terms_service_agreed, false) is not true then
    raise exception 'terms_service_required';
  end if;

  if coalesce(p_privacy_required_agreed, false) is not true then
    raise exception 'privacy_required';
  end if;

  -- 본인 인증 정보 수집 동의는 학생 약관에만 있는 항목이다.
  if v_member_type = 'student'
     and coalesce(p_identity_required_agreed, false) is not true then
    raise exception 'identity_required';
  end if;

  -- ── 생년월일·성별 (QA 2026-08-22) ──────────────────────────────
  -- 우선 입력값을 그대로 정규화·검증한다. 14세 미만 흐름은 프런트가 이 두 값을 보내지
  -- 않으므로(PASS 값이 정본) 여기서는 통과하고, 아래 법정대리인 본인확인 블록에서
  -- identity_verifications 값으로 덮어쓴다.
  v_birth_date := p_birth_date;
  v_gender     := nullif(trim(coalesce(p_gender, '')), '');

  -- ── 소속 코드 (2026-09-22, tenants 전환) ────────────────────────
  -- p_org_code 는 이제 8자 tenant 코드다(fn_generate_tenant_code 출력 형식).
  -- 값이 있으면 fn_resolve_tenant_code 가 정규화·조회·레이트리밋(WC068)을
  -- 하고, 못 찾으면 실패 기록을 남긴 뒤 NULL 을 돌려준다(raise 하지 않음 —
  -- 그래야 기록 insert 가 이 가입 트랜잭션과 함께 커밋된다). 소속이
  -- 필수(require_tenant_on_signup)가 아니면 잘못된 코드는 조용히 무시하고
  -- (선택 입력이라 오타로 가입 자체를 막지 않는다), 필수면 아래에서 WC073.
  v_org_code_input := trim(coalesce(p_org_code, ''));
  if v_org_code_input <> '' then
    v_tenant_id := public.fn_resolve_tenant_code(v_org_code_input);
  end if;

  -- jsonb 를 안전하게 boolean 으로 — #>>'{}' 는 스칼라 jsonb(true/false 이든
  -- 문자열 "true" 이든) 를 text 로 뽑는다. value::text::boolean 은 값이
  -- json 문자열 '"true"' 로 저장되면 22P02 로 터져 가입 전체를 막는다.
  select ((s.value #>> '{}')::boolean) into v_require_tenant
    from public.app_settings s
   where s.key = 'require_tenant_on_signup';

  if coalesce(v_require_tenant, false) and v_tenant_id is null then
    raise exception 'tenant_required' using errcode = 'WC073';
  end if;

  if v_gender is not null and v_gender not in ('남', '여') then
    raise exception 'invalid_gender';
  end if;

  -- ── 법정대리인 본인확인 (만 14세 미만) ──────────────────────────
  if v_identity_rid <> '' then
    select id, purpose, is_under14, birth_date, gender, mobile
      into v_iv_id, v_iv_purpose, v_iv_under14, v_iv_birth_date, v_iv_gender, v_iv_mobile
    from public.identity_verifications
    where request_id = v_identity_rid
      and status = 'verified'
      and consumed_at is null
      and verified_at > now() - interval '30 minutes'
    limit 1;

    if v_iv_id is null then
      raise exception 'identity_not_verified';
    end if;

    if v_iv_purpose is distinct from 'under14_guardian' then
      raise exception 'identity_purpose_mismatch';
    end if;

    -- 법정대리인이 만 14세 미만이면 대리인이 될 수 없다.
    if coalesce(v_iv_under14, false) then
      raise exception 'guardian_age';
    end if;

    v_under14 := true;

    -- PASS 실명 정보가 정본이다 — 폼에서 보낸 p_birth_date/p_gender는 무시한다.
    -- NICE 성별코드 관례: 홀수(1/3/5/7)=남, 짝수 계열(0/2/4/6/8)=여
    -- (0/2/4/6/8은 내국인/외국인·출생연도대별 조합, 매핑에 없는 값이면 null).
    v_birth_date := v_iv_birth_date;
    v_gender := case
      when v_iv_gender in ('1', '3', '5', '7') then '남'
      when v_iv_gender in ('0', '2', '4', '6', '8') then '여'
      else null
    end;

    -- 법정대리인(학부모) 번호도 PASS 콜백이 저장한 mobile_no가 정본이다 — 있으면
    -- 폼 입력값(p_guardian_phone)을 무시하고 덮어쓴다. 없으면 입력값을 그대로 쓴다.
    v_guardian_phone := coalesce(
      nullif(regexp_replace(coalesce(v_iv_mobile, ''), '[^0-9]', '', 'g'), ''),
      v_guardian_phone
    );
  end if;

  v_guardian_phone_digits := regexp_replace(v_guardian_phone, '[^0-9]', '', 'g');

  -- 표기 정규화 — profiles.phone은 사용자가 입력한 형식(예: 010-1234-5678)을 그대로
  -- 저장하는 관행이라, guardian_phone도 저장 직전에 같은 하이픈 형식으로 맞춘다. PASS
  -- mobile_no(하이픈 없는 숫자열)와 폼 입력값(하이픈 유무가 제각각) 둘 다 위에서 이미
  -- v_guardian_phone에 합쳐졌으므로 여기 한 곳에서만 처리하면 된다. 인증 조회·중복
  -- 비교는 계속 v_guardian_phone_digits(숫자만)를 쓴다.
  v_guardian_phone := case
    when v_guardian_phone_digits = '' then ''
    when length(v_guardian_phone_digits) = 11 then
      substr(v_guardian_phone_digits, 1, 3) || '-' || substr(v_guardian_phone_digits, 4, 4) || '-' || substr(v_guardian_phone_digits, 8, 4)
    when length(v_guardian_phone_digits) = 10 then
      substr(v_guardian_phone_digits, 1, 3) || '-' || substr(v_guardian_phone_digits, 4, 3) || '-' || substr(v_guardian_phone_digits, 7, 4)
    else v_guardian_phone
  end;

  if v_under14 then
    if v_guardian_phone = '' then
      raise exception 'guardian_phone_required';
    end if;

    if coalesce(p_guardian_consent, false) is not true then
      raise exception 'guardian_consent_required';
    end if;
  end if;

  -- 14세 이상 학생·학부모는 생년월일·성별이 필수다(멘토는 가입 화면이 아직 없어 제외).
  if not v_under14 and v_member_type in ('student', 'parent') then
    if v_birth_date is null then
      raise exception 'birth_date_required';
    end if;

    if v_gender is null then
      raise exception 'gender_required';
    end if;
  end if;

  -- 학생은 본인 명의 번호 또는 학부모 번호 중 하나가 있어야 한다("학생 명의의
  -- 핸드폰이 없어요" 체크 시 phone을 비우고 guardian_phone을 채워 보낸다).
  -- 14세 미만은 위 guardian_phone_required가 이미 걸러내므로 여기는 14세 이상
  -- 학생이 phone도 guardian_phone도 안 보낸 경우를 막는 안전망이다.
  if v_member_type = 'student'
     and v_phone_digits = ''
     and v_guardian_phone_digits = '' then
    raise exception 'phone_or_guardian_required';
  end if;

  -- ── 휴대폰 인증 확인 (본인 번호) ─────────────────────────────────
  -- purpose는 가입 목적으로 발송된 것만 인정한다(find_account/reset_password 등
  -- 다른 목적 인증을 가입에 재사용하지 못하게). TTL은 30분 → 10분으로 단축한다.
  if v_phone_digits <> '' then
    select id into v_pv_id
    from public.phone_verifications
    where phone = v_phone_digits
      and purpose in ('signup', 'parent_signup')
      and verified_at is not null
      and consumed_at is null
      and verified_at > now() - interval '10 minutes'
    order by verified_at desc
    limit 1;
  end if;

  -- ── 휴대폰 인증 확인 (학부모 번호 — 14세 이상 학생이 본인 번호 대신 보낸 경우) ──
  -- 본인 번호를 비우고 학부모 번호를 보낸 14세 이상 학생만 해당한다. 14세 미만은
  -- PASS 본인확인으로 이미 검증된 번호라 별도 인증이 필요 없다.
  if v_member_type = 'student'
     and not v_under14
     and v_phone_digits = ''
     and v_guardian_phone_digits <> '' then
    select id into v_pv_id
    from public.phone_verifications
    where phone = v_guardian_phone_digits
      and purpose = 'guardian_signup'
      and verified_at is not null
      and consumed_at is null
      and verified_at > now() - interval '10 minutes'
    order by verified_at desc
    limit 1;

    if v_pv_id is null then
      raise exception 'guardian_phone_not_verified';
    end if;
  end if;

  -- [15]: 학생도 포함. 멘토는 가입 화면이 생길 때 추가한다.
  -- 만 14세 미만이 본인 번호를 비운 경우만 면제한다(위 (3)-c 주석). 14세 이상
  -- 학생이 학부모 번호 경로를 탄 경우는 바로 위 블록에서 이미 v_pv_id를 채웠거나
  -- guardian_phone_not_verified로 걸러졌으므로 여기서 추가로 막을 필요가 없다.
  if v_member_type in ('parent', 'student')
     and v_pv_id is null
     and not (v_under14 and v_phone_digits = '') then
    raise exception 'phone_not_verified';
  end if;

  if exists (
    select 1
    from public.profiles
    where lower(trim(email)) = v_email
      and id <> v_user_id
  ) then
    raise exception 'duplicate_email';
  end if;

  -- ── [16] 전화번호 중복 ──────────────────────────────────────────
  -- guardian_phone은 검사하지 않는다(학부모 본인 계정 번호·형제 공유가 정상).
  if v_phone_digits <> '' and exists (
    select 1
    from public.profiles
    where id <> v_user_id
      and member_type is not null
      and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = v_phone_digits
  ) then
    raise exception 'duplicate_phone';
  end if;

  -- fn_profiles_lock_tenant(20260922) 게이트를 통과시킨다 — 아래 INSERT ...
  -- ON CONFLICT DO UPDATE 가 재호출 시 UPDATE 경로를 탈 수 있어서다.
  perform set_config('app.tenant_set_via_rpc', '1', true);

  insert into public.profiles (
    id, name, username, phone, email, region,
    school_type, school_name, member_type, role,
    terms_service_agreed, privacy_required_agreed, privacy_optional_agreed,
    marketing_agreed, ads_agreed, guardian_phone, guardian_consent,
    birth_date, gender, tenant_id, updated_at
  )
  values (
    v_user_id, v_name, v_username, nullif(v_phone, ''), v_email, nullif(v_region, ''),
    nullif(v_school_type, ''), nullif(v_school_name, ''), v_member_type, 'user',
    coalesce(p_terms_service_agreed, false),
    coalesce(p_privacy_required_agreed, false),
    coalesce(p_privacy_optional_agreed, false),
    coalesce(p_marketing_agreed, false),
    coalesce(p_ads_agreed, false),
    nullif(v_guardian_phone, ''),
    coalesce(p_guardian_consent, false),
    v_birth_date, v_gender, v_tenant_id,
    now()
  )
  on conflict (id) do update
  set
    name                    = excluded.name,
    username                = excluded.username,
    phone                   = excluded.phone,
    email                   = excluded.email,
    region                  = excluded.region,
    school_type             = excluded.school_type,
    school_name             = excluded.school_name,
    member_type             = excluded.member_type,
    role                    = coalesce(public.profiles.role, 'user'),
    terms_service_agreed    = excluded.terms_service_agreed,
    privacy_required_agreed = excluded.privacy_required_agreed,
    privacy_optional_agreed = excluded.privacy_optional_agreed,
    marketing_agreed        = excluded.marketing_agreed,
    ads_agreed              = excluded.ads_agreed,
    -- 재호출로 이미 채운 법정대리인 정보를 빈 값이 덮지 않게 한다.
    guardian_phone          = coalesce(excluded.guardian_phone, public.profiles.guardian_phone),
    guardian_consent        = excluded.guardian_consent or coalesce(public.profiles.guardian_consent, false),
    -- 생년월일·성별·소속도 같은 원칙 — 재호출(예: 재시도)로 이번엔 비어 온 값이
    -- 이전에 채워진 값을 지우지 않게 한다.
    birth_date              = coalesce(excluded.birth_date, public.profiles.birth_date),
    gender                  = coalesce(excluded.gender, public.profiles.gender),
    tenant_id               = coalesce(excluded.tenant_id, public.profiles.tenant_id),
    updated_at              = now();

  -- 인증 기록을 소비 처리한다. 같은 인증으로 두 번 가입할 수 없게 한다.
  if v_pv_id is not null then
    update public.phone_verifications
    set consumed_at = now()
    where id = v_pv_id;
  end if;

  -- 본인확인도 같은 원칙으로 소비하고, 이제서야 생긴 계정과 잇는다.
  -- user_id를 여기서 채우는 이유는 가입 전 인증이라 그 시점엔 계정이 없어서다([11]).
  if v_iv_id is not null then
    update public.identity_verifications
    set consumed_at = now(),
        user_id     = v_user_id
    where id = v_iv_id;
  end if;

  -- 약관 동의 이력 (버전 단위).
  insert into public.user_term_agreements (user_id, term_id, agreed)
  select
    v_user_id,
    t.id,
    case
      when t.code ~ '_identity$'                        then coalesce(p_identity_required_agreed, false)
      when t.profile_column = 'terms_service_agreed'    then coalesce(p_terms_service_agreed, false)
      when t.profile_column = 'privacy_required_agreed' then coalesce(p_privacy_required_agreed, false)
      when t.profile_column = 'marketing_agreed'        then coalesce(p_marketing_agreed, false)
      when t.profile_column = 'ads_agreed'              then coalesce(p_ads_agreed, false)
      else false
    end
  from public.terms t
  where t.is_active
    and t.audience in (v_member_type, 'common')
  on conflict (user_id, term_id) do update
  set agreed    = excluded.agreed,
      agreed_at = now();

  -- 학생 연결코드: 없을 때만 발급한다(재호출로 코드가 회전하면 안 된다).
  if v_member_type = 'student' then
    select code into v_link_code
    from public.student_link_codes
    where student_id = v_user_id
      and is_active;

    if v_link_code is null then
      v_link_code := public.issue_student_link_code(v_user_id);
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_user_id,
    'email', v_email,
    'member_type', v_member_type,
    'under14', v_under14,
    'link_code', v_link_code   -- 학생이 아니면 null
  );
end;
$_$;


ALTER FUNCTION "public"."complete_signup_profile"("p_name" "text", "p_username" "text", "p_phone" "text", "p_email" "text", "p_region" "text", "p_school_type" "text", "p_school_name" "text", "p_member_type" "text", "p_terms_service_agreed" boolean, "p_privacy_required_agreed" boolean, "p_identity_required_agreed" boolean, "p_privacy_optional_agreed" boolean, "p_marketing_agreed" boolean, "p_ads_agreed" boolean, "p_guardian_phone" "text", "p_guardian_consent" boolean, "p_identity_request_id" "text", "p_birth_date" "date", "p_gender" "text", "p_org_code" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."complete_signup_profile"("p_name" "text", "p_username" "text", "p_phone" "text", "p_email" "text", "p_region" "text", "p_school_type" "text", "p_school_name" "text", "p_member_type" "text", "p_terms_service_agreed" boolean, "p_privacy_required_agreed" boolean, "p_identity_required_agreed" boolean, "p_privacy_optional_agreed" boolean, "p_marketing_agreed" boolean, "p_ads_agreed" boolean, "p_guardian_phone" "text", "p_guardian_consent" boolean, "p_identity_request_id" "text", "p_birth_date" "date", "p_gender" "text", "p_org_code" "text") IS '회원가입 프로필 완성 RPC(20260903041457 학생/학부모 번호 분기 최신본 기준). 2026-09-22 — p_org_code(파라미터명 유지)는 이제 8자 tenant 코드로 해석된다: fn_resolve_tenant_code 로 정규화·조회하고(레이트리밋 WC068은 그 함수가 던지고, 못 찾으면 NULL 을 돌려준다) profiles.tenant_id 에 저장한다(org_code 컬럼에는 더 이상 쓰지 않는다). app_settings.require_tenant_on_signup 이 true 인데 코드가 없거나 못 찾으면 WC073(필수가 아니면 잘못된 코드는 무시). fn_profiles_lock_tenant(20260922) 트리거를 통과시키려고 upsert 직전 app.tenant_set_via_rpc 를 켠다. 나머지(학생 본인 번호 없을 시 guardian_phone 정본화, 14세 미만 PASS 본인확인, 전화번호 인증·중복 검사 등)는 원문 그대로다. 2026-09-22 — app_settings.signup_enabled 이 false(또는 미설정)면 다른 검증보다 먼저 WC074(signup_disabled)로 막는다(S 사이트 가입 차단용, 폴백 없이 기본 차단).';



CREATE OR REPLACE FUNCTION "public"."consume_diagnosis_attempt"("p_attempt_id" "uuid", "p_profile_id" "uuid", "p_reason" "text" DEFAULT 'diagnosis:survey-submit'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  c_program_key constant text := 'diagnose';

  v_existing    public.diagnosis_attempts;
  v_summary     record;
  v_access      public.program_access;
  v_grant       record;
  v_selected_id uuid;
  v_live_count  int := 0;
  v_ever_exists boolean;
  v_consumed    int;
  v_ledger_id   uuid;
  v_free_used   boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 101));

  -- 멱등: 같은 attempt id 재호출은 무엇도 다시 차감하지 않는다.
  select * into v_existing
    from public.diagnosis_attempts a
   where a.id = p_attempt_id;

  if found then
    if v_existing.profile_id <> p_profile_id then
      -- 남의 attempt id 재사용 — 기록하지 않고 거부만 한다.
      return jsonb_build_object(
        'status', 'attempt_conflict', 'charged', false, 'kind', null,
        'free_available', null, 'quota_total', null, 'quota_used', null,
        'quota_remaining', null, 'plan_ends_at', null, 'program_key', c_program_key
      );
    end if;

    select * into v_summary
      from public.fn_program_access_grants_summary(p_profile_id, c_program_key);

    return jsonb_build_object(
      'status', 'already_recorded', 'charged', false, 'kind', v_existing.kind,
      'free_available', false,
      'quota_total', v_summary.quota_total, 'quota_used', v_summary.quota_used,
      'quota_remaining', case when v_summary.quota_total is null then null
                              else greatest(v_summary.quota_total - v_summary.quota_used, 0) end,
      'plan_ends_at', v_summary.expires_at, 'program_key', c_program_key
    );
  end if;

  -- 1) 무료 1회 — 아직 안 썼으면 이번 제출이 무료분이다. 부여 유무와 무관.
  select exists (
    select 1 from public.diagnosis_attempts a
     where a.profile_id = p_profile_id and a.kind = 'free'
  ) into v_free_used;

  if not v_free_used then
    insert into public.diagnosis_attempts (id, profile_id, kind, reason)
    values (
      p_attempt_id, p_profile_id, 'free',
      coalesce(nullif(btrim(p_reason), ''), 'diagnosis:survey-submit')
    );

    return jsonb_build_object(
      'status', 'free_used', 'charged', false, 'kind', 'free',
      'free_available', false,
      'quota_total', null, 'quota_used', null, 'quota_remaining', null,
      'plan_ends_at', null, 'program_key', c_program_key
    );
  end if;

  -- 2) 운영자 제재만 program_access 캐시에서 읽는다(consume_performance_credit
  --    4)절과 동일) — 기간·회차는 원장에서만 판정한다.
  select * into v_access
    from public.program_access
   where id = p_profile_id and program_key = c_program_key;

  if found and v_access.access_status = 'suspended' then
    return jsonb_build_object(
      'status', 'entitlement_expired', 'charged', false, 'kind', null,
      'free_available', false,
      'quota_total', null, 'quota_used', 0, 'quota_remaining', null,
      'plan_ends_at', null, 'program_key', c_program_key
    );
  end if;

  -- 3) 살아있고 만료되지 않은 부여를 소비 순서로 잠근다(consume_performance_credit
  --    5)절 미러 — 만료 임박 우선, 매 호출 잠금 폭 동일 유지).
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
      'charged', false, 'kind', null, 'free_available', false,
      'quota_total', null, 'quota_used', 0, 'quota_remaining', null,
      'plan_ends_at', null, 'program_key', c_program_key
    );
  end if;

  if v_selected_id is null then
    select * into v_summary
      from public.fn_program_access_grants_summary(p_profile_id, c_program_key);

    return jsonb_build_object(
      'status', 'quota_exhausted', 'charged', false, 'kind', null,
      'free_available', false,
      'quota_total', v_summary.quota_total, 'quota_used', v_summary.quota_used,
      'quota_remaining', 0, 'plan_ends_at', v_summary.expires_at,
      'program_key', c_program_key
    );
  end if;

  -- 4) 차감 성립 = 원장 INSERT + 시도 기록 INSERT. attempt pk 가 멱등을 이미
  --    보장하고(위 재조회), advisory lock 이 동시 제출을 직렬화하므로 여기서의
  --    경합 재방어는 필요 없다.
  insert into public.performance_credit_ledger
    (profile_id, grant_id, delta, reason, source_kind)
  values (
    p_profile_id, v_selected_id, -1,
    coalesce(nullif(btrim(p_reason), ''), 'diagnosis:survey-submit'),
    'diagnosis_attempt'
  )
  returning id into v_ledger_id;

  insert into public.diagnosis_attempts (id, profile_id, kind, ledger_id, reason)
  values (
    p_attempt_id, p_profile_id, 'credit', v_ledger_id,
    coalesce(nullif(btrim(p_reason), ''), 'diagnosis:survey-submit')
  );

  select * into v_summary
    from public.fn_program_access_grants_summary(p_profile_id, c_program_key);

  return jsonb_build_object(
    'status', 'charged', 'charged', true, 'kind', 'credit',
    'free_available', false,
    'quota_total', v_summary.quota_total, 'quota_used', v_summary.quota_used,
    'quota_remaining', case when v_summary.quota_total is null then null
                            else greatest(v_summary.quota_total - v_summary.quota_used, 0) end,
    'plan_ends_at', v_summary.expires_at, 'program_key', c_program_key
  );
end;
$$;


ALTER FUNCTION "public"."consume_diagnosis_attempt"("p_attempt_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."consume_diagnosis_attempt"("p_attempt_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") IS '학습진단 제출 1건 판정·기록. 무료 1회 미사용이면 free 기록(원장 미적재), 사용했으면 diagnose 부여에서 회차 1개 차감(performance_credit_ledger source_kind=diagnosis_attempt). 멱등 키는 p_attempt_id(diagnosis_attempts pk). status 어휘: free_used/charged/already_recorded/no_entitlement/entitlement_expired/quota_exhausted/attempt_conflict. 잠금은 consume_performance_credit 과 같은 advisory(101, 프로필 단위).';



CREATE OR REPLACE FUNCTION "public"."consume_growth_credit"("p_report_id" "uuid", "p_profile_id" "uuid", "p_reason" "text" DEFAULT 'growth:step1-success'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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

  -- 운영자 제재만 program_access 캐시에서 읽는다. 기간, 회차는 원장에서만 판정한다.
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


ALTER FUNCTION "public"."consume_growth_credit"("p_report_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."consume_growth_credit"("p_report_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") IS '성장설계 회차 1개 차감(No.14: 첫 모델 호출 단계 성공 시 1회, 같은 회차 재요청은 추가 차감 없음). growth 부여에서 performance_credit_ledger(source_kind=growth_report, session_id NULL)에 -1 을 적재하고 growth_reports.ledger_id 를 갱신한다. 원장 reason 은 사유 뒤에 콜론과 report_id 를 붙여 회차를 추적할 수 있다. 무료 1회 분기 없음. status 어휘: charged/already_charged/session_not_found/no_entitlement/entitlement_expired/quota_exhausted. 이미 되돌린 회차(ledger_reversed_at 있음)의 재호출은 새로 차감한다. 잠금은 consume_diagnosis_attempt 와 같은 advisory(101, 프로필 단위).';



CREATE OR REPLACE FUNCTION "public"."consume_inquiry_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text" DEFAULT 'inquiry:recommend-success'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  c_program_key constant text := 'inquiry';

  v_session      public.inquiry_sessions;
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

  select * into v_session
    from public.inquiry_sessions r
   where r.id = p_session_id and r.profile_id = p_profile_id
     for update;

  if not found then
    return jsonb_build_object(
      'status', 'session_not_found', 'charged', false,
      'ledger_id', null, 'grant_id', null,
      'quota_total', null, 'quota_used', null, 'quota_remaining', null,
      'plan_ends_at', null, 'program_key', c_program_key
    );
  end if;

  -- 멱등: 이미 차감했고 되돌리지 않은 세션은 다시 차감하지 않는다.
  -- 되돌림이 끝난 세션(ledger_reversed_at 있음)의 재시도는 새로 차감한다.
  if v_session.ledger_id is not null and v_session.ledger_reversed_at is null then
    select * into v_summary
      from public.fn_program_access_grants_summary(p_profile_id, c_program_key);

    return jsonb_build_object(
      'status', 'already_charged', 'charged', false,
      'ledger_id', v_session.ledger_id, 'grant_id', null,
      'quota_total', v_summary.quota_total, 'quota_used', v_summary.quota_used,
      'quota_remaining', case when v_summary.quota_total is null then null
                              else greatest(v_summary.quota_total - v_summary.quota_used, 0) end,
      'plan_ends_at', v_summary.expires_at, 'program_key', c_program_key
    );
  end if;

  -- 운영자 제재만 program_access 캐시에서 읽는다. 기간, 세션 수는 원장에서만 판정한다.
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

  -- 차감 성립 = 원장 INSERT + 세션 행 연결. 세션 행을 위에서 잠갔고 advisory lock 이
  -- 동시 요청을 직렬화하므로 경합 재방어는 필요 없다.
  insert into public.performance_credit_ledger
    (profile_id, grant_id, delta, reason, source_kind)
  values (
    p_profile_id, v_selected_id, -1,
    coalesce(nullif(btrim(p_reason), ''), 'inquiry:recommend-success') || ':' || p_session_id::text,
    'inquiry_session'
  )
  returning id into v_ledger_id;

  update public.inquiry_sessions
     set ledger_id = v_ledger_id,
         ledger_reversed_at = null,
         updated_at = now()
   where id = p_session_id;

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


ALTER FUNCTION "public"."consume_inquiry_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."consume_inquiry_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") IS '심화탐구 세션 1개 차감(No.19: 첫 주제 추천 성공 시 1회, 같은 세션의 재추천, 설계, 평가, 재평가는 추가 차감 없음). inquiry 부여에서 performance_credit_ledger(source_kind=inquiry_session, session_id NULL)에 -1 을 적재하고 inquiry_sessions.ledger_id 를 갱신한다. 원장 reason 은 사유 뒤에 콜론과 session_id 를 붙여 세션을 추적할 수 있다. 무료 1회 분기 없음. status 어휘: charged/already_charged/session_not_found/no_entitlement/entitlement_expired/quota_exhausted. 이미 되돌린 세션(ledger_reversed_at 있음)의 재호출은 새로 차감한다. 잠금은 consume_diagnosis_attempt 와 같은 advisory(101, 프로필 단위).';



CREATE OR REPLACE FUNCTION "public"."consume_performance_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text" DEFAULT 'recommend-topics:first-success'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  -- 배포본과 동일 — 회차가 붙는 program_key 는 운영 DB·env 에 이미 박힌
  -- 기존 값이라 개명하지 않는다. mentor 소비 경로는 없다(위 헤더 "보고만
  -- 하고 손대지 않은 것" 참고).
  c_program_key constant text := 'suhaeng';

  v_owns        boolean;
  v_ledger_id   uuid;
  v_summary     record;
  v_access      public.program_access;

  v_grant       record;
  v_selected_id uuid;
  v_live_count  int := 0;
  v_ever_exists boolean;
  v_consumed    int;
begin
  -- 1) 세션 존재 + 소유권. 배포본과 동일 — SECURITY DEFINER 라 RLS 가
  --    적용되지 않으므로 여기서 직접 확인한다.
  select exists (
    select 1
      from public.performance_sessions s
     where s.id = p_session_id
       and s.profile_id = p_profile_id
  ) into v_owns;

  if not v_owns then
    return jsonb_build_object(
      'status', 'session_not_found', 'charged', false,
      'quota_total', null, 'quota_used', 0, 'quota_remaining', null,
      'plan_ends_at', null, 'ledger_id', null, 'program_key', c_program_key
    );
  end if;

  -- 2) 잠금 순서 정정(정정 5). sql/64 부여·회수와 같은 salt(101)를
  --    프로필 단위로 잡는다 — program_access_grants 를 이 lock 없이
  --    직접 잠그면(배포본의 원래 버그) sql/64 의 "orders → advisory(101)
  --    → grants" 순서와 어긋나 데드락 가능성이 생긴다. 프로필 단위라
  --    같은 사용자의 동시 요청(더블클릭 포함)도 이 lock 하나로 자동
  --    직렬화된다 — 세션 전용 lock 을 따로 둘 필요가 없다(최초 설계의
  --    salt 102 를 제거했다).
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 101));

  -- 3) 이미 차감된 세션인가(멱등). lock 을 잡은 **뒤**에 조회한다 —
  --    already_charged 판정이 아래 소진 판정보다 반드시 먼저 성립해야
  --    한다(정정 5). UNIQUE(session_id) 가 세션당 원장 행을 최대
  --    1개로 강제하므로 행 존재 = 차감 완료다(배포본과 동일 계약).
  select l.id into v_ledger_id
    from public.performance_credit_ledger l
   where l.session_id = p_session_id;

  if v_ledger_id is not null then
    select * into v_summary
      from public.fn_program_access_grants_summary(p_profile_id, c_program_key);

    return jsonb_build_object(
      'status', 'already_charged', 'charged', false,
      'quota_total', v_summary.quota_total, 'quota_used', v_summary.quota_used,
      'quota_remaining', case when v_summary.quota_total is null then null
                              else greatest(v_summary.quota_total - v_summary.quota_used, 0) end,
      'plan_ends_at', v_summary.expires_at, 'ledger_id', v_ledger_id,
      'program_key', c_program_key
    );
  end if;

  -- 4) 운영자 제재만 program_access 캐시에서 읽는다(정정 4) — 기간·
  --    회차는 원장에서만 판정한다(아래 5)절). 결제로 자동 해제되면 안
  --    되는 신호라 그대로 존중한다. 잠금 없는 평범한 읽기 — 이 컬럼을
  --    쓰는 어드민 경로가 아직 없고(sql/64 §8-(d)), 있더라도
  --    program_access_grants 를 건드리지 않으므로 위 2)절 lock 과
  --    경합하지 않는다. 새 status 를 만들지 않고 entitlement_expired
  --    로 흡수한다 — 배포본 자신이 이미 expired/suspended 를 같은
  --    status 로 묶었다.
  select * into v_access
    from public.program_access
   where id = p_profile_id and program_key = c_program_key;

  if found and v_access.access_status = 'suspended' then
    return jsonb_build_object(
      'status', 'entitlement_expired', 'charged', false,
      'quota_total', null, 'quota_used', 0, 'quota_remaining', null,
      'plan_ends_at', null, 'ledger_id', null, 'program_key', c_program_key
    );
  end if;

  -- 5) 살아있고 만료되지 않은 부여를 소비 순서로 잠근다(정정 3).
  --    priority 컬럼 없이 만료 임박 우선, 동률이면 먼저 시작한 부여,
  --    마지막은 결정적 tie-break. 매 호출 잠금 폭을 동일하게 유지하려고
  --    이미 선택한 뒤에도 나머지 후보를 계속 순회한다.
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
    -- 살아있는 부여가 없다. "한 번도 없었다"와 "있었지만 전부 회수·
    -- 만료됐다"를 구분한다(배포본의 no_entitlement/entitlement_expired
    -- 어휘를 그대로 승계).
    select exists (
      select 1 from public.program_access_grants g
       where g.profile_id = p_profile_id and g.program_key = c_program_key
    ) into v_ever_exists;

    return jsonb_build_object(
      'status', case when v_ever_exists then 'entitlement_expired' else 'no_entitlement' end,
      'charged', false,
      'quota_total', null, 'quota_used', 0, 'quota_remaining', null,
      'plan_ends_at', null, 'ledger_id', null, 'program_key', c_program_key
    );
  end if;

  if v_selected_id is null then
    -- 살아있는 부여는 있으나 전부 소진됐다.
    select * into v_summary
      from public.fn_program_access_grants_summary(p_profile_id, c_program_key);

    return jsonb_build_object(
      'status', 'quota_exhausted', 'charged', false,
      'quota_total', v_summary.quota_total, 'quota_used', v_summary.quota_used,
      'quota_remaining', 0, 'plan_ends_at', v_summary.expires_at,
      'ledger_id', null, 'program_key', c_program_key
    );
  end if;

  -- 6) 차감 성립 = 원장 INSERT 성공. UNIQUE(session_id) 경합 패배(동시
  --    요청이 advisory lock 창 밖에서 겹치는 극단 케이스의 2차 방어선
  --    — 사실상 2)절 lock 이 이미 직렬화하므로 도달 불가에 가깝다)는
  --    이중 차감하지 않고 already_charged 로 응답한다.
  insert into public.performance_credit_ledger (session_id, profile_id, grant_id, delta, reason)
  values (
    p_session_id, p_profile_id, v_selected_id, -1,
    coalesce(nullif(btrim(p_reason), ''), 'recommend-topics:first-success')
  )
  on conflict (session_id) do nothing
  returning id into v_ledger_id;

  if v_ledger_id is null then
    select l.id into v_ledger_id
      from public.performance_credit_ledger l
     where l.session_id = p_session_id;

    select * into v_summary
      from public.fn_program_access_grants_summary(p_profile_id, c_program_key);

    return jsonb_build_object(
      'status', 'already_charged', 'charged', false,
      'quota_total', v_summary.quota_total, 'quota_used', v_summary.quota_used,
      'quota_remaining', case when v_summary.quota_total is null then null
                              else greatest(v_summary.quota_total - v_summary.quota_used, 0) end,
      'plan_ends_at', v_summary.expires_at, 'ledger_id', v_ledger_id,
      'program_key', c_program_key
    );
  end if;

  select * into v_summary
    from public.fn_program_access_grants_summary(p_profile_id, c_program_key);

  -- program_access.meta 는 더 이상 회차 표시 캐시를 쓰지 않는다(정정
  -- 4) — write-back 하지 않는다. quota_total/quota_used 는 매 조회 시
  -- fn_program_access_grants_summary 가 원장에서 다시 계산한다.
  return jsonb_build_object(
    'status', 'charged', 'charged', true,
    'quota_total', v_summary.quota_total, 'quota_used', v_summary.quota_used,
    'quota_remaining', case when v_summary.quota_total is null then null
                            else greatest(v_summary.quota_total - v_summary.quota_used, 0) end,
    'plan_ends_at', v_summary.expires_at, 'ledger_id', v_ledger_id,
    'program_key', c_program_key
  );
end;
$$;


ALTER FUNCTION "public"."consume_performance_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."consume_performance_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") IS '회차 1개 차감(원장 기반, sql/65). 시그니처·반환 형태(jsonb 8키)·status 어휘 6종은 배포본과 동일. 살아있고 만료되지 않은 부여를 expires_at asc nulls last 순으로 소진한다 — 만료·회수된 부여는 대상에서 빠진다(결함 A/B/C 해소). 잠금 순서는 advisory(101, 프로필 단위) → program_access_grants for update(정정 5). program_access 는 제재 여부만 읽는다(정정 4). program_access.meta 에 write-back 하지 않는다.';



CREATE OR REPLACE FUNCTION "public"."consume_selfeval_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text" DEFAULT 'selfeval:write-success'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  c_program_key constant text := 'selfeval';

  v_session     public.selfeval_sessions;
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

  select * into v_session
    from public.selfeval_sessions s
   where s.id = p_session_id and s.profile_id = p_profile_id
     for update;

  if not found then
    return jsonb_build_object(
      'status', 'session_not_found', 'charged', false,
      'ledger_id', null, 'grant_id', null,
      'quota_total', null, 'quota_used', null, 'quota_remaining', null,
      'plan_ends_at', null, 'program_key', c_program_key
    );
  end if;

  -- 멱등: 이미 차감했고 되돌리지 않은 세션은 다시 차감하지 않는다.
  -- 되돌림이 끝난 세션(ledger_reversed_at 있음)의 재시도는 새로 차감한다.
  if v_session.ledger_id is not null and v_session.ledger_reversed_at is null then
    select * into v_summary
      from public.fn_program_access_grants_summary(p_profile_id, c_program_key);

    return jsonb_build_object(
      'status', 'already_charged', 'charged', false,
      'ledger_id', v_session.ledger_id, 'grant_id', null,
      'quota_total', v_summary.quota_total, 'quota_used', v_summary.quota_used,
      'quota_remaining', case when v_summary.quota_total is null then null
                              else greatest(v_summary.quota_total - v_summary.quota_used, 0) end,
      'plan_ends_at', v_summary.expires_at, 'program_key', c_program_key
    );
  end if;

  -- 운영자 제재만 program_access 캐시에서 읽는다. 기간, 회차는 원장에서만 판정한다.
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

  -- 차감 성립 = 원장 INSERT + 세션 행 연결. 세션 행을 위에서 잠갔고 advisory lock 이
  -- 동시 요청을 직렬화하므로 경합 재방어는 필요 없다.
  insert into public.performance_credit_ledger
    (profile_id, grant_id, delta, reason, source_kind)
  values (
    p_profile_id, v_selected_id, -1,
    coalesce(nullif(btrim(p_reason), ''), 'selfeval:write-success') || ':' || p_session_id::text,
    'selfeval_session'
  )
  returning id into v_ledger_id;

  update public.selfeval_sessions
     set ledger_id = v_ledger_id,
         ledger_reversed_at = null,
         updated_at = now()
   where id = p_session_id;

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


ALTER FUNCTION "public"."consume_selfeval_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."consume_selfeval_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") IS '자기평가서 세션 1개 차감(첫 모델 호출 단계 write 성공 시 1회, 같은 세션 재요청은 추가 차감 없음). selfeval 부여에서 performance_credit_ledger(source_kind=selfeval_session, session_id NULL)에 -1 을 적재하고 selfeval_sessions.ledger_id 를 갱신한다. 원장 reason 은 사유 뒤에 콜론과 session_id 를 붙여 세션을 추적할 수 있다. status 어휘: charged/already_charged/session_not_found/no_entitlement/entitlement_expired/quota_exhausted. 이미 되돌린 세션(ledger_reversed_at 있음)의 재호출은 새로 차감한다. 잠금은 consume_growth_credit 과 같은 advisory(101, 프로필 단위).';



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

  -- ── 2) 제출본이 이 세션의 것인가. **행을 잠근다** — 아래 "이미 확정됐는가" 판정과
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

  -- ── 2-1) 세션 행 잠금 — **세션 단위 직렬화 지점**.
  --       (2)의 잠금은 대상 제출본 **한 행**뿐이라, 같은 세션의 **서로 다른** 제출본
  --       2건에 대한 finalize 가 동시에 들어오면 잠금이 겹치지 않는다. 그러면 둘 다
  --       (4)를 "확정된 행 없음"으로 읽고 (6)까지 진행해, 뒤늦은 쪽이
  --       `performance_submissions_one_final_per_session_idx`(54번 1-6)에서 23505를
  --       맞는다 → 호출부는 `commitError` 분기로 **500**을 본다(`finalize.js`).
  --       즉 위 (2) 주석과 파일 상단 멱등 ③이 약속한 `already_finalized_other` 분기가
  --       그 조합에서만 성립하지 않았다(검토 P11). 세션 행을 잠가 (4)~(7)을 세션 단위로
  --       직렬화한다 — 뒤늦은 쪽은 앞선 트랜잭션이 커밋된 뒤에 (4)를 읽으므로 정상 분기한다.
  --
  --       ⚠ 잠금 순서는 **제출본 → 세션**이다. (4) `commit_performance_evaluation_report`
  --       도 제출본 update → 세션 update 순이라 두 함수의 순서가 같다. 여기서 세션을
  --       먼저 잠그면 순서가 뒤집혀 두 함수가 교착(deadlock)할 수 있다 — 이 블록을
  --       (2) 위로 올리지 마라.
  perform 1
    from public.performance_sessions s
   where s.id = p_session_id
     for update;

  -- ── 3) 이미 이 제출본이 최종본이면 **아무것도 바꾸지 않고** 성공을 돌려준다(멱등 ②).
  --       finalize_reason을 덮어쓰지 않는다 — 최초 확정이 정본이다.
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

  -- ── 4) 다른 제출본이 이미 확정돼 있는가(멱등 ③ → §8.6 409 ALREADY_FINALIZED_OTHER).
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

  -- ── 7) 최종 제출 리포트 upsert(세션당 1행, (2)의 부분 UNIQUE가 충돌 대상).
  --       score/summary는 null이다 — 모델 산출물이 아니라 학생 원고다.
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

  -- ── 8) 세션 종료 표시(위 「세션 상태」 주석 — 잠그는 것이 아니다).
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


COMMENT ON FUNCTION "public"."finalize_performance_submission"("p_session_id" "uuid", "p_profile_id" "uuid", "p_submission_id" "uuid", "p_reason" "text", "p_sections" "jsonb") IS '최종 확정 단일 트랜잭션 — is_final 고정(세션당 1건 부분 UNIQUE) + final_submission 리포트 upsert + 세션 completed + rag_use 승격. 같은 제출본 재확정은 already_final(멱등 200), 다른 제출본이 이미 확정이면 already_finalized_other(409)다. 회차는 건드리지 않는다.';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_members" (
    "profile_id" "uuid" NOT NULL,
    "role_id" "uuid",
    "department" "text",
    "status" "text" DEFAULT 'invited'::"text" NOT NULL,
    "invited_by" "uuid",
    "invited_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "activated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "admin_members_status_check" CHECK (("status" = ANY (ARRAY['invited'::"text", 'active'::"text", 'suspended'::"text"])))
);


ALTER TABLE "public"."admin_members" OWNER TO "postgres";


COMMENT ON COLUMN "public"."admin_members"."role_id" IS '대표 역할 1개. 클라이언트 요구("이름별로 대표그룹을 설정")의 그 자리다 — 여기서 기본을 주고 admin_member_permissions 로 사람별 예외를 더하거나 뺀다.';



CREATE OR REPLACE FUNCTION "public"."fn_activate_admin_member"() RETURNS "public"."admin_members"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_row public.admin_members;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  update public.admin_members
     set status       = 'active',
         activated_at = coalesce(activated_at, now()),
         updated_at   = now()
   where profile_id = auth.uid()
     and status = 'invited'
  returning * into v_row;

  -- 이미 활성이거나 정지 상태면 그대로 돌려준다(재호출이 상태를 되돌리지 않는다).
  if not found then
    select * into v_row from public.admin_members where profile_id = auth.uid();
  end if;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."fn_activate_admin_member"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_activate_admin_member"() IS '초대받은 관리자가 첫 진입 시 자기 행을 invited → active 로 바꾼다(20260822000012). 정지(suspended)는 되살리지 않고, role_id 도 바꾸지 않는다 — 권한은 초대한 최고 관리자가 정한다.';



CREATE OR REPLACE FUNCTION "public"."fn_add_months_kst"("p_ts" timestamp with time zone, "p_months" integer) RETURNS timestamp with time zone
    LANGUAGE "sql" IMMUTABLE
    AS $$
  -- p_months IS NULL = 무기한 → NULL 을 돌려준다(호출부가 그 규약에 의존한다).
  -- make_interval(months => n) 은 달력 개월이라 말일을 클램프한다:
  --   KST 1/31 + 1개월 = KST 2/28,  KST 2/29(윤년) + 12개월 = KST 2/28.
  select case
           when p_months is null then null
           else ((date_trunc('day', p_ts at time zone 'Asia/Seoul')
                  + make_interval(months => p_months)) at time zone 'Asia/Seoul')
         end;
$$;


ALTER FUNCTION "public"."fn_add_months_kst"("p_ts" timestamp with time zone, "p_months" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_add_months_kst"("p_ts" timestamp with time zone, "p_months" integer) IS 'KST 달력 기준 개월 덧셈. 반환값은 이용 기간의 **배타 상한**이다(만료일 24시 = 익일 00시). p_months IS NULL → NULL(무기한). timestamptz + interval 은 세션 TimeZone 에 의존해 하루 틀리므로 쓰지 말 것(sql/64 (나)).';



CREATE OR REPLACE FUNCTION "public"."fn_admin_can"("p_resource" "text", "p_need" "text" DEFAULT 'view'::"text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
      from public.fn_admin_effective_permissions(auth.uid()) p
     where p.resource_key = p_resource
       and (p.level = 'edit' or (p_need = 'view' and p.level = 'view'))
  );
$$;


ALTER FUNCTION "public"."fn_admin_can"("p_resource" "text", "p_need" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_admin_effective_permissions"("p_profile_id" "uuid") RETURNS TABLE("resource_key" "text", "level" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with member as (
    select m.profile_id, m.role_id, m.status, r.is_super
      from public.admin_members m
      left join public.admin_roles r on r.id = m.role_id
     where m.profile_id = p_profile_id
  ),
  -- 정지·미활성화는 어떤 항목을 갖고 있든 전부 무효다.
  active_member as (
    select * from member where status = 'active'
  ),
  granted as (
    -- 묶음이 준 것
    select rp.resource_key, rp.level
      from active_member am
      join public.admin_role_permissions rp on rp.role_id = am.role_id
     where not coalesce(am.is_super, false)
    union all
    -- 사람에게 직접 준 것
    select mp.resource_key, mp.level
      from active_member am
      join public.admin_member_permissions mp on mp.profile_id = am.profile_id
     where not coalesce(am.is_super, false)
  )
  -- 최고 관리자는 전 메뉴 edit 으로 단락한다(새 메뉴 자동 포함).
  select res.key, 'edit'::text
    from public.admin_resources res, active_member am
   where coalesce(am.is_super, false) and res.is_active
  union all
  select g.resource_key,
         case
           -- 규칙 1: none 이 하나라도 있으면 무조건 잠근다.
           when bool_or(g.level = 'none') then 'none'
           -- 규칙 2: 남은 것 중 가장 높은 수준.
           when bool_or(g.level = 'edit') then 'edit'
           else 'view'
         end
    from granted g
   group by g.resource_key;
$$;


ALTER FUNCTION "public"."fn_admin_effective_permissions"("p_profile_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_admin_effective_permissions"("p_profile_id" "uuid") IS '한 사람의 최종 권한(20260822000010_admin_permissions). 규칙은 deny-wins → 최고수준 → default deny. 여기 안 나오는 메뉴는 접근 불가다(규칙 3은 "행이 없음"으로 표현된다).';



CREATE TABLE IF NOT EXISTS "public"."refund_requests" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "order_id" "text" NOT NULL,
    "order_name" "text",
    "amount" integer DEFAULT 0 NOT NULL,
    "reason" "text",
    "refund_bank" "text",
    "refund_account" "text",
    "refund_holder" "text",
    "status" "text" DEFAULT 'requested'::"text" NOT NULL,
    "admin_memo" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "student_profile_id" "uuid" NOT NULL,
    "parent_profile_id" "uuid" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "approval_status" "text" NOT NULL,
    "approval_responded_at" timestamp with time zone,
    "approval_reject_reason" "text",
    "order_item_id" bigint,
    "gross_amount" integer,
    "policy_code" "text",
    "needs_review" boolean DEFAULT false NOT NULL,
    "quote" "jsonb",
    "toss_cancel" "jsonb",
    "completed_at" timestamp with time zone,
    "processed_by" "uuid",
    "refund_method" "text",
    "order_item_ids" bigint[],
    "company_fault" boolean DEFAULT false NOT NULL,
    "within_withdrawal" boolean,
    "bundle_return_amount" integer,
    "terms_version" "text" DEFAULT 'v10'::"text" NOT NULL,
    "coupon_restored_at" timestamp with time zone,
    CONSTRAINT "refund_requests_amount_check" CHECK (("amount" >= 0)),
    CONSTRAINT "refund_requests_approval_before_processing_check" CHECK ((("approval_status" = 'approved'::"text") OR ("status" = ANY (ARRAY['requested'::"text", 'rejected'::"text"])))),
    CONSTRAINT "refund_requests_approval_status_check" CHECK (("approval_status" = ANY (ARRAY['requested'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "refund_requests_bundle_return_amount_check" CHECK ((("bundle_return_amount" IS NULL) OR ("bundle_return_amount" >= 0))),
    CONSTRAINT "refund_requests_gross_amount_check" CHECK ((("gross_amount" IS NULL) OR (("gross_amount" > 0) AND ("amount" <= "gross_amount")))),
    CONSTRAINT "refund_requests_order_item_ids_nonempty_check" CHECK ((("order_item_ids" IS NULL) OR ("cardinality"("order_item_ids") > 0))),
    CONSTRAINT "refund_requests_parent_auto_approve_check" CHECK ((("requested_by" <> "parent_profile_id") OR ("approval_status" = 'approved'::"text"))),
    CONSTRAINT "refund_requests_refund_method_check" CHECK ((("refund_method" IS NULL) OR ("refund_method" = ANY (ARRAY['계좌이체'::"text", '카드취소'::"text"])))),
    CONSTRAINT "refund_requests_reject_reason_pairing_check" CHECK ((("approval_status" = 'rejected'::"text") = ("approval_reject_reason" IS NOT NULL))),
    CONSTRAINT "refund_requests_requested_by_pair_check" CHECK ((("requested_by" = "student_profile_id") OR ("requested_by" = "parent_profile_id"))),
    CONSTRAINT "refund_requests_responded_at_pairing_check" CHECK ((("approval_status" = 'requested'::"text") = ("approval_responded_at" IS NULL))),
    CONSTRAINT "refund_requests_status_check" CHECK (("status" = ANY (ARRAY['requested'::"text", 'processing'::"text", 'completed'::"text", 'rejected'::"text"]))),
    CONSTRAINT "refund_requests_terms_version_check" CHECK (("terms_version" = ANY (ARRAY['v9'::"text", 'v10'::"text"]))),
    CONSTRAINT "refund_requests_user_id_is_requester_check" CHECK (("user_id" = "requested_by"))
);


ALTER TABLE "public"."refund_requests" OWNER TO "postgres";


COMMENT ON COLUMN "public"."refund_requests"."amount" IS '실제 환불할 금액(제33조 산정 결과, sql/72). 어드민 환불 실행이 읽는 정본. 2026-08-13 이전에는 orders.amount 전액이었다 — 그때 생성된 행과 의미가 다르므로 gross_amount 와 함께 읽을 것.';



COMMENT ON COLUMN "public"."refund_requests"."student_profile_id" IS '이 환불이 속한 주문의 학생(orders.student_profile_id 스냅샷). 승인 판정은 이 값으로 하지 parent_child_links 현재 상태로 하지 않는다(sql/68 fn_request_refund 주석).';



COMMENT ON COLUMN "public"."refund_requests"."parent_profile_id" IS '이 환불이 속한 주문의 학부모(orders.parent_profile_id 스냅샷).';



COMMENT ON COLUMN "public"."refund_requests"."requested_by" IS '이 환불을 실제로 신청한 사람(학생 또는 학부모). user_id 와 항상 같다(refund_requests_user_id_is_requester_check).';



COMMENT ON COLUMN "public"."refund_requests"."approval_status" IS '학부모 승인축. 학생 신청은 requested 로 시작해 학부모 응답을 기다린다. 학부모 본인 신청은 즉시 approved(refund_requests_parent_auto_approve_check). status(어드민 처리축)와는 별개다 — status 는 approval_status=approved 가 되기 전까지 requested 를 벗어나지 못한다(refund_requests_approval_before_processing_check).';



COMMENT ON COLUMN "public"."refund_requests"."order_item_id" IS '항목 단위(부분) 환불 확장 지점(2026-08-12 팀 리드 지시) — 1차는 이 컬럼을 항상 NULL 로 채운다(fn_request_refund 가 인자를 받지 않는다). NULL = 주문 전체 환불(1차가 쓰는 유일한 값). 값이 있으면 그 order_item 하나에 대한 부분 환불(2차, 미구현) — 그때 fn_request_refund 에 p_order_item_id 인자와 항목 금액 산정(order_items.price * quantity 기준이 될 것)을 추가하면 스키마 변경 없이 열린다.';



COMMENT ON COLUMN "public"."refund_requests"."gross_amount" IS '신청 시점 orders.amount 스냅샷(원 결제 금액). 취소 수수료 = gross_amount − amount 로 파생한다 — 수수료를 따로 저장하지 않는 이유는 두 값이 어긋난 행을 만들 수 있기 때문이다(sql/72 (바)).';



COMMENT ON COLUMN "public"."refund_requests"."policy_code" IS '적용된 제33조 규칙. before_start(이용 시작 전 전액) / sessions_prorated(⑤ 잔여 회차 비례) / single_use_closed(③ 1회 이용권 개시 후) / period_tier(② 1개월 이내 계단) / period_prorated(⑧ 정가 재산정) / mixed(라인별 상이) / no_grant(부여 원장 없음).';



COMMENT ON COLUMN "public"."refund_requests"."needs_review" IS 'true = 자동 산정 근거가 불충분해 어드민이 반드시 눈으로 확인해야 하는 건(현재는 no_grant 케이스 한 종류). 환불 실행 화면에서 경고를 띄우는 용도.';



COMMENT ON COLUMN "public"."refund_requests"."quote" IS '산정 당시 라인별 근거 스냅샷(fn_refund_quote.lines). 상품 정의·소비 이력이 나중에 바뀌어도 그때의 계산을 재구성할 수 있어야 한다.';



COMMENT ON COLUMN "public"."refund_requests"."toss_cancel" IS '토스 결제취소 API(POST /v1/payments/{paymentKey}/cancel) 응답 원본, 또는 재클릭 시 GET 조회로 확인한 기취소 항목(api/complete-refund.ts). fn_complete_refund 는 이 컬럼을 보지 않는다 — 취소 성공 여부의 증빙일 뿐 상태 전이 판정에는 쓰이지 않는다.';



COMMENT ON COLUMN "public"."refund_requests"."completed_at" IS '환불이 실제로 완결된 시각. fn_complete_refund 가 찍는다. 이 컬럼이 생기기 전(20260831081100)에 처리된 건은 NULL 이다 — 실제 시각을 알 수 없어 소급하지 않았다.';



COMMENT ON COLUMN "public"."refund_requests"."processed_by" IS '환불 완료를 실행한 어드민(profiles.id). 계정이 지워져도 대장은 남아야 하므로 on delete set null.';



COMMENT ON COLUMN "public"."refund_requests"."refund_method" IS '계좌이체 | 카드취소. 완료 시점에 확정해서 박는다 — 환불계좌 유무로 나중에 유추하면 계좌 정보가 바뀔 때 과거 대장이 조용히 달라진다.';



COMMENT ON COLUMN "public"."refund_requests"."order_item_ids" IS '부분해지 대상 구성서비스(order_items.id 배열, §2-10 권장 (b)). NULL = 주문 전체. 열린 신청 간 항목 겹침은 fn_request_refund 가 주문 advisory lock 아래에서 배열 겹침 검사로 막는다(WC061) — 유니크 인덱스는 전체 환불 축(NULL)만 지킨다.';



COMMENT ON COLUMN "public"."refund_requests"."company_fault" IS '회사 귀책 여부(제33조의1 ⑪ 예외 1호 — 정가 재산정 면제). 어드민 전용 fn_admin_requote_refund 만 true 로 바꾼다. 신청자가 고른 사유(reason)는 주장일 뿐 판정이 아니다(§2-9).';



COMMENT ON COLUMN "public"."refund_requests"."within_withdrawal" IS '신청 시점 산정에서 모든 대상 라인이 청약철회기간(제32조 ①, 이용 가능일부터 7일) 안이었는지. fn_refund_quote v10 출력의 스냅샷.';



COMMENT ON COLUMN "public"."refund_requests"."bundle_return_amount" IS '제33조의2 ⑦ 동시결제 조건부 할인 반환금 합. 현 데이터 모델에는 조건부 할인을 표현하는 컬럼이 없어 항상 0(§2-5 — 8/30 재정의 ⑦-1로 장기할인·쿠폰은 명시 제외).';



COMMENT ON COLUMN "public"."refund_requests"."terms_version" IS '이 신청이 어느 약관 버전 산식으로 산정됐는가. v9 = 20260901 이전(100원 내림·주문 전체만), v10 = 제33조의1~3 Ver10. v9 행은 재산정하지 않으며(§3-4) fn_complete_refund 의 WC039 재견적 비교를 건너뛴다.';



COMMENT ON COLUMN "public"."refund_requests"."coupon_restored_at" IS '전부 청약철회(제33조의3 ⑤)로 이 주문의 쿠폰 사용을 복원(coupon_redemptions.voided_at 기록)한 시각. fn_complete_refund 가 찍는다.';



COMMENT ON CONSTRAINT "refund_requests_amount_check" ON "public"."refund_requests" IS '0원 환불 신청을 허용한다(sql/72). 제33조 ③(1회 이용권 개시 후)·②(1/2 경과 후)의 산정 결과가 정당하게 0원일 수 있다 — 그 경우에도 신청은 접수하고 어드민이 사유를 보고 판단한다. 2026-08-13 이전 제약은 amount > 0 이었다(sql/59, 전액 환불만 존재하던 시절).';



COMMENT ON CONSTRAINT "refund_requests_approval_before_processing_check" ON "public"."refund_requests" IS '미승인 환불 신청(approval_status in requested/rejected)은 어드민 처리축(status)이 requested 또는 rejected 만 될 수 있다 — processing/completed 는 approval_status=approved 가 되어야만 갈 수 있다(sql/68 원문 의도 유지). rejected 추가(sql/69, 내 설계 오류 수정) — 학부모가 반려한 건을 어드민이 종결(rejected)할 수 있어야 한다. 기존 CHECK(status=requested 고정)는 반려 환불이 어드민 큐를 영구 오염시켰다(R5 재현).';



COMMENT ON CONSTRAINT "refund_requests_gross_amount_check" ON "public"."refund_requests" IS '환불액이 원 결제액을 넘을 수 없다. NULL 허용은 sql/72 이전 행(gross_amount 백필 근거 없음) 때문이다 — 신규 행은 fn_request_refund 가 항상 채운다.';



COMMENT ON CONSTRAINT "refund_requests_status_check" ON "public"."refund_requests" IS '10_pricing_orders.sql:264 테이블 주석 및 src/pages/MyPage.jsx REFUND_STATUS 라벨과 일치하는 4개 값(M8, 2026-08-11). 신규 값 도입 시 두 파일과 함께 갱신할 것.';



CREATE OR REPLACE FUNCTION "public"."fn_admin_requote_refund"("p_refund_request_id" bigint, "p_company_fault" boolean) RETURNS "public"."refund_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_order_id text;
  v_row      public.refund_requests;
  v_quote    record;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- 락 순서는 fn_complete_refund 와 동일하게 advisory(주문) → 행 FOR UPDATE.
  -- 역순으로 잡으면 완료 RPC 와 데드락 쌍이 된다.
  select r.order_id into v_order_id
    from public.refund_requests r
   where r.id = p_refund_request_id;

  if v_order_id is null then
    raise exception 'refund_request_not_found' using errcode = 'WC026';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_order_id, 100));

  select * into v_row from public.refund_requests where id = p_refund_request_id for update;
  if not found then
    raise exception 'refund_request_not_found' using errcode = 'WC026';
  end if;

  if v_row.approval_status <> 'approved' then
    raise exception 'refund_not_approved_for_completion' using errcode = 'WC035';
  end if;

  if v_row.status not in ('requested', 'processing') then
    raise exception 'refund_completion_not_processable'
      using errcode = 'WC036',
            detail  = format('refund_request_id=%s status=%s', p_refund_request_id, v_row.status);
  end if;

  -- Ver9 행은 재산정 금지(§3-4) — 신청 시점 약관으로 확정된 금액이다.
  if v_row.terms_version = 'v9' then
    raise exception 'refund_requote_terms_v9'
      using errcode = 'WC062',
            detail  = format('refund_request_id=%s — v9 산정 건은 재산정하지 않는다(§3-4)', p_refund_request_id);
  end if;

  select * into v_quote
    from public.fn_refund_quote(v_row.order_id, v_row.order_item_ids,
                                p_company_fault, now());

  -- 감액은 어드민 단독 갱신 불가 — 신청자가 동의한 금액보다 줄어드는
  -- 변경은 재동의(반려 후 재신청)가 필요하다(§2-9 권장: 증액만 허용).
  if v_quote.refund_amount < v_row.amount then
    raise exception 'refund_requote_decrease'
      using errcode = 'WC063',
            detail  = format('refund_request_id=%s current=%s requote=%s — 감액 재산정은 반려 후 재신청으로 처리할 것',
                             p_refund_request_id, v_row.amount, v_quote.refund_amount);
  end if;

  update public.refund_requests
     set company_fault        = p_company_fault,
         amount               = v_quote.refund_amount,
         gross_amount         = v_quote.gross_amount,
         policy_code          = v_quote.policy_code,
         needs_review         = v_quote.needs_review,
         within_withdrawal    = v_quote.within_withdrawal,
         bundle_return_amount = v_quote.bundle_return_amount,
         quote                = v_quote.lines
   where id = p_refund_request_id
  returning * into v_row;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."fn_admin_requote_refund"("p_refund_request_id" bigint, "p_company_fault" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_admin_requote_refund"("p_refund_request_id" bigint, "p_company_fault" boolean) IS '어드민 전용(20260901 Ver10, §2-9). 회사 귀책(제33조의1 ⑪ 예외 1호)을 세팅하고 fn_refund_quote 를 같은 대상 항목으로 다시 돌려 amount/quote 를 갱신한다. approved·미완료(requested/processing) 건만(WC035/WC036), v9 산정 건 금지(WC062), 감액 재산정은 신청자 재동의가 필요해 거부(WC063 — 반려 후 재신청 경로). 사용자 화면에는 회사 귀책 입력이 없다 — 신청 사유는 주장, 판정은 어드민.';



CREATE OR REPLACE FUNCTION "public"."fn_admin_set_profile_tenant"("p_profile_id" "uuid", "p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not public.fn_admin_can('members', 'edit') then
    raise exception 'not_authorized' using errcode = 'WC072';
  end if;

  if p_tenant_id is not null and not exists (
    select 1 from public.tenants t where t.id = p_tenant_id
  ) then
    raise exception 'tenant_not_found';
  end if;

  perform set_config('app.tenant_set_via_rpc', '1', true);

  update public.profiles
     set tenant_id  = p_tenant_id,
         updated_at = now()
   where id = p_profile_id;
end;
$$;


ALTER FUNCTION "public"."fn_admin_set_profile_tenant"("p_profile_id" "uuid", "p_tenant_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_admin_set_profile_tenant"("p_profile_id" "uuid", "p_tenant_id" "uuid") IS '20260922 — 회원 관리 편집 권한(fn_admin_can(''members'',''edit''), 20260822000010) 보유 관리자 전용. p_tenant_id 가 NULL 이면 소속 해제, 존재하지 않는 tenant 면 거부(WC072 는 권한 없음 전용 — tenant 미존재는 별도 메시지). fn_set_my_tenant 와 동일하게 트리거 우회 설정을 켜고 UPDATE 한다.';



CREATE OR REPLACE FUNCTION "public"."fn_agree_payment_terms"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.user_term_agreements (user_id, term_id, agreed)
  select v_user_id, t.id, true
  from public.terms t
  where t.is_active
    and t.code in ('refund_notice', 'payment_terms', 'payment_consent')
  on conflict (user_id, term_id) do update
  set agreed    = true,
      agreed_at = now();

  return jsonb_build_object('ok', true);
end;
$$;


ALTER FUNCTION "public"."fn_agree_payment_terms"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_ai_telemetry_citations"("p_from" timestamp with time zone, "p_to" timestamp with time zone) RETURNS TABLE("resource_id" "uuid", "title" "text", "knowledge_type" "text", "is_active" boolean, "hit_count" bigint, "cited_count" bigint, "last_hit_at" timestamp with time zone, "last_cited_at" timestamp with time zone)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  with ev as (
    select e.created_at, e.hit_resource_ids, e.cited_resource_ids
    from public.ai_retrieval_events e
    where e.created_at >= p_from
      and e.created_at < p_to
      and e.kind = 'knowledge'
  ),
  hits as (
    select h.rid as rid, count(*) as n, max(ev.created_at) as last_at
    from ev, unnest(ev.hit_resource_ids) as h(rid)
    group by h.rid
  ),
  cites as (
    select c.rid as rid, count(*) as n, max(ev.created_at) as last_at
    from ev, unnest(ev.cited_resource_ids) as c(rid)
    group by c.rid
  ),
  agg as (
    select
      coalesce(hits.rid, cites.rid) as rid,
      coalesce(hits.n, 0) as hit_count,
      coalesce(cites.n, 0) as cited_count,
      hits.last_at as last_hit_at,
      cites.last_at as last_cited_at
    from hits
    full outer join cites on cites.rid = hits.rid
  )
  select
    k.id as resource_id,
    k.title,
    k.knowledge_type,
    k.is_active,
    coalesce(agg.hit_count, 0)::bigint as hit_count,
    coalesce(agg.cited_count, 0)::bigint as cited_count,
    agg.last_hit_at,
    agg.last_cited_at
  from public.winning_assessment_knowledge_items k
  left join agg on agg.rid = k.id
  order by cited_count asc, hit_count asc, k.title;
$$;


ALTER FUNCTION "public"."fn_ai_telemetry_citations"("p_from" timestamp with time zone, "p_to" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_ai_telemetry_daily_summary"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_service" "text" DEFAULT NULL::"text") RETURNS TABLE("day" "date", "service" "text", "model" "text", "calls" bigint, "ok_calls" bigint, "error_calls" bigint, "retried_calls" bigint, "prompt_tokens" bigint, "output_tokens" bigint, "cached_tokens" bigint, "thoughts_tokens" bigint, "p50_ms" double precision, "p95_ms" double precision, "avg_ms" double precision)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select
    (c.created_at at time zone 'Asia/Seoul')::date as day,
    c.service,
    c.model,
    count(*) as calls,
    count(*) filter (where c.status = 'ok') as ok_calls,
    count(*) filter (where c.status = 'error') as error_calls,
    count(*) filter (where c.attempt > 1) as retried_calls,
    coalesce(sum(c.prompt_tokens), 0)::bigint as prompt_tokens,
    coalesce(sum(c.output_tokens), 0)::bigint as output_tokens,
    coalesce(sum(c.cached_tokens), 0)::bigint as cached_tokens,
    coalesce(sum(c.thoughts_tokens), 0)::bigint as thoughts_tokens,
    percentile_cont(0.5) within group (order by c.latency_ms) as p50_ms,
    percentile_cont(0.95) within group (order by c.latency_ms) as p95_ms,
    avg(c.latency_ms)::double precision as avg_ms
  from public.ai_model_calls c
  where c.created_at >= p_from
    and c.created_at < p_to
    and (p_service is null or c.service = p_service)
    and c.kind = 'generate'
  group by 1, c.service, c.model
  order by 1, c.service, c.model;
$$;


ALTER FUNCTION "public"."fn_ai_telemetry_daily_summary"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_service" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_complete_refund"("p_refund_request_id" bigint, "p_admin_memo" "text" DEFAULT NULL::"text") RETURNS "public"."refund_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_order_id         text;
  v_row              public.refund_requests;
  v_order            public.orders;
  v_completed_amount integer;
  v_revoke_result    jsonb;
  v_quote            record;
  v_method           text;
  v_restored         integer := 0;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select r.order_id into v_order_id
    from public.refund_requests r
   where r.id = p_refund_request_id;

  if v_order_id is null then
    raise exception 'refund_request_not_found' using errcode = 'WC026';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_order_id, 100));

  select * into v_row from public.refund_requests where id = p_refund_request_id for update;
  if not found then
    raise exception 'refund_request_not_found' using errcode = 'WC026';
  end if;

  select * into v_order from public.orders where id = v_row.order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'WC010';
  end if;

  if v_row.approval_status <> 'approved' then
    raise exception 'refund_not_approved_for_completion' using errcode = 'WC035';
  end if;

  if v_row.status not in ('requested', 'processing') then
    raise exception 'refund_completion_not_processable'
      using errcode = 'WC036',
            detail  = format('refund_request_id=%s status=%s', p_refund_request_id, v_row.status);
  end if;

  -- 재견적 가드(WC039) — 신청 이후 추가 이용이 생겨 산정액이 줄었으면
  -- 거부한다. 금액이 바뀌면 신청자에게 다시 동의를 받아야 하므로 조용히
  -- 깎지 않는다. 신청 시점과 같은 조건(대상 항목·회사 귀책)으로 재현한다.
  --
  -- terms_version='v9' 행은 이 비교를 건너뛴다(§3-4) — Ver9 산식(100원
  -- 내림)으로 확정·동의된 금액을 v10 산식과 비교하면 만료 규칙(expired
  -- 0원) 등으로 정당한 완료까지 막힌다. WC037 누적 상한은 그대로 지킨다.
  if v_row.terms_version <> 'v9' then
    select * into v_quote
      from public.fn_refund_quote(v_row.order_id, v_row.order_item_ids,
                                  v_row.company_fault, now());
    if v_quote.refund_amount < v_row.amount then
      raise exception 'refund_quote_changed'
        using errcode = 'WC039',
              detail  = format('refund_request_id=%s requested_amount=%s current_quote=%s — 신청 이후 추가 이용이 발생했다. 반려 후 재신청을 받을 것.',
                               p_refund_request_id, v_row.amount, v_quote.refund_amount);
    end if;
  end if;

  select coalesce(sum(r.amount), 0) into v_completed_amount
    from public.refund_requests r
   where r.order_id = v_row.order_id
     and r.status = 'completed'
     and r.id <> p_refund_request_id;

  if v_completed_amount + v_row.amount > v_order.amount then
    raise exception 'refund_amount_exceeds_paid'
      using errcode = 'WC037',
            detail  = format('order_id=%s completed_amount=%s this_amount=%s orders.amount=%s',
                             v_row.order_id, v_completed_amount, v_row.amount, v_order.amount);
  end if;

  -- 환불방법 확정(QA 273·275, 20260831081100 원문).
  v_method := case
    when coalesce(btrim(v_row.refund_bank), '') <> '' then '계좌이체'
    else '카드취소'
  end;

  perform set_config('winning.refund_completing', p_refund_request_id::text, true);

  update public.refund_requests
     set status        = 'completed',
         admin_memo    = coalesce(p_admin_memo, admin_memo),
         completed_at  = coalesce(completed_at, now()),
         processed_by  = coalesce(processed_by, auth.uid()),
         refund_method = coalesce(refund_method, v_method)
   where id = p_refund_request_id
  returning * into v_row;

  -- 부분해지면 대상 라인만 회수한다(제33조의2 ② — 잔여 구성서비스 존속 ⑧).
  v_revoke_result := public.fn_revoke_program_access_for_order(
    v_row.order_id, v_order.user_id, 'refunded', 'refund_completed',
    v_row.order_item_ids);

  -- 주문 종결은 살아있는 부여가 0이 됐을 때만(§3-2). 부분환불 주문은
  -- 'paid' 로 남고, "일부 환불" 표시는 화면이 완료 누적액으로 파생한다
  -- (§2-11 — orders_status_check 에 새 상태를 만들지 않는다).
  if not exists (
    select 1 from public.program_access_grants g
     where g.order_id = v_row.order_id and g.revoked_at is null
  ) then
    update public.orders
       set status = 'refunded'
     where id = v_row.order_id;
  end if;

  -- 전부 청약철회 쿠폰 복원(제33조의3 ⑤) — v10 재견적이 조건 충족을
  -- 판정했고, 쿠폰 자체가 아직 유효기간 안일 때만 사용 이력을 무효화해
  -- 되살린다(coupon_redemptions.voided_at — fn_coupon_is_redeemed 가 보는
  -- 단일 축). 유효기간이 지난 쿠폰은 복원해도 쓸 수 없으므로 건드리지
  -- 않는다(⑤ 단서).
  -- v9 행은 v_quote 가 애초에 실행되지 않으므로(WC039 우회) 바깥 if 로
  -- 먼저 갈라 미할당 record 필드 접근을 원천 차단한다.
  if v_row.terms_version <> 'v9' then
    if coalesce(v_quote.coupon_restore, false) then
      with restored as (
        update public.coupon_redemptions cr
           set voided_at   = now(),
               void_reason = 'refund_withdrawal_full'
          from public.coupons c
         where c.id = cr.coupon_id
           and cr.order_id = v_row.order_id
           and cr.voided_at is null
           and (c.valid_until is null
                or c.valid_until >= (now() at time zone 'Asia/Seoul')::date)
        returning cr.id
      )
      select count(*) into v_restored from restored;

      if v_restored > 0 then
        update public.refund_requests
           set coupon_restored_at = now()
         where id = p_refund_request_id
        returning * into v_row;
      end if;
    end if;
  end if;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."fn_complete_refund"("p_refund_request_id" bigint, "p_admin_memo" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_complete_refund"("p_refund_request_id" bigint, "p_admin_memo" "text") IS '환불 완료 단일 정본 RPC(20260901 Ver10). 20260831081100 의 완료 기록 3종(completed_at·processed_by·refund_method) 위에: 재견적을 신청 조건(order_item_ids·company_fault)으로 재현, v9 행은 WC039 비교 우회(§3-4, WC037 유지), 부분 회수(잔여 구성서비스 존속), orders.status=refunded 는 살아있는 부여 0일 때만, 전부 청약철회면 유효기간 내 쿠폰 사용 이력을 자동 복원(제33조의3 ⑤, coupon_restored_at 기록). 가드 42501/WC026/WC035/WC036/WC037/WC039.';



CREATE OR REPLACE FUNCTION "public"."fn_coupon_by_code"("p_code" "text", "p_subtotal" integer DEFAULT 0, "p_student_profile_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("id" "uuid", "title" "text", "discount_amount" integer, "min_amount" integer, "valid_until" "date", "is_active" boolean, "eligible" boolean, "reason" "text", "owner_profile_id" "uuid", "owner_is_student" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_caller  uuid := auth.uid();
  v_student uuid;
  v_parent  uuid;
  v_today   date := (now() at time zone 'Asia/Seoul')::date;
  v_code    text := lower(trim(coalesce(p_code, '')));
begin
  if p_student_profile_id is null then
    v_student := v_caller;
  else
    if v_caller is distinct from p_student_profile_id
       and not public.fn_is_linked_pair(v_caller, p_student_profile_id) then
      raise exception 'not_authorized_for_student' using errcode = 'WC030';
    end if;
    v_student := p_student_profile_id;
  end if;

  if v_code = '' then
    return;
  end if;

  select l.parent_id into v_parent
    from public.parent_child_links l
   where l.student_id = v_student and l.status = 'approved'
   limit 1;

  if v_student is null or v_parent is null then
    return;
  end if;

  return query
  select
    c.id,
    c.title,
    c.discount_amount,
    c.min_amount,
    eff.until_date as valid_until,
    c.is_active,
    (
      c.is_active
      and (eff.until_date is null or eff.until_date >= v_today)
      and coalesce(p_subtotal, 0) >= c.min_amount
      and (c.max_uses_per_user is null or v_student is not null)
      and not chk.is_sold_out
      and (c.grant_type <> 'granted' or own.owner_id is not null)
      and org.matches
    ) as eligible,
    case
      when not c.is_active then 'inactive'
      when eff.until_date is not null and eff.until_date < v_today then 'expired'
      when coalesce(p_subtotal, 0) < c.min_amount then 'below_min_amount'
      when not org.matches then 'org_mismatch'
      when c.max_uses_per_user is not null and v_student is null then 'login_required'
      when c.grant_type = 'granted' and not own.is_granted_overall then 'not_granted'
      when chk.is_sold_out then 'sold_out'
      when c.grant_type = 'granted' and own.owner_id is null then 'already_used'
      else null
    end as reason,
    own.owner_id as owner_profile_id,
    (own.owner_id is not null and own.owner_id = v_student) as owner_is_student
  from public.coupons c
  cross join lateral (
    select
      public.fn_coupon_is_granted(c.id, v_student) as is_granted_student,
      public.fn_coupon_is_granted(c.id, v_parent)  as is_granted_parent,
      public.fn_coupon_is_redeemed(c.id, v_student, now()) as is_redeemed_student,
      public.fn_coupon_is_redeemed(c.id, v_parent, now())  as is_redeemed_parent,
      public.fn_coupon_global_redeemed(c.id, now()) as is_sold_out,
      public.fn_coupon_grant_valid_until(c.id, v_student) as grant_until_student,
      public.fn_coupon_grant_valid_until(c.id, v_parent)  as grant_until_parent
  ) as chk
  cross join lateral (
    select
      (chk.is_granted_student or chk.is_granted_parent) as is_granted_overall,
      case
        when c.grant_type <> 'granted' then null
        when chk.is_granted_student and not chk.is_redeemed_student then v_student
        when chk.is_granted_parent and not chk.is_redeemed_parent then v_parent
        else null
      end as owner_id
  ) as own
  cross join lateral (
    select
      least(
        c.valid_until,
        greatest(chk.grant_until_student, chk.grant_until_parent)
      ) as until_date
  ) as eff
  cross join lateral (
    select public.fn_coupon_org_matches(c.org_code, v_student, v_parent) as matches
  ) as org
  where c.code is not null
    and lower(c.code) = v_code
  limit 1;
end;
$$;


ALTER FUNCTION "public"."fn_coupon_by_code"("p_code" "text", "p_subtotal" integer, "p_student_profile_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_coupon_by_code"("p_code" "text", "p_subtotal" integer, "p_student_profile_id" "uuid") IS '코드 직접 입력 조회 전용(sql/68 5-h절 쌍 축 재작성). code 를 입력으로만 받고 반환하지 않는다(sql/55 P1-1 유지). 학생/학부모 판정 축과 owner_profile_id/owner_is_student 는 fn_usable_coupons 와 동일 규칙(WC030 포함). 반환 valid_until 도 동일하게 쿠폰 기한과 발급분 기한 중 이른 날이다(20260825000010). 단체 쿠폰 불일치는 reason=''org_mismatch''(20260831020402). 못 찾으면 0행.';



CREATE OR REPLACE FUNCTION "public"."fn_coupon_by_code"("p_code" "text", "p_subtotal" integer DEFAULT 0, "p_student_profile_id" "uuid" DEFAULT NULL::"uuid", "p_order_id" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "title" "text", "discount_amount" integer, "min_amount" integer, "valid_until" "date", "is_active" boolean, "eligible" boolean, "reason" "text", "owner_profile_id" "uuid", "owner_is_student" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_caller  uuid := auth.uid();
  v_student uuid;
  v_parent  uuid;
  v_today   date := (now() at time zone 'Asia/Seoul')::date;
  v_code    text := lower(trim(coalesce(p_code, '')));
  v_org_excluded boolean;
begin
  if p_student_profile_id is null then
    v_student := v_caller;
  else
    if v_caller is distinct from p_student_profile_id
       and not public.fn_is_linked_pair(v_caller, p_student_profile_id) then
      raise exception 'not_authorized_for_student' using errcode = 'WC030';
    end if;
    v_student := p_student_profile_id;
  end if;

  if v_code = '' then
    return;
  end if;

  select l.parent_id into v_parent
    from public.parent_child_links l
   where l.student_id = v_student and l.status = 'approved'
   limit 1;

  if v_student is null or v_parent is null then
    return;
  end if;

  v_org_excluded := p_order_id is not null and exists (
    select 1
      from public.order_items oi
      join public.products p on p.id = oi.product_id
     where oi.order_id = p_order_id
       and p.tenant_id is not null
  );

  return query
  select
    c.id,
    c.title,
    c.discount_amount,
    c.min_amount,
    eff.until_date as valid_until,
    c.is_active,
    (
      not v_org_excluded
      and c.is_active
      and (eff.until_date is null or eff.until_date >= v_today)
      and coalesce(p_subtotal, 0) >= c.min_amount
      and (c.max_uses_per_user is null or v_student is not null)
      and not chk.is_sold_out
      and (c.grant_type <> 'granted' or own.owner_id is not null)
      and org.matches
    ) as eligible,
    case
      when v_org_excluded then 'org_product_excluded'
      when not c.is_active then 'inactive'
      when eff.until_date is not null and eff.until_date < v_today then 'expired'
      when coalesce(p_subtotal, 0) < c.min_amount then 'below_min_amount'
      when not org.matches then 'org_mismatch'
      when c.max_uses_per_user is not null and v_student is null then 'login_required'
      when c.grant_type = 'granted' and not own.is_granted_overall then 'not_granted'
      when chk.is_sold_out then 'sold_out'
      when c.grant_type = 'granted' and own.owner_id is null then 'already_used'
      else null
    end as reason,
    own.owner_id as owner_profile_id,
    (own.owner_id is not null and own.owner_id = v_student) as owner_is_student
  from public.coupons c
  cross join lateral (
    select
      public.fn_coupon_is_granted(c.id, v_student) as is_granted_student,
      public.fn_coupon_is_granted(c.id, v_parent)  as is_granted_parent,
      public.fn_coupon_is_redeemed(c.id, v_student, now()) as is_redeemed_student,
      public.fn_coupon_is_redeemed(c.id, v_parent, now())  as is_redeemed_parent,
      public.fn_coupon_global_redeemed(c.id, now()) as is_sold_out,
      public.fn_coupon_grant_valid_until(c.id, v_student) as grant_until_student,
      public.fn_coupon_grant_valid_until(c.id, v_parent)  as grant_until_parent
  ) as chk
  cross join lateral (
    select
      (chk.is_granted_student or chk.is_granted_parent) as is_granted_overall,
      case
        when c.grant_type <> 'granted' then null
        when chk.is_granted_student and not chk.is_redeemed_student then v_student
        when chk.is_granted_parent and not chk.is_redeemed_parent then v_parent
        else null
      end as owner_id
  ) as own
  cross join lateral (
    select
      least(
        c.valid_until,
        greatest(chk.grant_until_student, chk.grant_until_parent)
      ) as until_date
  ) as eff
  cross join lateral (
    select public.fn_tenant_matches(c.tenant_id, v_student, v_parent) as matches
  ) as org
  where c.code is not null
    and lower(c.code) = v_code
  limit 1;
end;
$$;


ALTER FUNCTION "public"."fn_coupon_by_code"("p_code" "text", "p_subtotal" integer, "p_student_profile_id" "uuid", "p_order_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_coupon_by_code"("p_code" "text", "p_subtotal" integer, "p_student_profile_id" "uuid", "p_order_id" "text") IS '코드 직접 입력 조회 전용(sql/68 5-h절 쌍 축 재작성). code 를 입력으로만 받고 반환하지 않는다(sql/55 P1-1 유지). 학생/학부모 판정 축과 owner_profile_id/owner_is_student 는 fn_usable_coupons 와 동일 규칙(WC030 포함). 반환 valid_until 도 동일하게 쿠폰 기한과 발급분 기한 중 이른 날이다(20260825000010). 단체 쿠폰 불일치는 reason=''org_mismatch''(20260831020402). p_order_id(신규, 2026-09-01, 기본 NULL·하위호환)를 넘기면 fn_usable_coupons 와 동일하게 org 한정 상품 포함 주문을 reason=''org_product_excluded''로 배제한다. 못 찾으면 0행. 2026-09-22 org_code text 비교를 tenant_id 비교로 전환.';



CREATE OR REPLACE FUNCTION "public"."fn_coupon_global_redeemed"("p_coupon_id" "uuid", "p_at" timestamp with time zone DEFAULT "now"(), "p_exclude_order_id" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(
    (
      with c as (
        select max_redemptions
        from public.coupons
        where id = p_coupon_id
      ),
      used as (
        select count(*) as cnt
        from public.coupon_redemptions cr
        where cr.coupon_id = p_coupon_id
          and cr.voided_at is null
          and (p_exclude_order_id is null or cr.order_id <> p_exclude_order_id)
      )
      select
        c.max_redemptions is not null
        and used.cnt >= c.max_redemptions
      from c, used
    ),
    true
  );
$$;


ALTER FUNCTION "public"."fn_coupon_global_redeemed"("p_coupon_id" "uuid", "p_at" timestamp with time zone, "p_exclude_order_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_coupon_global_redeemed"("p_coupon_id" "uuid", "p_at" timestamp with time zone, "p_exclude_order_id" "text") IS '전체 발행량(max_redemptions) 소진 판정(sql/69 1-c절 재작성 — voided_at 단일 축). fn_coupon_is_redeemed 와 동일 근거로 orders 조인을 제거했다 — 드리프트 방지.';



CREATE OR REPLACE FUNCTION "public"."fn_coupon_grant_valid_months"() RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$ select 6 $$;


ALTER FUNCTION "public"."fn_coupon_grant_valid_months"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_coupon_grant_valid_months"() IS '발급형 쿠폰 발급분의 유효 개월 수(6). 가입 축하 알림톡 승인 문안의 "발급일로부터 6개월간 사용 가능" 이 근거다 — 문안을 바꾸려면 알리고 재심사가 필요하므로 이 값만 임의로 고치지 말 것. fn_coupon_pending_hold_minutes 와 같은 "정책 리터럴 단일 정본" 방식이다.';



CREATE OR REPLACE FUNCTION "public"."fn_coupon_grant_valid_until"("p_coupon_id" "uuid", "p_user_id" "uuid") RETURNS "date"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  -- 살아있는 발급은 (coupon_id, user_id)당 1건이다(coupon_grants_live_uidx).
  -- 기한이 지난 행도 그대로 돌려준다 — 호출부가 'expired' 사유를 그릴 수
  -- 있어야 하기 때문이다(만료를 '미보유'로 뭉뚱그리지 않는다).
  select g.valid_until
    from public.coupon_grants g
   where g.coupon_id = p_coupon_id
     and p_user_id is not null
     and g.user_id = p_user_id
     and g.revoked_at is null
   order by g.valid_until desc nulls first
   limit 1;
$$;


ALTER FUNCTION "public"."fn_coupon_grant_valid_until"("p_coupon_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_coupon_grant_valid_until"("p_coupon_id" "uuid", "p_user_id" "uuid") IS '표시 전용(20260825000010). 그 사용자의 살아있는 발급분 기한(coupon_grants.valid_until)을 돌려준다. NULL = 무기한이거나 발급분 없음. 만료된 발급분도 그대로 돌려준다 — fn_usable_coupons 가 사유를 expired 로 그리기 위해서다. 사용 가능 여부 판정에는 쓰지 말 것(정본은 fn_coupon_is_granted).';



CREATE OR REPLACE FUNCTION "public"."fn_coupon_is_granted"("p_coupon_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(
    (
      with c as (
        select grant_type
        from public.coupons
        where id = p_coupon_id
      )
      select
        c.grant_type <> 'granted'
        or exists (
          select 1
          from public.coupon_grants g
          where g.coupon_id = p_coupon_id
            and p_user_id is not null
            and g.user_id = p_user_id
            and g.revoked_at is null
            -- 발급분 기한(20260825000010). NULL 이면 무기한 — 이 컬럼이
            -- 생기기 전 발급분과 관리자 수기 발급이 여기 해당한다.
            and (g.valid_until is null
                 or g.valid_until >= (now() at time zone 'Asia/Seoul')::date)
        )
      from c
    ),
    false
  );
$$;


ALTER FUNCTION "public"."fn_coupon_is_granted"("p_coupon_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_coupon_is_granted"("p_coupon_id" "uuid", "p_user_id" "uuid") IS '발급 판정 정본. 조건형(grant_type=auto)은 항상 true. 발급형은 coupon_grants 에 회수되지 않고 **기한이 지나지 않은** 발급 행이 있어야 true(coupon_grants.valid_until, 20260825000010). 게스트(user_id NULL)는 발급형에서 항상 false. 없는 쿠폰은 false(fail-closed).';



CREATE OR REPLACE FUNCTION "public"."fn_coupon_is_redeemed"("p_coupon_id" "uuid", "p_user_id" "uuid", "p_at" timestamp with time zone DEFAULT "now"(), "p_exclude_order_id" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(
    (
      with c as (
        select max_uses_per_user
        from public.coupons
        where id = p_coupon_id
      ),
      used as (
        select count(*) as cnt
        from public.coupon_redemptions cr
        where cr.coupon_id = p_coupon_id
          and p_user_id is not null
          and cr.user_id = p_user_id
          and cr.voided_at is null
          and (p_exclude_order_id is null or cr.order_id <> p_exclude_order_id)
      )
      select
        p_user_id is not null
        and c.max_uses_per_user is not null
        and used.cnt >= c.max_uses_per_user
      from c, used
    ),
    true
  );
$$;


ALTER FUNCTION "public"."fn_coupon_is_redeemed"("p_coupon_id" "uuid", "p_user_id" "uuid", "p_at" timestamp with time zone, "p_exclude_order_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_coupon_is_redeemed"("p_coupon_id" "uuid", "p_user_id" "uuid", "p_at" timestamp with time zone, "p_exclude_order_id" "text") IS '소진 판정 내부 헬퍼(sql/69 1-c절 재작성 — 제외 축을 voided_at 하나로 통일). 이전엔 orders.status 를 조인해 상태로 제외를 추론했는데, DB 백스톱 인덱스(coupon_redemptions_single_use_uidx)는 voided_at 만 볼 수 있어 두 축이 갈렸다(dev E2E 23505 재현). 이제 voided_at is null 인 행만 "살아있는 사용"으로 센다 — 종결(canceled/failed) 전이는 1-e절 트리거가, 30분 소프트 홀드 만료는 1-f절 fn_respond_enrollment 의 lazy 정리가 voided_at 을 명시적으로 채워 이 정의를 유지한다. p_at 은 시그니처 호환용으로 남겼으나 본문에서 더 이상 쓰지 않는다.';



CREATE OR REPLACE FUNCTION "public"."fn_coupon_org_matches"("p_coupon_org_code" "text", "p_student" "uuid", "p_parent" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select
    p_coupon_org_code is null
    or exists (
      select 1
      from public.profiles p
      where p.id in (p_student, p_parent)
        and p.org_code is not null
        and upper(trim(p.org_code)) = p_coupon_org_code
    );
$$;


ALTER FUNCTION "public"."fn_coupon_org_matches"("p_coupon_org_code" "text", "p_student" "uuid", "p_parent" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_coupon_org_matches"("p_coupon_org_code" "text", "p_student" "uuid", "p_parent" "uuid") IS '단체 쿠폰 판정(2026-08-27). p_coupon_org_code 가 NULL 이면 항상 true(소속 제한 없음). 아니면 학생(p_student) 또는 학부모(p_parent) 중 하나라도 profiles.org_code 가 그 값과 같으면 true — 쌍 OR 규칙(granted 축과 동일한 원칙). coupons.org_code 는 저장 시점에 이미 upper(trim()) 이지만 이 함수는 profiles.org_code 쪽을 대칭으로 정규화해 비교한다.';



CREATE OR REPLACE FUNCTION "public"."fn_coupon_pending_hold_minutes"() RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select 30;
$$;


ALTER FUNCTION "public"."fn_coupon_pending_hold_minutes"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_coupon_pending_hold_minutes"() IS '결제창 이탈로 보는 pending 주문의 쿠폰 소프트 홀드 창(분). sql/55 원문 리터럴(interval ''30 minutes'', sql/55_coupon_policy.sql:1053/1107)을 이관한 단일 정본 — fn_respond_enrollment(1-f절) 의 lazy 정리가 이 값을 쓴다(sql/69).';



CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "region" "text" NOT NULL,
    "org_type" "text" NOT NULL,
    "tier" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tenants_code_format_check" CHECK (("code" ~ '^[A-HJ-KM-NP-Z2-9]{8}$'::"text")),
    CONSTRAINT "tenants_org_type_check" CHECK (("org_type" = ANY (ARRAY['기관'::"text", '사기업'::"text", '학교'::"text", '캠퍼스'::"text", '기타'::"text"]))),
    CONSTRAINT "tenants_region_check" CHECK (("region" = ANY (ARRAY['서울'::"text", '부산'::"text", '대구'::"text", '인천'::"text", '광주'::"text", '대전'::"text", '울산'::"text", '세종'::"text", '경기'::"text", '강원'::"text", '충북'::"text", '충남'::"text", '전북'::"text", '전남'::"text", '경북'::"text", '경남'::"text", '제주'::"text", '기타'::"text"]))),
    CONSTRAINT "tenants_tier_check" CHECK (("tier" = ANY (ARRAY['S'::"text", 'A'::"text", 'B'::"text", 'W'::"text"])))
);


ALTER TABLE "public"."tenants" OWNER TO "postgres";


COMMENT ON TABLE "public"."tenants" IS '단체 소속 마스터(2026-09-22, tenants 확장 1단계). profiles/products/coupons.org_code(자유 text)를 대체할 FK 대상 — text 컬럼은 후속 파일(tenant_id_columns_backfill)에서 tenant_id 로 백필되고, 이 파일 시점에는 아직 아무 테이블도 참조하지 않는다. insert 는 fn_create_tenant RPC 로만 한다(테이블 자체엔 insert 정책이 없다).';



COMMENT ON COLUMN "public"."tenants"."code" IS '회원이 가입·소속 인증 시 직접 입력하는 8자 코드(2026-09-22). 문자집합은 0/O/1/I/L 을 뺀 31자(A-HJ-KM-NP-Z2-9) — 전화·문자로 불러줄 때 헷갈리는 자모 제거. fn_generate_tenant_code 가 생성하고, 한 번 저장되면 트리거(fn_tenants_lock_code)로 불변이다(관리자 수정 화면에서도 변경 불가).';



COMMENT ON COLUMN "public"."tenants"."tier" IS '내부 분류용 등급(S/A/B/W, 2026-09-22). 정산·영업 우선순위 등 내부 판단 재료이며 회원에게 노출하지 않는다 — fn_resolve_tenant_code/fn_my_tenant 어느 쪽도 이 컬럼을 반환하지 않는다.';



COMMENT ON COLUMN "public"."tenants"."created_by" IS '테넌트를 발급한 최고 관리자(2026-09-22). 감사 추적용 — 프로필이 삭제돼도 테넌트 자체는 남아야 하므로 on delete set null(admin_members.invited_by 와 동일 관행, 20260822000010).';



CREATE OR REPLACE FUNCTION "public"."fn_create_tenant"("p_name" "text", "p_region" "text", "p_org_type" "text", "p_tier" "text") RETURNS "public"."tenants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_row  public.tenants;
  v_code text;
  v_i    integer;
begin
  if not public.fn_is_super_admin() then
    raise exception 'not_super_admin' using errcode = 'WC067';
  end if;

  for v_i in 1 .. 10 loop
    v_code := public.fn_generate_tenant_code();

    begin
      insert into public.tenants (code, name, region, org_type, tier, created_by)
      values (v_code, p_name, p_region, p_org_type, p_tier, auth.uid())
      returning * into v_row;

      return v_row;
    exception when unique_violation then
      -- 코드 충돌(31^8 공간에서 극히 희박하지만 발생 시 새 코드로 재시도).
      continue;
    end;
  end loop;

  raise exception 'tenant_code_generation_failed';
end;
$$;


ALTER FUNCTION "public"."fn_create_tenant"("p_name" "text", "p_region" "text", "p_org_type" "text", "p_tier" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_create_tenant"("p_name" "text", "p_region" "text", "p_org_type" "text", "p_tier" "text") IS '20260922 — 최고 관리자 전용 테넌트 발급(WC067). 코드는 fn_generate_tenant_code 로 생성하고 unique_violation 시 최대 10회 재시도한다(31^8 공간이라 충돌은 사실상 없지만 방어적으로). tier 등 내부 분류는 이 함수를 호출한 관리자만 지정하며 회원에게는 어떤 경로로도 노출되지 않는다.';



CREATE OR REPLACE FUNCTION "public"."fn_delete_account"("p_user_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_has_retained_records boolean;
begin
  if p_user_id is null then
    raise exception 'user_id_required' using errcode = '22004';
  end if;

  select exists (
    select 1 from public.orders
     where user_id = p_user_id
        or parent_profile_id = p_user_id
        or student_profile_id = p_user_id
    union all
    select 1 from public.refund_requests
     where user_id = p_user_id
        or parent_profile_id = p_user_id
        or student_profile_id = p_user_id
        or requested_by = p_user_id
    union all
    select 1 from public.coupon_redemptions where user_id = p_user_id
  ) into v_has_retained_records;

  -- AI 호출 계기판. 운영 통계는 보존하고 개인 식별만 끊는다.
  update public.ai_model_calls set profile_id = null where profile_id = p_user_id;
  update public.ai_retrieval_events set profile_id = null where profile_id = p_user_id;

  -- 자기평가서(FK 역순). selfeval_sessions.ledger_id 가 원장을 참조하고 selfeval_session_activities 가
  -- activity_records 를 restrict 로 참조하므로 둘보다 앞에서 지운다. 20261006111050 의 블록을
  -- 이 파일이 함수 본문을 다시 쓰면서 그대로 가져온다.
  delete from public.selfeval_reports where profile_id = p_user_id;
  delete from public.selfeval_session_activities where profile_id = p_user_id;
  delete from public.selfeval_sessions where profile_id = p_user_id;

  -- 심화탐구(FK 역순). inquiry_sessions.ledger_id 가 원장을 참조하므로 원장 삭제보다 먼저.
  -- inquiry_assets 가 activity_records 를 참조하므로 활동 기록 삭제보다도 앞이다.
  delete from public.inquiry_reports where profile_id = p_user_id;
  delete from public.inquiry_submissions where profile_id = p_user_id;
  delete from public.inquiry_topics where profile_id = p_user_id;
  delete from public.inquiry_assets where profile_id = p_user_id;
  delete from public.inquiry_sessions where profile_id = p_user_id;

  -- 성장설계(FK 역순). growth_reports.ledger_id 가 원장을 참조하므로 원장 삭제보다 먼저.
  delete from public.growth_plan_items where profile_id = p_user_id;
  delete from public.growth_uploads where profile_id = p_user_id;
  delete from public.growth_reports where profile_id = p_user_id;
  delete from public.growth_profiles where profile_id = p_user_id;
  delete from public.activity_records where profile_id = p_user_id;
  delete from public.student_profiles where profile_id = p_user_id;
  delete from public.goal_students where profile_id = p_user_id;
  delete from public.performance_sessions where profile_id = p_user_id;
  delete from public.diagnosis_attempts where profile_id = p_user_id;
  delete from public.performance_credit_ledger where profile_id = p_user_id;
  delete from public.performance_session_vectors where profile_id = p_user_id;
  delete from public.program_access_grants where profile_id = p_user_id;
  delete from public.program_access where id = p_user_id;
  delete from public.payments where id = p_user_id;
  delete from public.identity_verifications where user_id = p_user_id;
  delete from public.mentor_applications where user_id = p_user_id;
  delete from public.phone_verifications where user_id = p_user_id;
  delete from public.student_link_codes where student_id = p_user_id;
  delete from public.parent_child_links where parent_id = p_user_id or student_id = p_user_id;
  delete from public.coupon_grants where user_id = p_user_id;
  delete from public.link_code_lookups where actor_id = p_user_id;
  delete from public.user_term_agreements where user_id = p_user_id;
  update public.enrollments set profile_id = null where profile_id = p_user_id;

  if v_has_retained_records then
    update public.profiles
       set name = null,
           phone = null,
           email = null,
           username = null,
           school_type = null,
           school_name = null,
           birth_date = null,
           gender = null,
           landline = null,
           address = null,
           address_detail = null,
           guardian_phone = null,
           memo = null,
           region = null,
           payment_terminal_id = null,
           marketing_agreed = false,
           ads_agreed = false,
           sms_agreed = false,
           guardian_consent = false,
           is_active = false,
           updated_at = now()
     where id = p_user_id;
    return 'anonymized';
  end if;

  delete from public.profiles where id = p_user_id;
  return 'deleted';
end;
$$;


ALTER FUNCTION "public"."fn_delete_account"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_delete_account"("p_user_id" "uuid") IS '회원탈퇴 하드 삭제(QA #2), api/delete-account.ts(service_role) 전용, authenticated/anon 실행 금지. orders/refund_requests/coupon_redemptions 참조가 있으면(전자상거래법 5년 보존 + FK RESTRICT/NOT NULL) 사용자 소유 데이터(성장설계, 심화탐구 포함)만 정리하고 profiles 는 개인식별 필드만 익명화한 뒤 anonymized 를 반환, 참조가 전혀 없으면 profiles 까지 지우고 deleted 를 반환한다. 호출부는 deleted 일 때만 auth.admin.deleteUser 를 이어서 호출하고, anonymized 일 때는 updateUserById(ban) 로 로그인만 막는다.';



CREATE OR REPLACE FUNCTION "public"."fn_finalize_paid_order"("p_order_id" "text", "p_status" "text", "p_payment_key" "text", "p_method" "text", "p_paid_at" timestamp with time zone, "p_raw" "jsonb", "p_confirm_amount" numeric DEFAULT NULL::numeric, "p_require_pending_or_failed" boolean DEFAULT true, "p_restore_revoked" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_order  public.orders;
  v_access jsonb;
begin
  if p_status not in ('paid', 'waiting_deposit') then
    raise exception 'invalid_status' using errcode = 'WC050';
  end if;

  update public.orders
     set status       = p_status,
         payment_key  = coalesce(p_payment_key, payment_key),
         method       = p_method,
         paid_at      = p_paid_at,
         raw          = p_raw
   where id = p_order_id
     and (p_confirm_amount is null or amount = p_confirm_amount)
     and (not p_require_pending_or_failed or status in ('pending', 'failed'))
  returning * into v_order;

  if not found then
    -- 호출부가 기존과 동일하게 처리한다(승인 성공·기록 실패 → 500 + 로그).
    return jsonb_build_object('ok', false, 'error', 'order_update_failed');
  end if;

  -- 가상계좌는 아직 입금 전이므로 부여하지 않는다(기존 규칙 그대로).
  if p_status = 'waiting_deposit' then
    return jsonb_build_object(
      'ok', true,
      'access', jsonb_build_object(
        'ok', false, 'error', 'waiting_deposit',
        'granted', '[]'::jsonb, 'service_keys', '[]'::jsonb,
        'skipped', '[]'::jsonb, 'ledger_inserted', 0
      )
    );
  end if;

  -- 부여 대상은 학생이다 — fn_grant_program_access_for_order 내부가
  -- v_order.parent_profile_id 로 p_user_id(=orders.user_id, 결제자) 를 검증하고
  -- program_access_grants 는 v_order.student_profile_id 에 쓴다(sql/69).
  begin
    v_access := public.fn_grant_program_access_for_order(
      p_order_id, v_order.user_id, p_paid_at, p_restore_revoked
    );
  exception when others then
    -- 여기서 SAVEPOINT 롤백되는 건 grant 호출 내부의 변경분뿐이다 — 위 orders
    -- UPDATE 는 이 블록 밖에서 이미 실행돼 트랜잭션에 그대로 남는다.
    v_access := jsonb_build_object(
      'ok', false, 'error', sqlerrm,
      'granted', '[]'::jsonb, 'service_keys', '[]'::jsonb,
      'skipped', '[]'::jsonb, 'ledger_inserted', 0
    );
  end;

  return jsonb_build_object('ok', true, 'access', v_access);
end;
$$;


ALTER FUNCTION "public"."fn_finalize_paid_order"("p_order_id" "text", "p_status" "text", "p_payment_key" "text", "p_method" "text", "p_paid_at" timestamp with time zone, "p_raw" "jsonb", "p_confirm_amount" numeric, "p_require_pending_or_failed" boolean, "p_restore_revoked" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_generate_tenant_code"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  c_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 31자, 0/O/1/I/L 제외
  c_len      constant int  := length(c_alphabet);                -- 31
  c_limit    constant int  := (256 / c_len) * c_len;              -- 248
  v_code text := '';
  v_byte int;
begin
  while length(v_code) < 8 loop
    v_byte := get_byte(extensions.gen_random_bytes(1), 0);
    if v_byte < c_limit then
      v_code := v_code || substr(c_alphabet, (v_byte % c_len) + 1, 1);
    end if;
  end loop;

  return v_code;
end;
$$;


ALTER FUNCTION "public"."fn_generate_tenant_code"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_generate_tenant_code"() IS '20260922 — 8자 소속 코드 생성(generate_link_code_string, baseline:3581 과 동일 rejection-sampling 원칙, extensions.gen_random_bytes 기반 — pgcrypto 는 baseline:43 에서 이미 설치됨). 문자집합은 tenants_code_format_check 정규식과 1:1로 맞춘 31자(0/O/1/I/L 제외). 발급 경로(fn_create_tenant·백필)에서만 부르므로 클라이언트 role 에는 실행 권한을 주지 않는다.';



CREATE OR REPLACE FUNCTION "public"."fn_goal_reset_student"("p_profile_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_profile_id uuid;
begin
  -- 행 잠금 + 존재 확인. 동시에 daily-record 제출이 진행 중이면 그 트랜잭션이
  -- 끝날 때까지 여기서 대기한다(TOCTOU 방어, 위 "동시성" 절 참고).
  select profile_id into v_profile_id
    from public.goal_students
   where profile_id = p_profile_id
   for update;

  if v_profile_id is null then
    raise exception 'goal_student_not_found';
  end if;

  -- 확률 증분만 0으로 되돌린다. 행 자체와 학습 기록 컬럼(study_hours 등)은
  -- 절대 지우지 않는다 — 리포트·랭킹이 이 컬럼들을 실시간 조회한다.
  update public.goal_daily_records
     set delta_ideal_susi   = 0,
         delta_ideal_jungsi = 0,
         delta_min_susi     = 0,
         delta_min_jungsi   = 0,
         updated_at         = now()
   where profile_id = p_profile_id;

  -- 확률 스냅샷 감사 로그는 append-only라 재온보딩 시 이전 이력과 섞이지
  -- 않도록 전량 삭제한다.
  delete from public.goal_probability_logs
   where profile_id = p_profile_id;

  -- 온보딩 이전 상태로 되돌린다. DELETE가 아니라 UPDATE라 다른 goal_* 테이블의
  -- on delete cascade가 발동하지 않는다(위 "무엇을 지우고 무엇을 보존하는가" 참고).
  update public.goal_students
     set status       = 'awaiting_cuts',
         onboarded_at = null,
         updated_at   = now()
   where profile_id = p_profile_id;
end;
$$;


ALTER FUNCTION "public"."fn_goal_reset_student"("p_profile_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_goal_reset_student"("p_profile_id" "uuid") IS '어드민 전용 소프트 리셋. 학생을 온보딩 이전 상태로 되돌린다(goal_students.status/onboarded_at) — 재접속 시 RequireGoalAccess.jsx가 자동으로 온보딩 폼으로 보낸다. goal_daily_records는 행을 지우지 않고 delta_* 4컬럼만 0으로 되돌린다(학습 이력 보존). goal_probability_logs는 전량 삭제. goal_timer_sessions/goal_schedules/goal_plan_tasks/goal_workbooks/goal_subject_targets/goal_mentor_comments는 절대 건드리지 않는다(cascade 미발동 — UPDATE only). service_role 전용, api/goal/admin/reset-student.js 에서만 호출. sql/81_goal_student_reset.sql 참고.';



CREATE TABLE IF NOT EXISTS "public"."coupon_grants" (
    "id" bigint NOT NULL,
    "coupon_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "granted_by" "text" NOT NULL,
    "revoked_at" timestamp with time zone,
    "revoke_reason" "text",
    "valid_until" "date",
    CONSTRAINT "coupon_grants_granted_by_check" CHECK (("granted_by" = ANY (ARRAY['signup'::"text", 'admin'::"text", 'event'::"text"])))
);


ALTER TABLE "public"."coupon_grants" OWNER TO "postgres";


COMMENT ON TABLE "public"."coupon_grants" IS '발급형 쿠폰(coupons.grant_type=granted)의 사용 권리 원장. 절대 DELETE 하지 않는다 — 회수는 revoked_at UPDATE 로만 한다(fn_revoke_coupon_grant). 살아있는 발급은 (coupon_id, user_id)당 1건(부분 유니크 인덱스).';



COMMENT ON COLUMN "public"."coupon_grants"."granted_by" IS '발급 출처. signup = 가입 트리거, admin = 어드민 화면, event = 예약(생산자 미정).';



COMMENT ON COLUMN "public"."coupon_grants"."revoked_at" IS '관리자가 이 발급을 회수한 시각. NULL = 유효. 판정(fn_coupon_is_granted)은 NULL 인 행만 본다.';



COMMENT ON COLUMN "public"."coupon_grants"."revoke_reason" IS '회수 사유(자유 텍스트, 관리자 기입). revoked_at 이 NULL 이면 의미 없음.';



COMMENT ON COLUMN "public"."coupon_grants"."valid_until" IS '이 발급분의 사용 기한(포함, Asia/Seoul 날짜). NULL = 무기한. 쿠폰 전체 기한인 coupons.valid_until 과 별개 축이며, 실제 사용 가능 여부는 둘 중 이른 날짜가 정한다. fn_coupon_is_granted 가 이 값을 본다(20260825000010).';



CREATE OR REPLACE FUNCTION "public"."fn_grant_coupon"("p_coupon_id" "uuid", "p_user_id" "uuid") RETURNS "public"."coupon_grants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_grant_type text;
  v_row        public.coupon_grants;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select c.grant_type into v_grant_type
    from public.coupons c
   where c.id = p_coupon_id;

  if coalesce(v_grant_type, '') <> 'granted' then
    raise exception 'coupon_not_grantable' using errcode = 'WC004';
  end if;

  -- 사용 완료(redeemed) 가드 — 20260823000001 원문 그대로.
  if public.fn_coupon_is_redeemed(p_coupon_id, p_user_id) then
    raise exception 'coupon_already_redeemed' using errcode = 'WC005';
  end if;

  insert into public.coupon_grants (coupon_id, user_id, granted_by, valid_until)
  values (
    p_coupon_id,
    p_user_id,
    'admin',
    ((now() at time zone 'Asia/Seoul')::date
       + (public.fn_coupon_grant_valid_months() || ' months')::interval)::date
  )
  on conflict (coupon_id, user_id) where revoked_at is null do nothing
  returning * into v_row;

  if v_row.id is null then
    select g.* into v_row
      from public.coupon_grants g
     where g.coupon_id = p_coupon_id
       and g.user_id = p_user_id
       and g.revoked_at is null;
  end if;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."fn_grant_coupon"("p_coupon_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_grant_coupon"("p_coupon_id" "uuid", "p_user_id" "uuid") IS '관리자 전용. 발급형 쿠폰을 한 사용자에게 발급한다(멱등 — 이미 살아있는 발급이 있으면 그 행을 그대로 반환). 발급분 기한은 오늘(KST) + fn_coupon_grant_valid_months() 개월(20260825000010). 이 사용자가 해당 쿠폰 정책을 이미 max_uses_per_user 만큼 사용 완료했으면 errcode=WC005(재발급 차단, 2026-08-20). 조건형이거나 없는 쿠폰이면 errcode=WC004. 관리자가 아니면 42501.';



CREATE OR REPLACE FUNCTION "public"."fn_grant_program_access_for_order"("p_order_id" "text", "p_user_id" "uuid", "p_paid_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_restore_revoked" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_order        public.orders;
  v_existing     public.program_access;
  v_item         record;
  v_bundle       record;
  v_paid_at      timestamptz;
  v_anchor       timestamptz;
  v_start        timestamptz;
  v_expires      timestamptz;
  v_key          text;
  v_item_count   int    := 0;
  v_inserted     int    := 0;
  v_is_bundle    boolean;
  v_total_list   numeric;
  v_alloc        integer;
  v_skipped      jsonb  := '[]'::jsonb;
  v_service_keys text[] := '{}';
  v_blocked      text[] := '{}';
  v_keys         text[] := '{}';
  v_sync         jsonb  := '[]'::jsonb;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'WC010';
  end if;

  -- 결제자(학부모) 확인. p_user_id 는 호출부가 orders.user_id(=parent_
  -- profile_id, orders_user_id_is_parent_check)를 그대로 넘긴다.
  if v_order.parent_profile_id is distinct from p_user_id then
    raise exception 'order_user_mismatch' using errcode = 'WC011';
  end if;

  -- 2-a) R2c 상태 가드. 미승인·미결제 주문에는 권한을 줄 수 없다.
  if v_order.status <> 'paid' then
    raise exception 'order_not_paid'
      using errcode = 'WC033',
            detail  = format('order_id=%s status=%s', p_order_id, v_order.status);
  end if;

  -- 도달 불가에 가까운 방어적 가드(orders_approval_before_payment_check 가
  -- 이미 묶어 둔다) — baseline 원문 유지.
  if v_order.approval_status <> 'approved' then
    raise exception 'order_not_approved'
      using errcode = 'WC034',
            detail  = format('order_id=%s approval_status=%s', p_order_id, v_order.approval_status);
  end if;

  if v_order.student_profile_id is null then
    return jsonb_build_object(
      'ok', true, 'granted', '[]'::jsonb, 'service_keys', '[]'::jsonb,
      'skipped', jsonb_build_array(jsonb_build_object('reason', 'order_has_no_user')),
      'ledger_inserted', 0, 'synced', '[]'::jsonb);
  end if;

  -- 부여 대상(학생) 단위로 부여·회수를 직렬화한다(sql/64 salt=101).
  perform pg_advisory_xact_lock(hashtextextended(v_order.student_profile_id::text, 101));

  v_paid_at := coalesce(p_paid_at, v_order.paid_at, now());
  v_anchor  := public.fn_kst_day_start(v_paid_at);

  select count(*) into v_item_count from public.order_items where order_id = p_order_id;
  if v_item_count = 0 then
    return jsonb_build_object(
      'ok', false, 'error', 'no_order_items', 'granted', '[]'::jsonb,
      'service_keys', '[]'::jsonb, 'skipped', '[]'::jsonb,
      'ledger_inserted', 0, 'synced', '[]'::jsonb);
  end if;

  for v_item in
    select oi.id as order_item_id, oi.quantity, oi.price,
           oi.product_slug, oi.service_key,
           p.id as product_id, p.program_key, p.duration_months, p.session_quota,
           p.validity_days, p.addon_only
      from public.order_items oi
      left join public.products p
             on p.id = oi.product_id
             or (oi.product_id is null and p.slug = oi.product_slug)
     where oi.order_id = p_order_id
     order by oi.id asc
  loop
    if v_item.service_key is not null
       and not (v_item.service_key = any(v_service_keys)) then
      v_service_keys := v_service_keys || v_item.service_key;
    end if;

    select exists(
      select 1 from public.bundle_items bi where bi.product_id = v_item.product_id
    ) into v_is_bundle;

    if not v_is_bundle and v_item.program_key is null then
      v_skipped := v_skipped || jsonb_build_object(
        'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
        'service_key', v_item.service_key, 'program_key', null,
        'reason', 'no_program_key_mapping');
      continue;
    end if;

    -- 수량 > 1 은 회차권(session_quota 있고 duration_months 없는 단일 상품)만 허용한다.
    if v_item.quantity <> 1
       and (v_is_bundle or v_item.session_quota is null or v_item.duration_months is not null) then
      v_skipped := v_skipped || jsonb_build_object(
        'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
        'service_key', v_item.service_key, 'program_key', v_item.program_key,
        'reason', 'unsupported_quantity');
      continue;
    end if;

    if not v_is_bundle
       and v_item.duration_months is null and v_item.session_quota is null then
      raise exception 'product_entitlement_spec_missing'
        using errcode = 'WC012',
              detail  = format('order_item_id=%s product_slug=%s program_key=%s',
                               v_item.order_item_id, v_item.product_slug, v_item.program_key);
    end if;

    if v_is_bundle then
      -- 번들 분기 — bundle_items 행별로 부여한다. paid_amount 는 list_price
      -- 비율 안분(반올림), 마지막 행(program_key 오름차순)이 잔차를 흡수해
      -- 합계가 라인 결제액(price*quantity)과 정확히 일치하게 한다.
      select coalesce(sum(bi.list_price), 0) into v_total_list
        from public.bundle_items bi
       where bi.product_id = v_item.product_id;

      for v_bundle in
        select bi.program_key, bi.duration_months, bi.session_quota, bi.validity_days,
               row_number() over (order by bi.program_key) as rn,
               count(*) over () as cnt,
               coalesce(
                 sum(round(bi.list_price::numeric * (v_item.price * v_item.quantity) / nullif(v_total_list, 0)))
                   over (order by bi.program_key rows between unbounded preceding and 1 preceding),
                 0
               )::int as prior_alloc,
               round(bi.list_price::numeric * (v_item.price * v_item.quantity) / nullif(v_total_list, 0))::int as row_alloc
          from public.bundle_items bi
         where bi.product_id = v_item.product_id
         order by bi.program_key
      loop
        v_alloc := case when v_bundle.rn = v_bundle.cnt
                        then (v_item.price * v_item.quantity) - v_bundle.prior_alloc
                        else v_bundle.row_alloc
                   end;

        select * into v_existing
          from public.program_access
         where id = v_order.student_profile_id and program_key = v_bundle.program_key
           for update;

        if found and v_existing.access_status = 'suspended' then
          v_skipped := v_skipped || jsonb_build_object(
            'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
            'service_key', v_item.service_key, 'program_key', v_bundle.program_key,
            'reason', 'suspended_by_admin');
          if not (v_bundle.program_key = any(v_blocked)) then
            v_blocked := v_blocked || v_bundle.program_key;
          end if;
          continue;
        end if;

        if not p_restore_revoked
           and exists (
             select 1 from public.program_access_grants g
              where g.order_item_id = v_item.order_item_id
                and g.program_key = v_bundle.program_key
                and g.revoked_at is not null
           ) then
          v_skipped := v_skipped || jsonb_build_object(
            'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
            'service_key', v_item.service_key, 'program_key', v_bundle.program_key,
            'reason', 'revoked_not_restored');
          if not (v_bundle.program_key = any(v_blocked)) then
            v_blocked := v_blocked || v_bundle.program_key;
          end if;
          continue;
        end if;

        if exists (
          select 1 from public.program_access_grants g
           where g.order_item_id = v_item.order_item_id
             and g.program_key = v_bundle.program_key
             and g.revoked_at is null
        ) then
          v_skipped := v_skipped || jsonb_build_object(
            'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
            'service_key', v_item.service_key, 'program_key', v_bundle.program_key,
            'reason', 'already_granted');
          continue;
        end if;

        select greatest(v_anchor, max(g.expires_at)) into v_start
          from public.program_access_grants g
         where g.profile_id  = v_order.student_profile_id
           and g.program_key = v_bundle.program_key
           and g.revoked_at is null;
        v_start := coalesce(v_start, v_anchor);

        v_expires := coalesce(
          public.fn_add_months_kst(v_start, v_bundle.duration_months),
          case when v_bundle.validity_days is not null
               then v_start + make_interval(days => v_bundle.validity_days)
          end);

        insert into public.program_access_grants (
          profile_id, program_key, order_id, order_item_id,
          product_id, product_slug, granted_by,
          granted_months, granted_sessions, paid_amount, starts_at, expires_at,
          validity_days
        ) values (
          v_order.student_profile_id, v_bundle.program_key, p_order_id, v_item.order_item_id,
          v_item.product_id, v_item.product_slug, 'payment',
          v_bundle.duration_months, v_bundle.session_quota,
          v_alloc,
          v_start, v_expires,
          v_bundle.validity_days
        );
        v_inserted := v_inserted + 1;
      end loop;

      continue;
    end if;

    -- 스칼라 경로(기존 단일 권한 상품) — 가드 키만 (order_item_id,
    -- program_key) 로 좁혔을 뿐 v_item.program_key 는 이 라인의 유일한
    -- 권한이라 결과는 원문과 동일하다.
    select * into v_existing
      from public.program_access
     where id = v_order.student_profile_id and program_key = v_item.program_key
       for update;

    if found and v_existing.access_status = 'suspended' then
      v_skipped := v_skipped || jsonb_build_object(
        'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
        'service_key', v_item.service_key, 'program_key', v_item.program_key,
        'reason', 'suspended_by_admin');
      if not (v_item.program_key = any(v_blocked)) then
        v_blocked := v_blocked || v_item.program_key;
      end if;
      continue;
    end if;

    -- 2-b) R7 — restore_revoked 판정을 원장(program_access_grants)으로.
    if not p_restore_revoked
       and exists (
         select 1 from public.program_access_grants g
          where g.order_item_id = v_item.order_item_id
            and g.program_key = v_item.program_key
            and g.revoked_at is not null
       ) then
      v_skipped := v_skipped || jsonb_build_object(
        'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
        'service_key', v_item.service_key, 'program_key', v_item.program_key,
        'reason', 'revoked_not_restored');
      if not (v_item.program_key = any(v_blocked)) then
        v_blocked := v_blocked || v_item.program_key;
      end if;
      continue;
    end if;

    if exists (
      select 1 from public.program_access_grants g
       where g.order_item_id = v_item.order_item_id
         and g.program_key = v_item.program_key
         and g.revoked_at is null
    ) then
      v_skipped := v_skipped || jsonb_build_object(
        'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
        'service_key', v_item.service_key, 'program_key', v_item.program_key,
        'reason', 'already_granted');
      continue;
    end if;

    select greatest(v_anchor, max(g.expires_at)) into v_start
      from public.program_access_grants g
     where g.profile_id  = v_order.student_profile_id
       and g.program_key = v_item.program_key
       and g.revoked_at is null;
    v_start   := coalesce(v_start, v_anchor);

    -- 추가 이용권은 기존 부여 만료 뒤로 미루지 않고 결제일에 시작한다.
    if v_item.addon_only then
      v_start := v_anchor;
    end if;

    -- 만료 파생(20260901 Ver10, §2-7) — 기간(개월)이 있으면 KST 달력 개월
    -- 덧셈, 없고 유효기간(일)이 있으면 시작 + 일수, 둘 다 없으면 무기한.
    -- fn_add_months_kst 는 p_months NULL 이면 NULL 을 돌려주는 규약이라
    -- coalesce 로 두 축이 자연스럽게 이어진다.
    v_expires := coalesce(
      public.fn_add_months_kst(v_start, v_item.duration_months),
      case when v_item.validity_days is not null
           then v_start + make_interval(days => v_item.validity_days)
      end);

    insert into public.program_access_grants (
      profile_id, program_key, order_id, order_item_id,
      product_id, product_slug, granted_by,
      granted_months, granted_sessions, paid_amount, starts_at, expires_at,
      validity_days
    ) values (
      v_order.student_profile_id, v_item.program_key, p_order_id, v_item.order_item_id,
      v_item.product_id, v_item.product_slug, 'payment',
      v_item.duration_months, v_item.session_quota * coalesce(v_item.quantity, 1),
      coalesce(v_item.price, 0) * coalesce(v_item.quantity, 1),
      v_start, v_expires,
      v_item.validity_days
    );
    v_inserted := v_inserted + 1;
  end loop;

  select coalesce(array_agg(distinct g.program_key), '{}')
    into v_keys
    from public.program_access_grants g
   where g.order_id = p_order_id
     and g.revoked_at is null
     and not (g.program_key = any(v_blocked));

  foreach v_key in array v_keys loop
    v_sync := v_sync || public.fn_sync_program_access_cache(v_order.student_profile_id, v_key, null);
  end loop;

  return jsonb_build_object(
    'ok',              true,
    'granted',         to_jsonb(v_keys),
    'service_keys',    to_jsonb(v_service_keys),
    'skipped',         v_skipped,
    'ledger_inserted', v_inserted,
    'synced',          v_sync
  );
end;
$$;


ALTER FUNCTION "public"."fn_grant_program_access_for_order"("p_order_id" "text", "p_user_id" "uuid", "p_paid_at" timestamp with time zone, "p_restore_revoked" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_grant_program_access_for_order"("p_order_id" "text", "p_user_id" "uuid", "p_paid_at" timestamp with time zone, "p_restore_revoked" boolean) IS '주문 하나에 대해 이용 권한을 부여한다(sql/69 재작성 + 20260901001438 유효기간 + 20260901 부산캠퍼스 번들). product_id 가 bundle_items 에 행을 가진 라인은 그 행별로 program_access_grants 를 부여한다(program_key/duration_months/session_quota/validity_days 는 bundle_items 값, paid_amount 는 list_price 비율 안분 + program_key 오름차순 마지막 행 잔차 흡수), 없으면 기존 스칼라 경로(products.program_key/duration_months/session_quota) 그대로. 멱등 가드(already_granted), 복구 가드(revoked_not_restored)는 (order_item_id, program_key) 단위로 판정해 번들 2, 3번째 권한이 첫 권한 존재만으로 skip 되지 않게 한다(단일 상품 경로는 program_key 가 하나뿐이라 의미 동일, 동작 불변). 기간(duration_months)이 없는 상품은 validity_days(1회권 30일 등)를 expires_at = starts_at + N일 로 환산한다. 그 외(R2c 상태 가드, R7 원장 기반 restore_revoked, 라인별 skipped, WC010~012, 체이닝, suspended 판정)는 이전 정본과 동일. 추가: 회차권(session_quota 있고 duration_months 없는 단일 상품)은 quantity > 1 을 허용해 granted_sessions = session_quota × quantity 로 부여하고, 그 밖의 quantity > 1 은 unsupported_quantity 로 건너뛴다. addon_only 상품은 기존 부여 만료 뒤로 미루지 않고 결제일(KST 자정)에 시작한다.';



CREATE OR REPLACE FUNCTION "public"."fn_grant_signup_coupons"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  begin
    perform public.fn_grant_signup_coupons_for_user(new.id);
  exception
    when others then
      -- 쿠폰 발급 실패가 회원가입을 실패시켜서는 안 된다(baseline 원문 절).
      raise warning 'fn_grant_signup_coupons failed for user %: % (%)',
        new.id, sqlerrm, sqlstate;
  end;

  return new;
end;
$$;


ALTER FUNCTION "public"."fn_grant_signup_coupons"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_grant_signup_coupons"() IS 'auth.users AFTER INSERT 트리거(dev·로컬 전용 — prod 에는 이 트리거를 만들지 않는다, supabase/README). 본문은 fn_grant_signup_coupons_for_user 로 옮겼고 여기서는 그것을 감싸 예외를 삼킨다 — 어떤 실패도 가입을 막지 않는다(warning 만 남는다).';



CREATE OR REPLACE FUNCTION "public"."fn_grant_signup_coupons_for_user"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_today   date := (now() at time zone 'Asia/Seoul')::date;
  v_granted integer := 0;
begin
  if p_user_id is null then
    return 0;
  end if;

  insert into public.coupon_grants (coupon_id, user_id, granted_by, valid_until)
  select
    c.id,
    p_user_id,
    'signup',
    (v_today + (public.fn_coupon_grant_valid_months() || ' months')::interval)::date
    from public.coupons c
   where c.grant_type = 'granted'
     and c.grant_on_signup = true
     and c.is_active = true
     and (c.valid_until is null or c.valid_until >= v_today)
  on conflict (coupon_id, user_id) where revoked_at is null do nothing;

  get diagnostics v_granted = row_count;

  return v_granted;
end;
$$;


ALTER FUNCTION "public"."fn_grant_signup_coupons_for_user"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_grant_signup_coupons_for_user"("p_user_id" "uuid") IS '가입 쿠폰 발급 본문(20260825000010). coupons.grant_on_signup 인 발급형 쿠폰을 한 사용자에게 발급하고 발급 건수를 돌려준다. 멱등 — 살아있는 발급이 이미 있으면 0건. 발급분 기한은 오늘(KST) + fn_coupon_grant_valid_months() 개월. 호출자는 둘이다: dev·로컬의 auth.users 트리거(fn_grant_signup_coupons)와 prod 를 포함한 서버(api/signup-welcome.ts, service_role) — prod 에는 트리거가 없어서 서버 호출이 유일한 발급 경로다.';



CREATE OR REPLACE FUNCTION "public"."fn_growth_claim_step"("p_report_id" "uuid", "p_profile_id" "uuid", "p_step" smallint, "p_stale_seconds" integer DEFAULT 120) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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

  -- 응답 유실 뒤 8단계 재요청 멱등: 완료된 회차에서 요청 단계가 이미 ok 면 done 이다.
  if v_report.status = 'completed'
     and v_report.step_state -> 'steps' -> (p_step::text) ->> 'status' = 'ok' then
    return jsonb_build_object('kind', 'done');
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


ALTER FUNCTION "public"."fn_growth_claim_step"("p_report_id" "uuid", "p_profile_id" "uuid", "p_step" smallint, "p_stale_seconds" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_growth_claim_step"("p_report_id" "uuid", "p_profile_id" "uuid", "p_step" smallint, "p_stale_seconds" integer) IS '성장설계 단계 선점(P4). 프로필 advisory 잠금(101) 뒤 회차 행을 for update 로 읽어 단계를 running 으로 표시한다. 반환 kind 어휘: claimed(attempts)/done/locked/order(currentStep)/running/exhausted(attempts). 시도 상한은 단계당 10(No.89). startedAt 이 p_stale_seconds 보다 오래된 running 은 서버리스 중단으로 보고 다시 선점한다. draft 회차는 in_progress 로 올린다. p_step 이 1~8 밖이면 예외.';



CREATE OR REPLACE FUNCTION "public"."fn_growth_commit_collect"("p_report_id" "uuid", "p_profile_id" "uuid", "p_track" "text", "p_grade_inputs" "jsonb", "p_activity_ids" "uuid"[]) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_count integer;
begin
  update public.growth_reports
  set track = p_track,
      grade_inputs = p_grade_inputs,
      activity_ids = p_activity_ids,
      status = 'in_progress',
      last_activity_at = now(),
      updated_at = now()
  where id = p_report_id
    and profile_id = p_profile_id
    and status in ('draft', 'in_progress')
    and current_step = 0;

  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;


ALTER FUNCTION "public"."fn_growth_commit_collect"("p_report_id" "uuid", "p_profile_id" "uuid", "p_track" "text", "p_grade_inputs" "jsonb", "p_activity_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_growth_complete_report"("p_report_id" "uuid", "p_profile_id" "uuid", "p_sections" "jsonb", "p_plan_items" "jsonb", "p_profile" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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

  if jsonb_typeof(p_sections) is distinct from 'array' then
    raise exception 'growth_sections_not_array' using errcode = '22023';
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
                    'attempts', coalesce((v_rec8 ->> 'attempts')::integer, 1),
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


ALTER FUNCTION "public"."fn_growth_complete_report"("p_report_id" "uuid", "p_profile_id" "uuid", "p_sections" "jsonb", "p_plan_items" "jsonb", "p_profile" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_growth_complete_report"("p_report_id" "uuid", "p_profile_id" "uuid", "p_sections" "jsonb", "p_plan_items" "jsonb", "p_profile" "jsonb") IS '성장설계 회차 완료(P4 8단계). 한 트랜잭션에서 sections 확정, status completed, current_step 8, issued_at 기록, 8단계 ok 기록, growth_plan_items insert, growth_profiles upsert 를 한다. 반환 jsonb: {ok:false, reason:not_ready}(행 없음, in_progress 아님, 7단계 ok 아님)/{ok:true, reason:already_completed}(멱등)/{ok:true, reason:completed, issuedAt, planItemCount}. p_plan_items 는 report_id, profile_id 없는 배열이며 둘은 인자로 채운다. 이월 항목의 원본은 건드리지 않는다. p_profile 의 profile_id 는 인자로 강제한다.';



CREATE OR REPLACE FUNCTION "public"."fn_growth_finish_step"("p_report_id" "uuid", "p_profile_id" "uuid", "p_step" smallint, "p_ok" boolean, "p_patch" "jsonb" DEFAULT '{}'::"jsonb", "p_issues" "jsonb" DEFAULT '[]'::"jsonb", "p_extra_attempts" integer DEFAULT 0) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."fn_growth_finish_step"("p_report_id" "uuid", "p_profile_id" "uuid", "p_step" smallint, "p_ok" boolean, "p_patch" "jsonb", "p_issues" "jsonb", "p_extra_attempts" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_growth_finish_step"("p_report_id" "uuid", "p_profile_id" "uuid", "p_step" smallint, "p_ok" boolean, "p_patch" "jsonb", "p_issues" "jsonb", "p_extra_attempts" integer) IS '성장설계 단계 종료(P4). 선점한 running 단계를 ok 또는 failed 로 닫는다. 반환 boolean: true 는 반영됨, false 는 행 없음, 회차가 draft/in_progress 아님, 단계가 running 아님(다른 요청이 끝냈거나 stale 선점이 덮어씀). p_ok 면 current_step 을 올리고 p_patch 허용 키(signals, narrative_theme, grade_subthemes, stage, axis_scores, consistency, sections, planDraft)만 반영하며 허용 밖 키는 무시한다. 실패면 issues 를 p_issues 로 기록하고 current_step 은 유지한다. attempts 는 선점 때 이미 1 올라가 있고 p_extra_attempts 를 더 더한다.';



CREATE OR REPLACE FUNCTION "public"."fn_growth_merge_survey_answers"("p_report_id" "uuid", "p_profile_id" "uuid", "p_patch" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_answers jsonb;
begin
  update public.growth_reports
  set survey_answers = jsonb_strip_nulls(
        coalesce(survey_answers, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb)
      ),
      last_activity_at = now(),
      updated_at = now()
  where id = p_report_id
    and profile_id = p_profile_id
    and status in ('draft', 'in_progress')
    and current_step = 0
  returning survey_answers into v_answers;

  return v_answers;
end;
$$;


ALTER FUNCTION "public"."fn_growth_merge_survey_answers"("p_report_id" "uuid", "p_profile_id" "uuid", "p_patch" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_growth_plan_items_guard_student_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;

  if new.done_source_program is not null
     and new.done_source_program <> 'manual'
     and new.done_source_program is distinct from old.done_source_program then
    raise exception 'plan_item_done_source_not_allowed' using errcode = '42501';
  end if;

  if new.done_ref_id is distinct from old.done_ref_id then
    raise exception 'plan_item_done_source_not_allowed' using errcode = '42501';
  end if;

  if new.status = 'done' then
    new.done_at := coalesce(new.done_at, now());
    new.done_source_program := coalesce(new.done_source_program, 'manual');
  elsif new.status = 'pending' then
    new.done_at := null;
    new.done_source_program := null;
    new.done_ref_id := null;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."fn_growth_plan_items_guard_student_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_growth_terminate_report"("p_report_id" "uuid", "p_profile_id" "uuid", "p_step" smallint, "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_report  public.growth_reports;
  v_now_iso text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 101));

  select * into v_report
    from public.growth_reports r
   where r.id = p_report_id and r.profile_id = p_profile_id
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_report.status not in ('draft', 'in_progress') then
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;

  update public.growth_reports r
     set status = 'archived',
         step_state = jsonb_set(
           coalesce(r.step_state, '{}'::jsonb),
           '{terminal}',
           jsonb_build_object('reason', p_reason, 'at', v_now_iso, 'step', p_step),
           true
         ),
         last_activity_at = now(),
         updated_at = now()
   where r.id = p_report_id;

  return jsonb_build_object(
    'ok', true,
    'needsReverse', (v_report.ledger_id is not null and v_report.ledger_reversed_at is null),
    'ledgerId', v_report.ledger_id
  );
end;
$$;


ALTER FUNCTION "public"."fn_growth_terminate_report"("p_report_id" "uuid", "p_profile_id" "uuid", "p_step" smallint, "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_growth_terminate_report"("p_report_id" "uuid", "p_profile_id" "uuid", "p_step" smallint, "p_reason" "text") IS '성장설계 회차 종결(P4). draft 또는 in_progress 회차를 archived 로 바꾸고 step_state.terminal 에 {reason, at, step} 을 병합한다(steps 는 보존). 반환 jsonb: {ok:false, reason:not_found}(행 없음)/{ok:false, reason:not_open}(draft, in_progress 아님)/{ok:true, needsReverse, ledgerId}. needsReverse 는 ledger_id 가 있고 ledger_reversed_at 이 비어 있을 때 true 다. 프로필 advisory 잠금(101) 뒤 회차 행을 for update 로 잡는다.';



CREATE OR REPLACE FUNCTION "public"."fn_guard_last_super_admin"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_was_super boolean;
  v_is_super  boolean;
  v_remaining int;
begin
  select coalesce(r.is_super, false) into v_was_super
    from public.admin_roles r where r.id = old.role_id;

  -- 최고 관리자가 아니었으면 이 트리거가 관여할 일이 없다.
  if not coalesce(v_was_super, false) or old.status <> 'active' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    v_is_super := false;
  else
    select coalesce(r.is_super, false) into v_is_super
      from public.admin_roles r where r.id = new.role_id;
    v_is_super := coalesce(v_is_super, false) and new.status = 'active';
  end if;

  -- 여전히 활성 최고 관리자면 아무것도 잃지 않았다.
  if v_is_super then
    return new;
  end if;

  select count(*) into v_remaining
    from public.admin_members m
    join public.admin_roles r on r.id = m.role_id
   where r.is_super and m.status = 'active' and m.profile_id <> old.profile_id;

  if v_remaining = 0 then
    raise exception '최고 관리자가 1명뿐이라 강등·정지·삭제할 수 없다. 다른 사람을 먼저 최고 관리자로 올릴 것.'
      using errcode = 'WC059';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;


ALTER FUNCTION "public"."fn_guard_last_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_inquiry_claim_generation"("p_session_id" "uuid", "p_profile_id" "uuid", "p_mode" "text", "p_stale_seconds" integer DEFAULT 120) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."fn_inquiry_claim_generation"("p_session_id" "uuid", "p_profile_id" "uuid", "p_mode" "text", "p_stale_seconds" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_inquiry_claim_generation"("p_session_id" "uuid", "p_profile_id" "uuid", "p_mode" "text", "p_stale_seconds" integer) IS '심화탐구 생성 선점. 프로필 advisory 잠금(101) 뒤 세션 행을 for update 로 읽어 mode 를 running 으로 표시한다. 반환 kind 어휘: claimed(attempts)/locked/running/exhausted(attempts). locked 는 세션 없음, draft/in_progress 아님, terminal 있음이다. 시도 상한은 mode 당 10(MAX_MODEL_ATTEMPTS_PER_MODE). startedAt 이 p_stale_seconds 보다 오래된 running 은 서버리스 중단으로 보고 다시 선점한다. 단계 순서와 done 멱등은 두지 않으며(재추천, 재평가가 같은 mode 를 다시 쓴다) draft 를 in_progress 로 올리지도 않는다. p_mode 가 topic_recommendation, design_report, evaluation_report 가 아니면 예외(22023).';



CREATE OR REPLACE FUNCTION "public"."fn_inquiry_finalize"("p_session_id" "uuid", "p_profile_id" "uuid", "p_fields" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."fn_inquiry_finalize"("p_session_id" "uuid", "p_profile_id" "uuid", "p_fields" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_inquiry_finalize"("p_session_id" "uuid", "p_profile_id" "uuid", "p_fields" "jsonb") IS '심화탐구 확정. 한 트랜잭션에서 activity_records 적립(source_program deep, source_ref_id 세션 id, status confirmed), inquiry_reports final 행 저장, 세션 completed 전환(current_step 6, completed_at, final_report_id)을 한다. 활동 기록의 subject_group 과 subject 는 세션 영역을 따른다: 교과는 ''교과'' 와 과목명, 자율은 ''자율'', 동아리는 ''동아리'', 진로는 ''진로'' 이고 subject 에는 활동명(없으면 null). p_fields 는 topic, concept, method, result, limitation(공백 아닌 문자열 필수), numbers, sources(jsonb 배열, 없으면 빈 배열). 반환 status 어휘: completed(activityRecordId, finalReportId)/already_completed(멱등, 같은 두 id)/session_not_found/not_ready(in_progress 아님 또는 평가 없음)/fields_missing(missing 배열). 성장설계 과제 회신은 하지 않는다(호출부 몫). 프로필 advisory 잠금(101) 뒤 세션 행을 for update 로 잡는다.';



CREATE OR REPLACE FUNCTION "public"."fn_inquiry_finish_generation"("p_session_id" "uuid", "p_profile_id" "uuid", "p_mode" "text", "p_ok" boolean, "p_issues" "jsonb" DEFAULT '[]'::"jsonb", "p_extra_attempts" integer DEFAULT 0) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."fn_inquiry_finish_generation"("p_session_id" "uuid", "p_profile_id" "uuid", "p_mode" "text", "p_ok" boolean, "p_issues" "jsonb", "p_extra_attempts" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_inquiry_finish_generation"("p_session_id" "uuid", "p_profile_id" "uuid", "p_mode" "text", "p_ok" boolean, "p_issues" "jsonb", "p_extra_attempts" integer) IS '심화탐구 생성 종료. 선점한 running mode 를 ok 또는 failed 로 닫는다. 반환 boolean: true 는 반영됨, false 는 행 없음, 세션이 draft/in_progress 아님, mode 가 running 아님(다른 요청이 끝냈거나 stale 선점이 덮어씀). attempts 는 선점 때 이미 1 올라가 있고 p_extra_attempts 를 더 더한다. ok 면 issues 를 비우고 실패면 p_issues 를 기록한다. 결과 컬럼은 건드리지 않는다(주제, 리포트는 앱이 service_role 로 직접 insert 한다).';



CREATE OR REPLACE FUNCTION "public"."fn_inquiry_terminate_session"("p_session_id" "uuid", "p_profile_id" "uuid", "p_mode" "text", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."fn_inquiry_terminate_session"("p_session_id" "uuid", "p_profile_id" "uuid", "p_mode" "text", "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_inquiry_terminate_session"("p_session_id" "uuid", "p_profile_id" "uuid", "p_mode" "text", "p_reason" "text") IS '심화탐구 세션 종결. draft 또는 in_progress 세션을 archived 로 바꾸고 generation_state.terminal 에 {reason, at, mode} 를 병합한다(modes 는 보존). 반환 jsonb: {ok:false, kind:not_found}(행 없음)/{ok:false, kind:locked}(draft, in_progress 아님, completed 포함)/{ok:true, kind:terminated, needsReverse, ledgerId}. needsReverse 는 ledger_id 가 있고 ledger_reversed_at 이 비어 있을 때 true 다. 프로필 advisory 잠금(101) 뒤 세션 행을 for update 로 잡는다. p_mode 가 허용 3종이 아니면 예외(22023).';



CREATE OR REPLACE FUNCTION "public"."fn_is_active_admin"("p_profile_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
      from public.admin_members m
     where m.profile_id = p_profile_id
       and m.status = 'active'
  );
$$;


ALTER FUNCTION "public"."fn_is_active_admin"("p_profile_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_is_active_admin"("p_profile_id" "uuid") IS '활성 관리자 여부(20260822000013). 권한 테이블의 읽기 정책 술어 전용이다 — 인라인 EXISTS 로 쓰면 admin_members 자신의 정책에서 42P17(무한 재귀)이 난다. SECURITY DEFINER 로 소유자 권한으로 돌아 RLS 를 우회하는 것이 재귀를 끊는 지점이다(fn_is_super_admin 과 같은 구조).';



CREATE OR REPLACE FUNCTION "public"."fn_is_linked_pair"("p_a" "uuid", "p_b" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1 from public.parent_child_links l
     where l.status = 'approved'
       and ((l.parent_id = p_a and l.student_id = p_b)
         or (l.parent_id = p_b and l.student_id = p_a))
  );
$$;


ALTER FUNCTION "public"."fn_is_linked_pair"("p_a" "uuid", "p_b" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_is_linked_pair"("p_a" "uuid", "p_b" "uuid") IS '두 프로필이 현재 approved 상태로 연결된 학부모-학생 쌍인지 판정(순서 무관). RLS 정책 안에서 parent_child_links 를 직접 참조하는 대신 이 SECURITY DEFINER 헬퍼를 거쳐 그 테이블 RLS 와의 재귀·충돌을 피한다(sql/68 5-g절).';



CREATE OR REPLACE FUNCTION "public"."fn_is_super_admin"("p_profile_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
      from public.admin_members m
      join public.admin_roles r on r.id = m.role_id
     where m.profile_id = p_profile_id
       and m.status = 'active'
       and r.is_super
  );
$$;


ALTER FUNCTION "public"."fn_is_super_admin"("p_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_knowledge_near_duplicates"("query_embedding" "extensions"."vector", "filter_knowledge_type" "text", "min_similarity" double precision, "match_count" integer) RETURNS TABLE("id" "uuid", "title" "text", "similarity" double precision)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select
    w.id,
    w.title,
    1 - (w.embedding <=> query_embedding) as similarity
  from public.winning_assessment_knowledge_items w
  where w.embedding is not null
    and w.knowledge_type = filter_knowledge_type
    and 1 - (w.embedding <=> query_embedding) >= min_similarity
  order by w.embedding <=> query_embedding
  limit match_count;
$$;


ALTER FUNCTION "public"."fn_knowledge_near_duplicates"("query_embedding" "extensions"."vector", "filter_knowledge_type" "text", "min_similarity" double precision, "match_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_kst_day_start"("p_ts" timestamp with time zone) RETURNS timestamp with time zone
    LANGUAGE "sql" IMMUTABLE
    AS $$
  -- timestamptz → (at time zone) timestamp → date_trunc(immutable 판) →
  -- (at time zone) timestamptz. 세션 GUC 를 타지 않는다.
  select (date_trunc('day', p_ts at time zone 'Asia/Seoul') at time zone 'Asia/Seoul');
$$;


ALTER FUNCTION "public"."fn_kst_day_start"("p_ts" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_kst_day_start"("p_ts" timestamp with time zone) IS '주어진 시각이 속한 KST 날짜의 00:00 을 돌려준다. 기간 시작 앵커 계산용(확정 정책: 기간 시작 = 결제 확정일 KST 00시). 세션 TimeZone 에 의존하지 않는다(sql/64 (나)).';



CREATE OR REPLACE FUNCTION "public"."fn_mark_program_entry"("p_program_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  -- 호출자(auth.uid()) 의 그 program_key 살아있는(revoked_at is null) 부여
  -- 들 중 first_accessed_at 이 아직 NULL 인 행에만 now() 를 1회 기록한다.
  -- 이미 값이 있는 행은 WHERE 조건에서 자연히 빠져 덮어쓰지 않는다(최초
  -- 진입만 기록 — 관례: "최초" 를 표현하는 컬럼은 조건부 UPDATE 로
  -- 멱등하게 만든다, sql/65 §1 원장 불변 원칙과 같은 방향).
  update public.program_access_grants g
     set first_accessed_at = now()
   where g.profile_id = auth.uid()
     and g.program_key = p_program_key
     and g.revoked_at is null
     and g.first_accessed_at is null;

  -- 부여가 없거나 이미 진입 기록이 있으면 0행 UPDATE — 예외를 던지지
  -- 않는다(팀 리드 지시). 입장 가부 판정은 fn_program_access_state 의
  -- 몫이고, 이 함수는 "이미 들어왔다면 그 사실만 기록"하는 후행 동작이다.
  return;
end;
$$;


ALTER FUNCTION "public"."fn_mark_program_entry"("p_program_key" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_mark_program_entry"("p_program_key" "text") IS '호출자(auth.uid())의 program_key 살아있는 부여 중 first_accessed_at 이 NULL 인 행에 최초 1회 now() 를 기록한다(멱등 — 재호출해도 이미 값이 있으면 아무 것도 바뀌지 않는다). 부여가 없어도 예외를 던지지 않는다(게이트가 이미 접근을 막으므로 이 함수가 재검증할 필요가 없다). 배선(목표관리 앱)은 sql/68 범위 밖이다(5-j절).';



CREATE OR REPLACE FUNCTION "public"."fn_matched_org_codes"("p_student_profile_id" "uuid" DEFAULT NULL::"uuid") RETURNS "text"[]
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_caller uuid := auth.uid();
  v_codes  text[];
begin
  if v_caller is null then
    return '{}';
  end if;

  select coalesce(array_agg(distinct upper(trim(code))), '{}')
    into v_codes
    from (
      -- 본인.
      select p.org_code as code
        from public.profiles p
       where p.id = v_caller and p.org_code is not null

      union all

      -- parent_child_links 로 연결된(approved) 상대 전원.
      select p.org_code as code
        from public.parent_child_links l
        join public.profiles p
          on p.id = case when l.parent_id = v_caller then l.student_id
                         when l.student_id = v_caller then l.parent_id
                    end
       where l.status = 'approved'
         and (l.parent_id = v_caller or l.student_id = v_caller)
         and p.org_code is not null

      union all

      -- p_student_profile_id 가 주어지고 호출자와 연결돼 있으면 그 학생.
      select p.org_code as code
        from public.profiles p
       where p_student_profile_id is not null
         and p.id = p_student_profile_id
         and p.org_code is not null
         and public.fn_is_linked_pair(v_caller, p_student_profile_id)
    ) as codes;

  return v_codes;
end;
$$;


ALTER FUNCTION "public"."fn_matched_org_codes"("p_student_profile_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_matched_org_codes"("p_student_profile_id" "uuid") IS '로그인 사용자(auth.uid())가 소속으로 확인받을 수 있는 org_code 목록(2026-09-01, 프론트 노출 필터용 — "이 org 한정 상품을 카탈로그에 보여줄까" 판단 재료). 본인 + parent_child_links 로 연결된(approved) 상대 전원 + p_student_profile_id 로 지정된, 호출자와 연결된 학생의 org_code 를 upper(trim) 정규화해 중복 제거 배열로 반환한다. 비로그인은 빈 배열. 실제 구매 가능 여부 판정은 fn_product_org_matches 가 별도로 한다(이 함수는 표시 전용, 서버 검증 대체 아님). 2026-09-22 — fn_matched_tenant_ids 로 대체, 후속 PR에서 drop 예정.';



CREATE OR REPLACE FUNCTION "public"."fn_matched_tenant_ids"("p_student_profile_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"[]
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_caller uuid := auth.uid();
  v_ids    uuid[];
begin
  if v_caller is null then
    return '{}';
  end if;

  select coalesce(array_agg(distinct id), '{}')
    into v_ids
    from (
      -- 본인.
      select p.tenant_id as id
        from public.profiles p
       where p.id = v_caller and p.tenant_id is not null

      union all

      -- parent_child_links 로 연결된(approved) 상대 전원.
      select p.tenant_id as id
        from public.parent_child_links l
        join public.profiles p
          on p.id = case when l.parent_id = v_caller then l.student_id
                         when l.student_id = v_caller then l.parent_id
                    end
       where l.status = 'approved'
         and (l.parent_id = v_caller or l.student_id = v_caller)
         and p.tenant_id is not null

      union all

      -- p_student_profile_id 가 주어지고 호출자와 연결돼 있으면 그 학생.
      select p.tenant_id as id
        from public.profiles p
       where p_student_profile_id is not null
         and p.id = p_student_profile_id
         and p.tenant_id is not null
         and public.fn_is_linked_pair(v_caller, p_student_profile_id)
    ) as ids;

  return v_ids;
end;
$$;


ALTER FUNCTION "public"."fn_matched_tenant_ids"("p_student_profile_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_matched_tenant_ids"("p_student_profile_id" "uuid") IS '로그인 사용자(auth.uid())가 소속으로 확인받을 수 있는 tenant id 목록(2026-09-22, fn_matched_org_codes 대체 — 프론트 노출 필터용, "이 소속 한정 상품을 카탈로그에 보여줄까" 판단 재료). 본인 + parent_child_links 로 연결된(approved) 상대 전원 + p_student_profile_id 로 지정된, 호출자와 연결된 학생의 tenant_id 를 중복 제거 배열로 반환한다. 비로그인은 빈 배열. 실제 구매 가능 여부 판정은 fn_tenant_matches 가 별도로 한다(이 함수는 표시 전용, 서버 검증 대체 아님).';



CREATE OR REPLACE FUNCTION "public"."fn_my_tenant"() RETURNS TABLE("id" "uuid", "name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select t.id, t.name
    from public.profiles p
    join public.tenants t on t.id = p.tenant_id
   where p.id = auth.uid();
$$;


ALTER FUNCTION "public"."fn_my_tenant"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_my_tenant"() IS '20260922 — 호출자(auth.uid())의 소속 id·name 만 반환(표시용). profiles.tenant_id 가 NULL 이면 0행. tier 등 내부 컬럼은 반환하지 않는다(fn_resolve_tenant_code 와 동일 원칙).';



CREATE OR REPLACE FUNCTION "public"."fn_normalize_tenant_code"("p" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select nullif(upper(regexp_replace(coalesce(p, ''), '[\s-]+', '', 'g')), '');
$$;


ALTER FUNCTION "public"."fn_normalize_tenant_code"("p" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_normalize_tenant_code"("p" "text") IS '20260922 — 소속 코드 표기 정규화. upper + 공백·하이픈 제거, 빈 문자열은 NULL. "ab12-cd34"/"AB12 CD34" 같은 사용자 입력 변형을 tenants.code 저장 형식과 맞추는 데 쓴다(profiles.org_code 정규화 관행, 20260825093735 과 동일 원칙).';



CREATE OR REPLACE FUNCTION "public"."fn_order_consumption_state"("p_order_id" "text") RETURNS TABLE("consumed" boolean, "consumed_sessions" "text", "consumed_period" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with sessions as (
    select string_agg(format('%s:%s회', t.program_key, t.used), ', ') as v
      from (
        select g.program_key, sum(-l.delta) as used
          from public.performance_credit_ledger l
          join public.program_access_grants g on g.id = l.grant_id
         where g.order_id = p_order_id
         group by g.program_key
        having sum(-l.delta) > 0
      ) t
  ),
  period as (
    select string_agg(
             format('%s:%s', g.program_key, to_char(g.first_accessed_at, 'YYYY-MM-DD HH24:MI')),
             ', '
           ) as v
      from public.program_access_grants g
     where g.order_id = p_order_id and g.first_accessed_at is not null
  )
  select
    (sessions.v is not null or period.v is not null) as consumed,
    sessions.v as consumed_sessions,
    period.v   as consumed_period
  from sessions, period;
$$;


ALTER FUNCTION "public"."fn_order_consumption_state"("p_order_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_order_consumption_state"("p_order_id" "text") IS '주문 하나의 소비 여부 판정 정본(sql/69, sql/68 fn_request_refund 5-b절에서 이관 — 판정 로직 복제 금지 원칙). 회차권은 performance_credit_ledger 순소비(sum(-delta))>0, 기간권은 program_access_grants.first_accessed_at is not null. fn_request_refund(신청 게이트, WC032)와 fn_complete_refund(완료 직전 재판정, WC032 재사용) 둘 다 이 함수를 쓴다.';



CREATE OR REPLACE FUNCTION "public"."fn_parent_children"() RETURNS TABLE("link_id" "uuid", "student_profile_id" "uuid", "link_status" "text", "linked_at" timestamp with time zone, "student_name" "text", "school_type" "text", "school_name" "text", "services" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_parent uuid := auth.uid();
begin
  if v_parent is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  return query
  select
    l.id,
    l.student_id,
    l.status,
    coalesce(l.responded_at, l.requested_at),
    p.name,
    p.school_type,
    p.school_name,
    case
      -- 수락 전에는 이용 내역을 보여주지 않는다(위 "반환 대상" 참고).
      when l.status <> 'approved' then '[]'::jsonb
      else coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'program_key',      k.program_key,
                   'program_name',     pr.name,
                   'unlimited_period', case when k.program_key = 'diagnose' and s.live_count = 0 then false
                                             else s.unlimited_period end,
                   'expires_at',       case when k.program_key = 'diagnose' and s.live_count = 0 then null
                                             else s.expires_at end,
                   'quota_total',      case when k.program_key = 'diagnose' and s.live_count = 0 then 0
                                             else s.quota_total end,
                   'quota_used',       case when k.program_key = 'diagnose' and s.live_count = 0 then 0
                                             else s.quota_used end,
                   'remaining',        case when k.program_key = 'diagnose' and s.live_count = 0 then 0
                                             when s.quota_total is null then null
                                             else greatest(s.quota_total - s.quota_used, 0)
                                        end
                 )
                 order by pr.sort_order, k.program_key
               )
          from (
            -- (a) 기존 판정: live grant 가 있는 프로그램(전 프로그램 공통).
            select g.program_key
              from public.program_access_grants g
             where g.profile_id = l.student_id
               and g.revoked_at is null
               and (g.expires_at is null or g.expires_at > now())
            union
            -- (b) 학습진단만: 취소되지 않은 grant 이력이 있었음(만료 포함).
            select 'diagnose'
             where exists (
               select 1
                 from public.program_access_grants g2
                where g2.profile_id = l.student_id
                  and g2.program_key = 'diagnose'
                  and g2.revoked_at is null
             )
            union
            -- (c) 학습진단만: grant 없이도 리포트가 존재(무료진단 등).
            select 'diagnose'
             where exists (
               select 1
                 from public.diagnosis_reports dr
                where dr.profile_id = l.student_id
             )
          ) k
          join public.programs pr on pr.program_key = k.program_key
          cross join lateral public.fn_program_access_grants_summary(l.student_id, k.program_key) s
         where k.program_key = 'diagnose' or s.live_count > 0
      ), '[]'::jsonb)
    end
  from public.parent_child_links l
  join public.profiles p on p.id = l.student_id
  where l.parent_id = v_parent
    and l.status in ('pending', 'approved')
  order by coalesce(l.responded_at, l.requested_at) desc;
end;
$$;


ALTER FUNCTION "public"."fn_parent_children"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_parent_children"() IS '학부모 마이페이지 자녀 목록(sql/73, 20260907 diagnose 행 보강). profiles_select_own 때문에 학부모가 자녀 프로필을 못 읽는 문제를 RLS 완화 대신 이 함수로 좁게 푼다 — 연결된(pending/approved) 자녀의 이름·학교·서비스 요약만 돌려준다. 서비스 요약은 fn_program_access_grants_summary(sql/65)를 그대로 호출한다(판정 로직 복제 금지). 학습진단(diagnose)만 예외로, live grant 가 없어도 취소되지 않은 grant 이력이나 diagnosis_reports 행이 있으면 0 값 서비스 행을 반환한다(QA 시트 행 210 — 학부모가 리포트 화면에 진입할 수 있어야 함). pending 링크는 services 가 빈 배열이다. 표시 카피는 만들지 않는다 — 프런트가 조립한다.';



CREATE OR REPLACE FUNCTION "public"."fn_parent_create_enrollment"("p_original_order_id" "text", "p_items" "jsonb") RETURNS TABLE("order_id" "text", "amount" integer, "discount_amount" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_order           public.orders;
  v_product_ids     uuid[];
  v_product_count   integer;
  v_list_amount     integer;
  v_subtotal        integer;
  v_discount_amount integer;
  v_new_order_id    text;
  v_order_name      text;
  v_first_name      text;
  v_prod            record;
begin
  select * into v_order from public.orders where id = p_original_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'WC051';
  end if;

  if v_order.parent_profile_id is distinct from auth.uid() then
    raise exception 'not_order_parent' using errcode = 'WC052';
  end if;

  -- 이 함수는 "미응답 요청"만 대체한다 — 원래 요청이 이미 승인/반려/
  -- superseded 등으로 종결됐으면 대체 불가.
  if v_order.approval_status <> 'requested' or v_order.status <> 'pending' then
    raise exception 'order_not_pending_for_override' using errcode = 'WC053';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'no_items_selected' using errcode = 'WC054';
  end if;

  -- 쌍 재검증 — sql/71 WC042 판정 로직과 동일 헬퍼 재사용.
  if not public.fn_is_linked_pair(v_order.student_profile_id, auth.uid()) then
    raise exception 'pair_not_linked' using errcode = 'WC055';
  end if;

  select array_agg(distinct (i ->> 'product_id')::uuid)
    into v_product_ids
    from jsonb_array_elements(p_items) as i;

  select count(*), sum(coalesce(p.list_price, p.price, 0)), sum(coalesce(p.price, 0))
    into v_product_count, v_list_amount, v_subtotal
    from public.products p
   where p.id = any (v_product_ids)
     and p.is_active = true
     and p.is_orderable = true;

  if v_product_count is distinct from array_length(v_product_ids, 1) then
    raise exception 'invalid_products' using errcode = 'WC056';
  end if;

  -- 추가 이용권은 학생 요청을 그대로 승인하는 경로로만 결제한다. 학부모
  -- 대체 구성에는 낼 수 없다.
  if exists (
    select 1 from public.products p
     where p.id = any (v_product_ids) and p.addon_only
  ) then
    raise exception 'addon_requires_live_grant' using errcode = 'WC067';
  end if;

  -- 신규(2026-09-01) — org 한정 상품 서버 검증(fn_request_enrollment 와
  -- 동일 축). 이 경로의 학부모는 auth.uid(), 학생은 v_order.student_
  -- profile_id.
  for v_prod in
    select p.id as product_id, p.tenant_id, p.sale_ends_at
      from public.products p
     where p.id = any (v_product_ids)
       and (p.tenant_id is not null or p.sale_ends_at is not null)
  loop
    if v_prod.tenant_id is not null
       and not public.fn_tenant_matches(
             v_prod.tenant_id, v_order.student_profile_id, auth.uid()) then
      raise exception 'product_org_mismatch' using errcode = 'WC064';
    end if;

    if v_prod.sale_ends_at is not null and now() >= v_prod.sale_ends_at then
      raise exception 'product_sale_ended' using errcode = 'WC065';
    end if;

    if v_prod.tenant_id is not null and exists (
      select 1
        from public.orders o
        join public.order_items oi on oi.order_id = o.id
       where o.student_profile_id = v_order.student_profile_id
         and o.status in ('paid', 'waiting_deposit')
         and oi.product_id = v_prod.product_id
    ) then
      raise exception 'product_purchase_limit' using errcode = 'WC066';
    end if;
  end loop;

  v_discount_amount := v_list_amount - v_subtotal;

  -- list_price < price 인 상품 데이터가 섞이면 discount_amount 가 음수가
  -- 될 수 있다 — 그대로 두면 아래 INSERT 가 orders_discount_amount_check
  -- (sql/58, discount_amount >= 0)에 걸려 처리되지 않은 raw 23514 로
  -- 죽는다. WC001 을 재사용해(v_subtotal <= 0 과 같은 금액 무결성 오류)
  -- 여기서 먼저 명시적으로 거부한다.
  if v_subtotal <= 0 or v_discount_amount < 0 then
    raise exception 'invalid_amount' using errcode = 'WC001';
  end if;

  v_new_order_id := 'order_' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint
                     || '_' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);

  -- p.id 는 랜덤 UUID 라 order by p.id 로는 매번 다른 상품이 "대표"로
  -- 뽑힌다 — 카탈로그 표시 순서(src/lib/products.ts PRODUCT_COLUMNS 와
  -- 동일한 service_sort_order, sort_order)로 정렬해 결정적으로 만든다.
  select p.name into v_first_name
    from public.products p
   where p.id = any (v_product_ids)
     and p.is_active = true
     and p.is_orderable = true
   order by p.service_sort_order, p.sort_order
   limit 1;

  v_order_name := case when v_product_count > 1
                    then coalesce(v_first_name, '위닝에듀 서비스') || ' 외 ' || (v_product_count - 1) || '건'
                    else coalesce(v_first_name, '위닝에듀 서비스')
                  end;

  -- 새 주문 — 학부모 본인이 결제 주체로서 직접 만드는 주문이라 스스로
  -- 승인 대기시킬 이유가 없다(refund_requests_parent_auto_approve_check
  -- 와 같은 선례 — 본인 신청은 즉시 approved). responded_at 도 함께
  -- 세팅해야 orders_responded_at_pairing_check 를 통과한다. 쿠폰은 받지
  -- 않는다(coupon_id NULL, 범위 밖).
  insert into public.orders (
    id, user_id, student_profile_id, parent_profile_id, status, order_name,
    list_amount, discount_amount, amount, customer_email,
    approval_status, responded_at
  ) values (
    v_new_order_id, auth.uid(), v_order.student_profile_id, auth.uid(), 'pending', v_order_name,
    v_list_amount, v_discount_amount, v_subtotal, v_order.customer_email,
    'approved', now()
  );

  insert into public.order_items (order_id, product_id, product_slug, service_key, name, list_price, price, quantity)
  select
    v_new_order_id,
    p.id,
    p.slug,
    p.service_key,
    p.name,
    coalesce(p.list_price, p.price, 0),
    coalesce(p.price, 0),
    1
  from public.products p
  where p.id = any (v_product_ids)
    and p.is_active = true
    and p.is_orderable = true;

  -- 원래 요청 종결 — reject_reason 은 세팅하지 않는다(NULL 유지, 위 1)절
  -- CHECK 근거). status 는 canceled 로 내려 orders_approval_before_
  -- payment_check 를 통과시킨다.
  update public.orders
     set approval_status         = 'superseded',
         superseded_by_order_id  = v_new_order_id,
         status                  = 'canceled',
         responded_at            = now()
   where id = p_original_order_id;

  -- 형제 요청 대체 — sql/76 이 학생당 여러 서비스에 걸친 동시 열린 요청을
  -- 허용해서, 이번에 선택한 서비스와 겹치는 다른 열린 요청을 안 건드리면
  -- 그 요청이 나중에 독립적으로 승인될 때 같은 서비스가 중복 결제된다.
  update public.orders o
     set approval_status        = 'superseded',
         superseded_by_order_id = v_new_order_id,
         status                 = 'canceled',
         responded_at           = now()
   where o.student_profile_id = v_order.student_profile_id
     and o.status = 'pending'
     and o.approval_status = 'requested'
     and o.id <> p_original_order_id
     and exists (
       select 1 from public.order_items oi
        where oi.order_id = o.id
          and oi.service_key in (
            select distinct p.service_key
              from public.products p
             where p.id = any (v_product_ids)
               and p.is_active = true
               and p.is_orderable = true
          )
     );

  return query select v_new_order_id, v_subtotal, v_discount_amount;
end;
$$;


ALTER FUNCTION "public"."fn_parent_create_enrollment"("p_original_order_id" "text", "p_items" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_parent_create_enrollment"("p_original_order_id" "text", "p_items" "jsonb") IS '학부모가 학생의 미응답 수강신청 요청(status=pending, approval_status=requested)을 자신이 고른 상품 구성으로 대체해 즉시 approved 상태의 새 주문을 만든다(sql/85 + 20260825 is_orderable 게이트 + 2026-09-01 org 한정 상품 서버 검증). 호출자는 그 주문의 parent_profile_id 여야 하고(WC052) 원래 요청이 여전히 미응답이어야 한다(WC053). fn_is_linked_pair 로 쌍을 재검증한다(WC055, sql/71 WC042 와 동일 헬퍼). 선택 상품은 is_active=true 이고 is_orderable=true 인 것만 허용하며 하나라도 비활성/주문불가/존재하지 않으면 거부한다(WC056). org_code/sale_ends_at 을 가진 상품이면 소속 불일치(WC064), 판매 마감(WC065), 학생당 1회 구매 제한 초과(WC066)를 재검증한다. discount_amount 가 음수면 WC001 로 거부한다(orders_discount_amount_check 사전 방어). 대표 상품명(order_name)은 카탈로그 정렬(service_sort_order, sort_order)로 결정적으로 고른다. 새 주문은 쿠폰을 받지 않는다(coupon_id NULL, 범위 밖). 원래 주문은 approval_status=superseded, status=canceled, superseded_by_order_id=새 주문 id 로 종결된다, reject_reason 은 세팅하지 않는다(orders_reject_reason_pairing_check 상 NULL 유지 필요), responded_at 은 함께 세팅한다(orders_responded_at_pairing_check 상 필수). 같은 학생의 다른 열린 요청(sql/76 이 허용하는, 다른 서비스에 걸친 동시 pending/requested 요청) 중 이번에 선택된 상품과 service_key 가 겹치는 것도 함께 superseded 처리해 나중에 독립 승인될 때 같은 서비스가 중복 결제되는 것을 막는다. 2026-09-22 org_code text 비교를 tenant_id 비교로 전환. 추가 이용권: 선택 상품에 addon_only 가 하나라도 있으면 WC067 로 거부한다(추가 이용권은 학생 요청을 그대로 승인하는 경로로만 결제).';



CREATE OR REPLACE FUNCTION "public"."fn_product_org_matches"("p_org_code" "text", "p_student" "uuid", "p_parent" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select
    p_org_code is null
    or exists (
      select 1
      from public.profiles p
      where p.id in (p_student, p_parent)
        and p.org_code is not null
        and upper(trim(p.org_code)) = p_org_code
    );
$$;


ALTER FUNCTION "public"."fn_product_org_matches"("p_org_code" "text", "p_student" "uuid", "p_parent" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_product_org_matches"("p_org_code" "text", "p_student" "uuid", "p_parent" "uuid") IS '소속 한정 상품 판정(2026-09-01, fn_coupon_org_matches 와 동일 본문). p_org_code 가 NULL 이면 항상 true. 아니면 학생(p_student) 또는 학부모(p_parent) 중 하나라도 profiles.org_code 가 그 값과 같으면 true(쌍 OR).';



CREATE OR REPLACE FUNCTION "public"."fn_profiles_lock_identity_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.role() = 'authenticated' and not public.is_admin() then
    if old.name is not null and new.name is distinct from old.name then
      raise exception using errcode = 'P0001',
        message = '이름·생년월일·성별은 변경할 수 없습니다.';
    end if;

    if old.birth_date is not null and new.birth_date is distinct from old.birth_date then
      raise exception using errcode = 'P0001',
        message = '이름·생년월일·성별은 변경할 수 없습니다.';
    end if;

    if old.gender is not null and new.gender is distinct from old.gender then
      raise exception using errcode = 'P0001',
        message = '이름·생년월일·성별은 변경할 수 없습니다.';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."fn_profiles_lock_identity_fields"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_profiles_lock_identity_fields"() IS '20260825093331 — profiles.name/birth_date/gender 변경 잠금 트리거 함수. 가입 시
  본인인증으로 확정된 값이라 QA 요구(2026-08-22)로 이후 수정을 막는다. UI 잠금은
  DevTools로 우회 가능해 DB 레벨에서도 막는다. old 값이 null인 최초 입력(기존 가입자
  백필·향후 가입 폼 확장)은 허용한다. service_role과 public.is_admin() 통과자는 예외.';



CREATE OR REPLACE FUNCTION "public"."fn_profiles_lock_tenant"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_changed boolean;
begin
  if auth.role() = 'authenticated' and not public.is_admin() then
    if tg_op = 'INSERT' then
      v_changed := new.tenant_id is not null;
    else
      v_changed := new.tenant_id is distinct from old.tenant_id;
    end if;

    if v_changed
       and coalesce(current_setting('app.tenant_set_via_rpc', true), '') <> '1' then
      raise exception using errcode = 'WC070',
        message = '소속은 별도 절차로만 변경할 수 있습니다.';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."fn_profiles_lock_tenant"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_profiles_lock_tenant"() IS '20260922 — profiles.tenant_id 잠금 트리거 함수(fn_profiles_lock_identity_fields, 20260825093331 과 별도 — 그 함수는 이름·생년월일·성별만 다루고 이번에 수정하지 않았다). authenticated 세션의 직접 UPDATE(값 변경)와 직접 INSERT(tenant_id 비NULL)를 막고, fn_set_my_tenant·fn_admin_set_profile_tenant·complete_signup_profile 이 set_config(app.tenant_set_via_rpc, 1, true)로 표시한 호출만 통과시킨다. INSERT 를 같이 잠그는 이유는 profiles_insert_own 이 본인 행 insert 를 허용하기 때문이다. service_role·is_admin() 통과자는 이 게이트 자체를 안 탄다(기존 identity lock 트리거와 동일 예외 원칙).';



CREATE OR REPLACE FUNCTION "public"."fn_program_access_grants_summary"("p_profile_id" "uuid", "p_program_key" "text") RETURNS TABLE("live_count" integer, "quota_total" integer, "quota_used" integer, "expires_at" timestamp with time zone, "unlimited_period" boolean, "unlimited_sessions" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select
    coalesce((
      select count(*)
        from public.program_access_grants g
       where g.profile_id = p_profile_id and g.program_key = p_program_key
         and g.revoked_at is null
         and (g.expires_at is null or g.expires_at > now())
    ), 0)::int as live_count,

    (
      select case when bool_or(g.granted_sessions is null) then null
                  else sum(g.granted_sessions) end
        from public.program_access_grants g
       where g.profile_id = p_profile_id and g.program_key = p_program_key
         and g.revoked_at is null
         and (g.expires_at is null or g.expires_at > now())
    )::int as quota_total,

    coalesce((
      select sum(-l.delta)
        from public.performance_credit_ledger l
        join public.program_access_grants g on g.id = l.grant_id
       where g.profile_id = p_profile_id and g.program_key = p_program_key
         and g.revoked_at is null
         and (g.expires_at is null or g.expires_at > now())
    ), 0)::int as quota_used,

    (
      select case when bool_or(g.expires_at is null) then null else max(g.expires_at) end
        from public.program_access_grants g
       where g.profile_id = p_profile_id and g.program_key = p_program_key
         and g.revoked_at is null
    ) as expires_at,

    coalesce((
      select bool_or(g.expires_at is null)
        from public.program_access_grants g
       where g.profile_id = p_profile_id and g.program_key = p_program_key
         and g.revoked_at is null
    ), false) as unlimited_period,

    coalesce((
      select bool_or(g.granted_sessions is null)
        from public.program_access_grants g
       where g.profile_id = p_profile_id and g.program_key = p_program_key
         and g.revoked_at is null
         and (g.expires_at is null or g.expires_at > now())
    ), false) as unlimited_sessions;
$$;


ALTER FUNCTION "public"."fn_program_access_grants_summary"("p_profile_id" "uuid", "p_program_key" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_program_access_grants_summary"("p_profile_id" "uuid", "p_program_key" "text") IS '부여 원장(program_access_grants)+소비 원장(performance_credit_ledger)에서 회차·기간 요약을 매번 재계산한다. 굳혀 저장하지 않는다(sql/64 (마)절과 동일 원칙). consume_performance_credit·fn_program_access_state 공용 정본(sql/65).';



CREATE OR REPLACE FUNCTION "public"."fn_program_access_state"("p_profile_id" "uuid", "p_program_keys" "text"[]) RETURNS TABLE("program_key" "text", "allowed" boolean, "reason" "text", "expires_at" timestamp with time zone, "unlimited_period" boolean, "quota_total" integer, "quota_used" integer, "unlimited_sessions" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select pa.program_key,
         (pa.payment_status = 'paid'
          and pa.access_status = 'active'
          and s.live_count > 0)                                       as allowed,
         case
           when pa.payment_status <> 'paid'   then 'not_paid'
           when pa.access_status  <> 'active' then 'access_status_' || pa.access_status
           when s.live_count = 0              then 'period_expired'
           else 'ok'
         end                                                           as reason,
         s.expires_at,
         s.unlimited_period,
         s.quota_total,
         s.quota_used,
         s.unlimited_sessions
    from public.program_access pa
   cross join lateral public.fn_program_access_grants_summary(p_profile_id, pa.program_key) as s
   where pa.id = p_profile_id
     and pa.program_key = any(p_program_keys);
$$;


ALTER FUNCTION "public"."fn_program_access_state"("p_profile_id" "uuid", "p_program_keys" "text"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_program_access_state"("p_profile_id" "uuid", "p_program_keys" "text"[]) IS '입장 판정 단일 정본(sql/64 M1, sql/65 로 원장 기반 재작성). allowed 는 payment_status=paid + access_status=active + 살아있고 만료되지 않은 부여 존재를 본다(단일 스칼라로 뭉개지 않는다 — 결함 B, 정정 2로 입장 게이트까지 확인). meta jsonb 캐스팅을 전혀 하지 않는다(결함 D). 행이 없으면 0행 = 미보유.';



CREATE OR REPLACE FUNCTION "public"."fn_refund_completed_amount"("p_order_id" "text") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(sum(amount), 0)::integer
    from public.refund_requests
   where order_id = p_order_id
     and status = 'completed';
$$;


ALTER FUNCTION "public"."fn_refund_completed_amount"("p_order_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_refund_completed_amount"("p_order_id" "text") IS '그 주문의 완료(status=completed) 환불 누적액. fn_complete_refund 5)단계와 fn_request_refund 신규 누적액 가드가 공유한다(sql/69, R3 이중 환불 무제한 해소).';



CREATE OR REPLACE FUNCTION "public"."fn_refund_quote"("p_order_id" "text", "p_order_item_ids" bigint[] DEFAULT NULL::bigint[], "p_company_fault" boolean DEFAULT false, "p_at" timestamp with time zone DEFAULT "now"()) RETURNS TABLE("order_id" "text", "gross_amount" integer, "refund_amount" integer, "fee_amount" integer, "started" boolean, "needs_review" boolean, "policy_code" "text", "lines" "jsonb", "scope" "text", "terms_version" "text", "within_withdrawal" boolean, "company_fault" boolean, "bundle_return_amount" integer, "coupon_restore" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_order        public.orders;
  v_caller       uuid := auth.uid();
  v_items        bigint[];
  v_scope        text;
  v_sum_list     bigint := 0;   -- 정가 합계액(주문의 모든 order_items, 회수 라인 포함)
  v_grant_count  integer := 0;  -- 대상 라인 수
  v_live_count   integer := 0;  -- 주문 전체의 살아있는 라인 수
  v_line_list    integer;       -- 개별 정가
  v_line_paid    integer;       -- 안분결제액 P_i
  v_step2        integer;       -- 제33조의1 적용 결과(공제 전)
  v_line_refund  integer;
  v_used         integer;
  v_ratio        numeric;
  v_months       integer;
  v_k            integer;       -- 완료 개월 수
  v_c            numeric;       -- 해당 월 계단 차감률(0 / 1/3 / 1/2 / 1)
  v_monthly      numeric;       -- L(정가 월액) 또는 M(안분 월액, ⑪ 예외)
  v_ms           timestamptz;
  v_me           timestamptz;
  v_wd           boolean;
  v_all_wd       boolean := true;
  v_all_before   boolean := true;
  v_cap          integer;
  v_code         text;
  v_started      boolean := false;
  v_review       boolean := false;
  v_sum_refund   bigint := 0;
  v_bundle_sum   integer := 0;
  v_codes        text[] := '{}';
  -- grant 단위 원본 라인(루프가 쌓는다) - order_item_id 로 다시 합쳐 v_lines 로
  -- 만든다(아래 "표시 라인 합산" 블록).
  v_grant_lines  jsonb := '[]'::jsonb;
  v_lines        jsonb := '[]'::jsonb;
  v_idx          integer := 0;
  v_restore      boolean := false;
  g              record;
begin
  select * into v_order from public.orders o where o.id = p_order_id;

  -- 소유권 - fn_request_refund 와 같은 쌍 판정(존재 스캐닝 방지, Ver9 유지).
  if v_order.id is null
     or (v_caller is distinct from v_order.student_profile_id
         and v_caller is distinct from v_order.parent_profile_id
         and not public.is_admin()) then
    raise exception 'order_not_found_or_not_owned' using errcode = 'WC005';
  end if;

  if v_order.status <> 'paid' then
    raise exception 'order_not_refundable' using errcode = 'WC006';
  end if;

  -- 대상 항목 정규화 - 중복 제거. 빈 배열은 신청이 아니다.
  if p_order_item_ids is not null then
    select array_agg(distinct x order by x) into v_items
      from unnest(p_order_item_ids) x;
    if v_items is null then
      raise exception 'refund_items_invalid'
        using errcode = 'WC060', detail = 'order_item_ids is empty';
    end if;
    -- 주문 밖의 항목은 거부한다.
    if exists (
      select 1 from unnest(v_items) x
       where not exists (
         select 1 from public.order_items oi
          where oi.id = x and oi.order_id = p_order_id)
    ) then
      raise exception 'refund_items_invalid'
        using errcode = 'WC060',
              detail  = format('order_id=%s items=%s - 주문에 속하지 않는 항목', p_order_id, v_items);
    end if;
    -- 살아있는 부여가 없는 항목(이미 회수됐거나 부여 자체가 없던 라인)은
    -- 환불할 실체가 없다.
    if exists (
      select 1 from unnest(v_items) x
       where not exists (
         select 1 from public.program_access_grants pg
          where pg.order_item_id = x and pg.revoked_at is null)
    ) then
      raise exception 'refund_items_invalid'
        using errcode = 'WC060',
              detail  = format('order_id=%s items=%s - 살아있는 부여가 없는 항목', p_order_id, v_items);
    end if;
  end if;

  select count(*) into v_live_count
    from public.program_access_grants pg
   where pg.order_id = p_order_id and pg.revoked_at is null
     and not (pg.paid_amount = 0
                and exists (select 1 from public.order_items gi
                             where gi.id = pg.order_item_id and gi.list_price > 0));

  -- 대상이 살아있는 라인 전부를 덮으면 주문 전체 신청으로 승격한다 -
  -- "전부 해지" 판정(⑦-5 다목, 제33조의3 ⑤)과 유니크 인덱스 축이 한
  -- 표현으로 모인다(§2-10). RefundRequestModal 의 전체 선택도 이 경로다.
  if v_items is not null
     and not exists (
       select 1 from public.program_access_grants pg
        where pg.order_id = p_order_id
          and pg.revoked_at is null
          and not (pg.paid_amount = 0
                and exists (select 1 from public.order_items gi
                             where gi.id = pg.order_item_id and gi.list_price > 0))
          and not (pg.order_item_id = any(v_items))
     ) then
    v_items := null;
  end if;

  v_scope := case when v_items is null then 'order' else 'items' end;

  -- 부여 원장이 없는 주문 - 산정 근거 없음. 전액 + 검토 플래그(Ver9 유지).
  if v_live_count = 0 then
    return query select
      v_order.id, v_order.amount, v_order.amount, 0,
      false, true, 'no_grant'::text, '[]'::jsonb,
      'order'::text, 'v10'::text, null::boolean, p_company_fault, 0, false;
    return;
  end if;

  -- 정가 합계액(제33조의2 ⑤ 분모) - 주문의 모든 order_items. 회수된 라인도
  -- 포함한다: 분모는 주문 시점에 고정돼야 부분환불을 거듭해도 배분이 흔들리지
  -- 않는다(§3-1 1단계).
  select coalesce(sum(oi.list_price::bigint * oi.quantity), 0) into v_sum_list
    from public.order_items oi
   where oi.order_id = p_order_id;

  select count(*) into v_grant_count
    from public.program_access_grants pg
   where pg.order_id = p_order_id
     and pg.revoked_at is null
     and not (pg.paid_amount = 0
                and exists (select 1 from public.order_items gi
                             where gi.id = pg.order_item_id and gi.list_price > 0))
     and (v_items is null or pg.order_item_id = any(v_items));

  for g in
    select pg.id, pg.program_key, pg.product_slug, pg.paid_amount,
           pg.granted_months, pg.granted_sessions, pg.validity_days,
           pg.starts_at, pg.expires_at, pg.first_accessed_at,
           pg.order_item_id,
           oi.list_price, oi.quantity, oi.name as item_name
      from public.program_access_grants pg
      left join public.order_items oi on oi.id = pg.order_item_id
     where pg.order_id = p_order_id
       and pg.revoked_at is null
       and not (pg.paid_amount = 0
                and exists (select 1 from public.order_items gi
                             where gi.id = pg.order_item_id and gi.list_price > 0))
       and (v_items is null or pg.order_item_id = any(v_items))
     order by pg.id
  loop
    v_idx := v_idx + 1;

    v_line_list := coalesce(g.list_price, 0) * coalesce(g.quantity, 1);

    -- 1/2단계 - 안분결제액 P_i = 실결제액 × 개별 정가 / 정가 합계액, 절상
    -- (제33조의2 ⑤, ※ 절상 차액은 회사 부담). 정가 0 라인은 무상 취득분
    -- (제33조의3 ⑥) - 배분 0. 정가 합계 0은 orders_amount_check 상 도달
    -- 불가지만, 그래도 오면 사람이 보게 검토 플래그만 세운다.
    if v_sum_list > 0 then
      v_line_paid := ceil(v_order.amount::numeric * v_line_list / v_sum_list)::integer;
    else
      v_line_paid := ceil(v_order.amount::numeric / v_grant_count)::integer;
      v_review := true;
    end if;

    -- 청약철회기간(제32조 ①, 7일) - 기산은 이용 가능일(starts_at)과 결제
    -- 시각 중 늦은 쪽(§2-9: 재구매 체이닝으로 starts_at 이 미래일 수 있다).
    v_wd := p_at < greatest(g.starts_at, coalesce(v_order.paid_at, g.starts_at))
                   + interval '7 days';

    -- 회차 순소비(Ver9 유지).
    select coalesce(sum(-l.delta), 0)::integer into v_used
      from public.performance_credit_ledger l
     where l.grant_id = g.id;

    v_started := v_started or v_used > 0 or g.first_accessed_at is not null;

    v_ratio   := null;
    v_k       := null;
    v_c       := null;
    v_monthly := null;

    if v_line_list = 0 and v_sum_list > 0 then
      -- 무상 취득분(제33조의3 ⑥) - 환불 대상 아님, 검토 대상도 아님(§2-2).
      v_step2 := 0;
      v_code  := 'free_item';

    elsif g.expires_at is not null and p_at >= g.expires_at then
      -- 유효기간/이용기간 만료(제33조의1 ⑤/⑥) - 잔여 가치 소멸.
      v_step2 := 0;
      v_code  := 'expired';

    elsif g.granted_sessions is not null then
      -- 회차제(⑧). 기간+회차 혼합 상품도 회차제다(⑧ 후문 단서 + 고객사
      -- 회신 8/31, §2-6) - 기간은 위 만료 축으로만 작동한다.
      if v_used <= 0 then
        v_step2 := v_line_paid;
        v_code  := 'before_start';
      elsif g.granted_sessions = 1 then
        -- 1회권 개시 후 청약철회 제한(④ + 제32조 ②).
        v_step2 := 0;
        v_code  := 'single_use_closed';
      else
        -- 회차 단가 × 미사용 잔여, 절상(⑧ + ⑤ ※).
        v_step2 := ceil(
          v_line_paid::numeric
          * greatest(g.granted_sessions - v_used, 0)
          / g.granted_sessions
        )::integer;
        v_code := 'sessions_prorated';
      end if;

    elsif g.first_accessed_at is null then
      -- 기간제 미개시 - 이용 시작 전 전액(②-1).
      v_step2 := v_line_paid;
      v_code  := 'before_start';

    else
      v_months := g.granted_months;

      if g.expires_at is null or g.expires_at <= g.starts_at then
        -- 무기한/비정상 기간은 경과율을 정의할 수 없다(Ver9 유지).
        v_step2 := v_line_paid;
        v_code  := 'period_unbounded';

      elsif v_months = 1 then
        -- 1개월 이내 과정 - ②-2 계단, 절상.
        v_ratio := extract(epoch from (p_at - g.starts_at))
                 / extract(epoch from (g.expires_at - g.starts_at));
        v_step2 := case
          when v_ratio < (1.0/3.0) then ceil(v_line_paid::numeric * 2 / 3)::integer
          when v_ratio < 0.5       then ceil(v_line_paid::numeric / 2)::integer
          else 0
        end;
        v_code := 'period_tier';

      else
        -- 1개월 초과 과정 - 환불 = max(0, P − L×(k+c)) (§2-4 권장 (a)=(b):
        -- ②-3호 월 계단과 ⑪ 정가 재산정을 어느 순서로 읽어도 같은 값).
        --   k = 완료 개월 수, c = 해당 월 계단 차감률(그 월 안의 경과율로
        --   ②-2와 같은 기준), L = 정가 월액. 회사 귀책/청약철회기간 내면
        --   ⑪ 예외 - L 을 안분결제 월액(M = P/N)으로 바꿔 같은 식을 쓴다.
        select count(*)::integer into v_k
          from generate_series(1, v_months) i
         where public.fn_add_months_kst(g.starts_at, i) <= p_at;
        v_k := least(v_k, v_months);

        v_ms := public.fn_add_months_kst(g.starts_at, v_k);
        if p_at > v_ms and v_k < v_months then
          v_me := public.fn_add_months_kst(g.starts_at, v_k + 1);
          v_ratio := extract(epoch from (p_at - v_ms))
                   / extract(epoch from (v_me - v_ms));
          v_c := case
            when v_ratio < (1.0/3.0) then 1.0/3.0
            when v_ratio < 0.5       then 0.5
            else 1.0
          end;
        else
          v_c := 0;
        end if;

        if p_company_fault or v_wd then
          v_monthly := v_line_paid::numeric / v_months;
          v_code    := 'period_monthly_tier_noreprice';
        else
          v_monthly := v_line_list::numeric / v_months;
          v_code    := 'period_monthly_tier';
        end if;

        v_step2 := ceil(greatest(0::numeric, v_line_paid - v_monthly * (v_k + v_c)))::integer;
      end if;
    end if;

    -- 3단계 - 제33조의2 ⑦ 동시결제 조건부 할인 반환금. 현 데이터 모델에는
    -- 조건부 할인 컬럼이 없어 항상 0(§2-5 확정 - ⑦-1이 장기할인/쿠폰을
    -- 명시 제외). 컬럼이 생기면 ⑦-2 산식 + ⑦-4 표시 전제 + ⑦-5 면제
    -- (회사 귀책 ∨ 철회기간 내 ∨ 전부 해지)를 여기서 계산한다.
    v_line_refund := greatest(0, v_step2);
    v_sum_refund  := v_sum_refund + v_line_refund;
    v_codes       := v_codes || v_code;
    v_all_wd      := v_all_wd and v_wd;
    v_all_before  := v_all_before and v_code = 'before_start';
    v_review      := v_review or v_code = 'period_unbounded';

    v_grant_lines := v_grant_lines || jsonb_build_object(
      'grant_id',          g.id,
      'order_item_id',     g.order_item_id,
      'program_key',       g.program_key,
      'product_slug',      g.product_slug,
      'item_name',         g.item_name,
      'list_price',        v_line_list,
      'paid_allocated',    v_line_paid,
      'list_amount',       v_line_list,
      'granted_months',    g.granted_months,
      'granted_sessions',  g.granted_sessions,
      'used_sessions',     v_used,
      'first_accessed_at', g.first_accessed_at,
      'expires_at',        g.expires_at,
      'within_withdrawal', v_wd,
      'elapsed_ratio',     v_ratio,
      'charge_months',     v_k,
      'month_tier',        case when v_c is null then null else round(v_c, 4) end,
      'monthly_list',      case when v_monthly is null then null
                                else round(v_monthly, 2) end,
      'step2_amount',      v_step2,
      'bundle_return',     0,
      'refund',            v_line_refund,
      'policy_code',       v_code
    );
  end loop;

  -- 표시 라인 합산 - order_item_id 단위로 grant 라인을 다시 묶는다(위 설명
  -- 주석 참고). grant 가 하나뿐인 order_item은 원본 라인을 그대로 내보내고,
  -- 여럿(번들)이면 금액을 합산한 라인 하나로 합친다.
  with numbered as (
    select row_number() over () as seq,
           elem,
           (elem->>'order_item_id')::bigint as item_id
      from jsonb_array_elements(v_grant_lines) elem
  ),
  grouped as (
    select
      item_id,
      count(*) as n,
      min(seq) as first_seq,
      (array_agg(elem order by seq))[1] as sole_elem,
      jsonb_build_object(
        'grant_id',          null,
        'order_item_id',     item_id,
        'program_key',       null,
        'product_slug',      null,
        'item_name',         min(elem->>'item_name'),
        'list_price',        sum((elem->>'list_price')::bigint),
        'paid_allocated',    sum((elem->>'paid_allocated')::bigint),
        'list_amount',       sum((elem->>'list_amount')::bigint),
        'granted_months',    null,
        'granted_sessions',  null,
        'used_sessions',     null,
        'first_accessed_at', null,
        'expires_at',        null,
        'within_withdrawal', bool_and((elem->>'within_withdrawal')::boolean),
        'elapsed_ratio',     null,
        'charge_months',     null,
        'month_tier',        null,
        'monthly_list',      null,
        'step2_amount',      sum((elem->>'step2_amount')::bigint),
        'bundle_return',     0,
        'refund',            sum((elem->>'refund')::bigint),
        'policy_code',       case when count(distinct elem->>'policy_code') = 1
                                   then min(elem->>'policy_code')
                                   else 'mixed' end
      ) as merged_elem
      from numbered
     group by item_id
  )
  select coalesce(
           jsonb_agg(
             case when n = 1 then sole_elem else merged_elem end
             order by first_seq
           ),
           '[]'::jsonb
         )
    into v_lines
    from grouped;

  -- 합산 - 100원 내림은 폐지(⑤ ※ 전면 절상). 클램프 상한은 누적 완료
  -- 환불을 반영한다(§3-1 8단계 - Ver9 는 orders.amount 만 봤다).
  v_cap := greatest(0, v_order.amount - public.fn_refund_completed_amount(p_order_id));
  v_sum_refund := greatest(0, least(v_sum_refund, v_cap));

  -- 전부 청약철회 쿠폰 복원(제33조의3 ⑤) - 주문 전체 + 모든 라인 철회기간
  -- 내 + 모든 라인 미개시 + 살아있는 쿠폰 사용이 있을 때.
  v_restore := v_scope = 'order'
    and v_all_wd
    and v_all_before
    and exists (
      select 1 from public.coupon_redemptions cr
       where cr.order_id = p_order_id and cr.voided_at is null);

  select case when count(distinct c) = 1 then min(c) else 'mixed' end
    into v_code
    from unnest(v_codes) c;

  return query select
    v_order.id,
    v_order.amount,
    v_sum_refund::integer,
    (v_order.amount - v_sum_refund)::integer,
    v_started,
    v_review,
    v_code,
    v_lines,
    v_scope,
    'v10'::text,
    v_all_wd,
    p_company_fault,
    v_bundle_sum,
    v_restore;
end;
$$;


ALTER FUNCTION "public"."fn_refund_quote"("p_order_id" "text", "p_order_item_ids" bigint[], "p_company_fault" boolean, "p_at" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_refund_quote"("p_order_id" "text", "p_order_item_ids" bigint[], "p_company_fault" boolean, "p_at" timestamp with time zone) IS '제33조의1~3 Ver10 환불 산정 정본(20260901, 20260901070515 표시 라인 order_item_id 합산 패치). 개별 정가 비율 절상 안분(제33조의2 ⑤) to 라인별 정책(②계단/⑧회차/⑪장기할인 = max(0, P−L×(k+c)), 만료 0원) to ⑦ 공제(현 모델 0) 3단계. 응답 lines 는 grant 단위 산정을 order_item_id 로 다시 합쳐 노출한다 - 번들 상품(한 order_item이 grant 여러 개를 만드는 경우)이 화면에 중복 항목으로 보이지 않게 한다(grant 하나뿐인 일반 상품은 원본 필드 그대로 보존). p_order_item_ids 로 구성서비스 단위 부분 산정, p_company_fault/청약철회 7일 내는 ⑪ 예외(L=M), p_at 은 재견적 재현용. 모달 미리보기/fn_request_refund/fn_complete_refund 재견적이 이 함수 하나를 공유한다. 소유권 WC005, 결제 상태 WC006, 대상 항목 검증 WC060. 20261021 패치: 정가가 있는 order_item 에 딸린 paid_amount 0 부여(목표관리 증정분)는 산정 대상, 건수, 부분환불 승격 판정에서 뺀다. 증정 부여가 결제액을 다시 안분받아 환불액이 부풀려지는 것을 막고, 정가 0 라인(무상 취득분, free_item)은 그대로 산정한다.';



CREATE OR REPLACE FUNCTION "public"."fn_request_enrollment"("p_order_id" "text", "p_student_profile_id" "uuid", "p_parent_profile_id" "uuid", "p_customer_email" "text", "p_order_name" "text", "p_items" "jsonb", "p_list_amount" integer, "p_subtotal" integer) RETURNS TABLE("order_id" "text", "amount" integer, "discount_amount" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_discount_amount integer;
  v_amount          integer;
  v_prod            record;
  v_addon           record;
begin
  if p_order_id is null or p_subtotal is null or p_list_amount is null then
    raise exception 'order_id/list_amount/subtotal required';
  end if;

  if p_student_profile_id is null or p_parent_profile_id is null then
    raise exception 'enrollment_pair_required' using errcode = 'WC019';
  end if;
  if p_student_profile_id = p_parent_profile_id then
    raise exception 'enrollment_pair_same_profile' using errcode = 'WC020';
  end if;

  -- 학생 축 advisory lock 유지(sql/71) — 동시에 들어온 같은 학생의 요청을
  -- 직렬화한다. 학부모 축이 아니라 학생 축인 이유는 한 학부모가 여러 자녀를
  -- 동시에 신청시키는 정상 흐름까지 직렬화하지 않기 위해서다.
  perform pg_advisory_xact_lock(hashtextextended(p_student_profile_id::text, 101));

  if not public.fn_is_linked_pair(p_student_profile_id, p_parent_profile_id) then
    raise exception 'pair_not_linked' using errcode = 'WC042';
  end if;

  -- ⚠ 여기 있던 WC043(중복 열린 요청 차단) EXISTS 블록을 제거했다.
  --   파일 상단 "왜 되돌리나" 참고.

  -- 추가 이용권(addon_only) 및 수량 검증. 추가 이용권은 같은 program_key 의
  -- 살아있는 부여가 있는 학생만 주문할 수 있고 수량 1~10, 그 외 상품은 수량 1 만 허용한다.
  for v_addon in
    select p.addon_only, p.program_key,
           coalesce((it ->> 'quantity')::integer, 1) as quantity
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as it
      join public.products p on p.id = (it ->> 'product_id')::uuid
  loop
    if v_addon.addon_only and not exists (
      select 1 from public.program_access_grants g
       where g.profile_id  = p_student_profile_id
         and g.program_key = v_addon.program_key
         and g.revoked_at is null
         and (g.expires_at is null or g.expires_at > now())
    ) then
      raise exception 'addon_requires_live_grant' using errcode = 'WC067';
    end if;

    if (v_addon.addon_only and (v_addon.quantity < 1 or v_addon.quantity > 10))
       or (not v_addon.addon_only and v_addon.quantity <> 1) then
      raise exception 'invalid_quantity' using errcode = 'WC068';
    end if;
  end loop;

  -- 신규(2026-09-01) — org 한정 상품 서버 검증. p_items 는 클라이언트가
  -- 넘긴다(이 함수는 auth.uid() 를 참조하지 않는다 — 신뢰 경계는 호출부
  -- api/request-enrollment.js) 그래도 tenant_id/sale_ends_at/구매 이력은
  -- 여기서 products 를 직접 조회해 재검증한다.
  for v_prod in
    select p.id as product_id, p.tenant_id, p.sale_ends_at
      from public.products p
     where p.id in (
       select (it ->> 'product_id')::uuid
         from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as it
     )
       and (p.tenant_id is not null or p.sale_ends_at is not null)
  loop
    if v_prod.tenant_id is not null
       and not public.fn_tenant_matches(
             v_prod.tenant_id, p_student_profile_id, p_parent_profile_id) then
      raise exception 'product_org_mismatch' using errcode = 'WC064';
    end if;

    if v_prod.sale_ends_at is not null and now() >= v_prod.sale_ends_at then
      raise exception 'product_sale_ended' using errcode = 'WC065';
    end if;

    if v_prod.tenant_id is not null and exists (
      select 1
        from public.orders o
        join public.order_items oi on oi.order_id = o.id
       where o.student_profile_id = p_student_profile_id
         and o.status in ('paid', 'waiting_deposit')
         and oi.product_id = v_prod.product_id
    ) then
      raise exception 'product_purchase_limit' using errcode = 'WC066';
    end if;
  end loop;

  v_discount_amount := p_list_amount - p_subtotal;
  v_amount          := p_subtotal;

  if v_amount <= 0 then
    raise exception 'invalid_amount' using errcode = 'WC001';
  end if;

  insert into public.orders
    (id, user_id, student_profile_id, parent_profile_id, status, order_name,
     list_amount, discount_amount, amount, customer_email)
  values
    (p_order_id, p_parent_profile_id, p_student_profile_id, p_parent_profile_id,
     'pending', p_order_name, p_list_amount, v_discount_amount, v_amount, p_customer_email);

  insert into public.order_items
    (order_id, product_id, product_slug, service_key, name, list_price, price, quantity)
  select
    p_order_id,
    (it->>'product_id')::uuid,
    it->>'product_slug',
    it->>'service_key',
    it->>'name',
    coalesce((it->>'list_price')::integer, 0),
    coalesce((it->>'price')::integer, 0),
    coalesce((it->>'quantity')::integer, 1)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as it;

  return query
    select p_order_id, v_amount, v_discount_amount;
end;
$$;


ALTER FUNCTION "public"."fn_request_enrollment"("p_order_id" "text", "p_student_profile_id" "uuid", "p_parent_profile_id" "uuid", "p_customer_email" "text", "p_order_name" "text", "p_items" "jsonb", "p_list_amount" integer, "p_subtotal" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_request_enrollment"("p_order_id" "text", "p_student_profile_id" "uuid", "p_parent_profile_id" "uuid", "p_customer_email" "text", "p_order_name" "text", "p_items" "jsonb", "p_list_amount" integer, "p_subtotal" integer) IS '학생이 수강신청(주문)을 생성한다(sql/76, WC043 중복 열린 요청 차단 제거, 2026-09-01 org 한정 상품 서버 검증). 한 학생이 승인 대기 요청을 여러 건 가질 수 있다. 동시 이중 신청 방지는 학생 축 advisory lock(salt 101)이 계속 담당한다. p_items 의 product_id 가 org_code/sale_ends_at 을 가진 상품이면 소속 불일치(WC064), 판매 마감(WC065), 학생당 1회 구매 제한 초과(WC066)를 여기서 재검증한다(클라이언트가 넘긴 p_items 를 신뢰하지 않는다). 나머지 가드(쌍 필수 WC019, 동일인 금지 WC020, 링크 검증 WC042, 0원 이하 WC001)는 sql/71 원문과 동일하다. auth.uid() 는 참조하지 않는다, 신뢰 경계는 호출자(api/request-enrollment.js)다. 2026-09-22 org_code text 비교를 tenant_id 비교로 전환. 추가 이용권: addon_only 상품은 같은 program_key 의 살아있는 부여가 없으면 WC067, 수량은 addon_only 1~10 / 그 외 정확히 1 이며 위반하면 WC068.';



CREATE OR REPLACE FUNCTION "public"."fn_request_refund"("p_order_id" "text", "p_reason" "text", "p_refund_bank" "text" DEFAULT NULL::"text", "p_refund_account" "text" DEFAULT NULL::"text", "p_refund_holder" "text" DEFAULT NULL::"text", "p_order_item_ids" bigint[] DEFAULT NULL::bigint[]) RETURNS "public"."refund_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_order              public.orders;
  v_row                public.refund_requests;
  v_caller             uuid := auth.uid();
  v_status             text;
  v_resp_at            timestamptz;
  v_completed_amount   integer;
  v_quote              record;
  v_overlap            public.refund_requests;
  v_is_virtual_account boolean;
  v_normalized_account text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_order_id, 100));

  select * into v_order from public.orders where id = p_order_id;

  -- 쌍 당사자면 누구나 신청할 수 있다(sql/74 가 좁혔던 것을 되돌린다).
  if v_order.id is null
     or (v_caller is distinct from v_order.student_profile_id
         and v_caller is distinct from v_order.parent_profile_id) then
    raise exception 'order_not_found_or_not_owned' using errcode = 'WC005';
  end if;

  if v_order.status <> 'paid' then
    raise exception 'order_not_refundable' using errcode = 'WC006';
  end if;

  -- 산정 먼저 — 항목 검증(WC060)·전체 승격(§2-10)·금액이 여기서 정해진다.
  -- 이후의 겹침 판정은 산정이 확정한 scope 기준으로 한다(전체 승격된 부분
  -- 선택이 부분 신청으로 남으면 유니크 인덱스 축이 새는 구멍이 된다).
  select * into v_quote
    from public.fn_refund_quote(p_order_id, p_order_item_ids, false, now());

  -- (sql/88, WC057 → Ver10 확장) 학부모가 반려한 신청과 항목이 겹치면 환불
  -- 축 종결이다. 반려는 "이 대상은 환불하지 않는다"는 결정이므로 경로를
  -- 가리지 않는다. NULL(주문 전체)은 모든 항목과 겹친다.
  if exists (
    select 1 from public.refund_requests r
     where r.order_id = p_order_id
       and r.approval_status = 'rejected'
       and (r.order_item_ids is null
            or v_quote.scope = 'order'
            or r.order_item_ids && p_order_item_ids)
  ) then
    raise exception 'refund_request_parent_rejected' using errcode = 'WC057';
  end if;

  -- 열린 신청과의 겹침(WC007 유지 + WC061 신규). 같은 축(주문 전체끼리)은
  -- Ver9 그대로 WC007, 배열이 끼는 겹침은 WC061 — 유니크 인덱스가 못 잡는
  -- 축이라 이 advisory lock 아래 검사가 정본이다(§2-10).
  select r.* into v_overlap
    from public.refund_requests r
   where r.order_id = p_order_id
     and r.status in ('requested', 'processing')
     and r.approval_status <> 'rejected'
     and (r.order_item_ids is null
          or v_quote.scope = 'order'
          or r.order_item_ids && p_order_item_ids)
   limit 1;

  if v_overlap.id is not null then
    if v_overlap.order_item_ids is null and v_quote.scope = 'order' then
      raise exception 'duplicate_refund_request' using errcode = 'WC007';
    else
      raise exception 'refund_request_items_overlap'
        using errcode = 'WC061',
              detail  = format('order_id=%s open_request_id=%s — 열린 신청과 대상 항목이 겹친다',
                               p_order_id, v_overlap.id);
    end if;
  end if;

  v_completed_amount := public.fn_refund_completed_amount(p_order_id);
  if v_completed_amount >= v_order.amount then
    raise exception 'refund_amount_exceeds_paid'
      using errcode = 'WC037',
            detail  = format('order_id=%s completed_amount=%s orders.amount=%s',
                              p_order_id, v_completed_amount, v_order.amount);
  end if;

  -- 승인축 — 학생 신청은 학부모 확인 대기, 학부모(결제자) 신청은 즉시 승인
  -- (refund_requests_parent_auto_approve_check 가 요구하는 값이다).
  if v_caller = v_order.parent_profile_id then
    v_status  := 'approved';
    v_resp_at := now();
  else
    v_status  := 'requested';
    v_resp_at := null;
  end if;

  -- 계좌번호는 숫자만 남긴 뒤 판정·저장 양쪽에 쓴다(20260822000002 원문).
  v_normalized_account := regexp_replace(p_refund_account, '[^0-9]', '', 'g');

  -- WC058 — 학부모 본인 신청(즉시 approved)이 가상계좌 결제 건이면 환불계좌
  -- 3필드 필수(20260822000002 원문).
  if v_status = 'approved' then
    v_is_virtual_account := (v_order.raw -> 'virtualAccount') is not null
      and (v_order.raw -> 'virtualAccount') <> 'null'::jsonb;

    if v_is_virtual_account
       and (coalesce(btrim(p_refund_bank), '') = ''
            or coalesce(v_normalized_account, '') = ''
            or coalesce(btrim(p_refund_holder), '') = '') then
      raise exception 'refund_account_required_for_virtual_account'
        using errcode = 'WC058';
    end if;
  end if;

  insert into public.refund_requests (
    user_id, order_id, order_item_id, order_name, amount, reason,
    refund_bank, refund_account, refund_holder, status,
    student_profile_id, parent_profile_id, requested_by,
    approval_status, approval_responded_at,
    gross_amount, policy_code, needs_review, quote,
    order_item_ids, within_withdrawal, bundle_return_amount, terms_version
  ) values (
    v_caller, v_order.id, null, v_order.order_name, v_quote.refund_amount, p_reason,
    p_refund_bank, nullif(v_normalized_account, ''), p_refund_holder, 'requested',
    v_order.student_profile_id, v_order.parent_profile_id, v_caller,
    v_status, v_resp_at,
    v_quote.gross_amount, v_quote.policy_code, v_quote.needs_review, v_quote.lines,
    case when v_quote.scope = 'order' then null else p_order_item_ids end,
    v_quote.within_withdrawal, v_quote.bundle_return_amount, 'v10'
  )
  returning * into v_row;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."fn_request_refund"("p_order_id" "text", "p_reason" "text", "p_refund_bank" "text", "p_refund_account" "text", "p_refund_holder" "text", "p_order_item_ids" bigint[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_request_refund"("p_order_id" "text", "p_reason" "text", "p_refund_bank" "text", "p_refund_account" "text", "p_refund_holder" "text", "p_order_item_ids" bigint[]) IS '환불 신청 생성(20260901 Ver10 — p_order_item_ids 로 구성서비스 단위 부분해지, 제33조의2 ②). 금액은 fn_refund_quote v10 이 정하고, 선택이 살아있는 라인 전부를 덮으면 주문 전체 신청으로 승격된다(§2-10). 겹침 축: 반려 이력 겹침 WC057, 열린 신청 겹침 WC007(전체끼리)/WC061(배열 겹침, advisory lock 아래 검사). 승인축(학생 requested/학부모 즉시 approved)·WC005/WC006/WC037/WC058 은 20260822000002 원문 유지.';



CREATE OR REPLACE FUNCTION "public"."fn_resolve_tenant_code"("p_code" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_caller          uuid := auth.uid();
  v_code            text;
  v_recent_failures integer;
  v_id              uuid;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  -- 1시간 지난 기록은 판정 재료가 아니므로 이 기회에 지운다(무한 성장 방지).
  delete from public.tenant_code_attempts
   where user_id = v_caller
     and attempted_at <= now() - interval '1 hour';

  select count(*) into v_recent_failures
    from public.tenant_code_attempts
   where user_id = v_caller;

  if v_recent_failures >= 10 then
    raise exception 'tenant_code_attempts_exceeded' using errcode = 'WC068';
  end if;

  v_code := public.fn_normalize_tenant_code(p_code);

  select t.id into v_id
    from public.tenants t
   where t.code = v_code;

  if v_id is null then
    insert into public.tenant_code_attempts (user_id) values (v_caller);
    return null;
  end if;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."fn_resolve_tenant_code"("p_code" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_resolve_tenant_code"("p_code" "text") IS '20260922 — 소속 코드 → tenant id 조회. 최근 1시간 실패 10회 이상이면 조회 자체를 거부한다(WC068, tenant_code_attempts 집계 — 1시간 지난 행은 호출 때마다 정리). 정규화(fn_normalize_tenant_code) 후 못 찾으면 실패 기록을 남기고 NULL 을 돌려준다 — raise 하면 기록 insert 가 같이 롤백돼 리밋이 무력화되므로, 거부 에러(WC069)는 호출부 책임이다. tier 등 내부 컬럼은 반환하지 않는다 — id 만 돌려준다.';



CREATE OR REPLACE FUNCTION "public"."fn_respond_enrollment"("p_order_id" "text", "p_approve" boolean, "p_reject_reason" "text" DEFAULT NULL::"text", "p_coupon_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS TABLE("order_id" "text", "status" "text", "approval_status" "text", "amount" integer, "discount_amount" integer, "applied_coupon_ids" "uuid"[], "skipped_coupon_ids" "uuid"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_order              public.orders;
  v_now                timestamptz := now();
  v_coupon             record;
  v_coupon_discount    integer := 0;
  v_applied_ids        uuid[] := '{}';
  v_applied_discounts  integer[] := '{}';
  -- 그 쿠폰이 귀속될 소유자 — granted 는 학생 또는 학부모, auto 는 항상
  -- NULL. v_cand_*/v_applied_* 는 항상 같은 인덱스로 append 된다(sql/68
  -- 5-d절과 동일 정합 원칙, sql/69 1-f절에서 이관).
  v_applied_owners     uuid[] := '{}';
  v_skipped_ids        uuid[] := '{}';
  v_cand_ids           uuid[] := '{}';
  v_cand_discounts     integer[] := '{}';
  v_cand_stackable     boolean[] := '{}';
  v_cand_owners        uuid[] := '{}';
  v_owner              uuid;
  v_best_nonstack_idx  integer;
  v_i                  integer;
  v_subtotal           integer;
  v_new_discount_total integer;
  v_new_amount         integer;
  -- 신규(sql/86) — approved 건 반려 시 원복할 쿠폰 할인 합계. requested
  -- 건(쿠폰 확정 전)은 void 대상 coupon_redemptions 행이 0개라 이 값이
  -- 0으로 남아 자연히 no-op 이 된다 — 별도 분기 불필요.
  v_reject_void_amount integer := 0;
  -- 신규(2026-09-01) — 이 주문에 org 한정 상품(products.org_code not
  -- null)이 있으면 쿠폰 적용을 전부 배제한다. 조작된 p_coupon_ids 로
  -- 프론트(fn_usable_coupons 의 org_product_excluded)를 우회할 수 없게
  -- 여기서도 한 번 더 막는다.
  v_org_product_order  boolean := false;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'WC021';
  end if;

  if v_order.parent_profile_id is distinct from auth.uid() then
    raise exception 'not_order_parent' using errcode = 'WC022';
  end if;

  -- 신규(sql/86) — 승인 게이트와 반려 게이트를 분리한다. 승인은 지금까지
  -- 그대로 approval_status='requested' 인 건만 받는다(approved 건을 다시
  -- "승인"하는 건 의미가 없다). 반려는 requested 뿐 아니라 approved 인
  -- 건도 받는다 — 학부모가 수락은 했지만 아직 결제하지 않은(status=
  -- pending) 건을 나중에 마음을 바꿔 반려할 수 있어야 한다는 요구사항
  -- (EnrollmentRequestModal 3버튼[닫기/반려/결제] 개편). rejected/
  -- superseded(sql/85) 등 이미 종결된 건은 두 경로 모두 여전히 WC023.
  if p_approve then
    if v_order.approval_status <> 'requested' then
      raise exception 'enrollment_not_pending' using errcode = 'WC023';
    end if;
  else
    if v_order.approval_status not in ('requested', 'approved') then
      raise exception 'enrollment_not_pending' using errcode = 'WC023';
    end if;
  end if;

  -- WC040(sql/71 원문 그대로) — approval_status 게이트를 통과해도 이
  -- 함수를 거치지 않은 경로(웹훅 등)로 status 가 이미 종결됐으면 응답
  -- 대상이 아니다. 승인/반려 모두 여전히 status='pending' 인 요청에만
  -- 허용한다.
  if v_order.status <> 'pending' then
    raise exception 'order_not_pending' using errcode = 'WC040';
  end if;

  if p_approve then
    -- 요청 시점(fn_request_enrollment) 의 orders.amount 는 쿠폰 미적용
    -- subtotal 이다 — 여기서 그 값을 subtotal 정본으로 쓴다(sql/69 1-f절
    -- 근거 그대로).
    v_subtotal := v_order.amount;

    v_org_product_order := exists (
      select 1
        from public.order_items oi
        join public.products p on p.id = oi.product_id
       where oi.order_id = p_order_id
         and p.tenant_id is not null
    );

    if p_coupon_ids is not null and array_length(p_coupon_ids, 1) > 0 then
      -- 1) 쿠폰 판정 (DB 쓰기는 아직 없음). 판정 축은 "쌍 OR"다 — granted
      --    는 학생 소유·미소진 우선, 아니면 학부모, 둘 다 아니면 제외.
      --    auto 는 소유 판정 없음(sql/69 1-f절과 동일).
      for v_coupon in
        select c.id, c.slug, c.discount_amount, c.min_amount, c.valid_until, c.is_active,
               c.max_uses_per_user, c.max_redemptions, c.stackable, c.grant_type, c.tenant_id
        from public.coupons c
        where c.id = any (p_coupon_ids)
        order by c.slug
      loop
        if v_coupon.max_redemptions is not null then
          perform pg_advisory_xact_lock(hashtextextended(v_coupon.id::text, 1));
        end if;

        -- (coupon_id, 프로필) 쌍 락 — 순서는 역할이 아니라 프로필 id
        -- 문자열 비교로 고정한다(sql/69 1-f절과 동일).
        if v_coupon.grant_type = 'granted' then
          if v_order.student_profile_id::text < v_order.parent_profile_id::text then
            perform pg_advisory_xact_lock(
              hashtextextended(v_coupon.id::text, hashtextextended(v_order.student_profile_id::text, 2)));
            perform pg_advisory_xact_lock(
              hashtextextended(v_coupon.id::text, hashtextextended(v_order.parent_profile_id::text, 2)));
          else
            perform pg_advisory_xact_lock(
              hashtextextended(v_coupon.id::text, hashtextextended(v_order.parent_profile_id::text, 2)));
            perform pg_advisory_xact_lock(
              hashtextextended(v_coupon.id::text, hashtextextended(v_order.student_profile_id::text, 2)));
          end if;
        end if;

        -- ② 30분 소프트 홀드 lazy 정리(sql/69 1-d/1-f절과 동일 축 — 전역,
        -- voided_at 단일 판정, 자기 주문(p_order_id) 제외) + sql/71 —
        -- void 되는 redemption 만큼 그 pending 주문의 discount_amount/
        -- amount 를 원복한다. sql/69 는 coupon_redemptions 만 정리하고 그
        -- redemption 이 반영했던 금액을 주문에 되돌리지 않아, 그 주문의
        -- amount/discount_amount 가 "이미 void 된 쿠폰 할인"을 계속 반영한
        -- 채로 남아 있었다(orders_amount_balance_check 등식 자체는 깨지지
        -- 않지만 표시 금액이 사실과 어긋난다). 한 주문에 여러 redemption
        -- 이 걸리면 합산해서 한 번에 되돌린다. o.status='pending' 인
        -- 주문만 대상이다(자기 자신 p_order_id 제외는 그대로 유지) —
        -- 이미 종결(canceled/failed)된 주문은 sql/69 1-e절 트리거가 void
        -- 를 맡고, 그 트리거는 처음부터 금액을 건드리지 않는다(주문이
        -- 이미 종결이라 discount_amount 표시가 후속 흐름에 영향을 주지
        -- 않는다는 sql/69 의 기존 결정을 그대로 따른다).
        with voided as (
          update public.coupon_redemptions cr
             set voided_at   = v_now,
                 void_reason = 'pending_hold_expired'
            from public.orders o
           where cr.order_id = o.id
             and cr.coupon_id = v_coupon.id
             and cr.order_id <> p_order_id
             and cr.voided_at is null
             and o.status = 'pending'
             and cr.created_at < v_now - (public.fn_coupon_pending_hold_minutes() || ' minutes')::interval
          returning cr.order_id, cr.discount_amount
        ),
        refund_totals as (
          select v.order_id, sum(v.discount_amount)::integer as refund_amount
            from voided v
           group by v.order_id
        )
        update public.orders o
           set discount_amount = o.discount_amount - rt.refund_amount,
               amount           = o.amount + rt.refund_amount
          from refund_totals rt
         where o.id = rt.order_id;

        if not v_coupon.is_active then
          continue;
        end if;
        if v_coupon.valid_until is not null
           and v_coupon.valid_until < (v_now at time zone 'Asia/Seoul')::date then
          continue;
        end if;
        if v_subtotal < v_coupon.min_amount then
          continue;
        end if;
        -- 신규(20260831020402) — 단체 쿠폰. 학생·학부모 둘 다 소속이
        -- 다르거나 없으면 이 쿠폰은 후보에서 제외한다. 프론트가 이미
        -- fn_usable_coupons/fn_coupon_by_code 로 걸러 보여주지만, 여기서도
        -- 막아야 조작된 p_coupon_ids 로 org 제한을 우회할 수 없다.
        if not public.fn_tenant_matches(
             v_coupon.tenant_id, v_order.student_profile_id, v_order.parent_profile_id) then
          continue;
        end if;
        -- 신규(2026-09-01) — 이 주문에 org 한정 상품이 섞여 있으면 쿠폰
        -- 축 자체(coupons.tenant_id)와 무관하게 전부 제외한다(위 v_org_
        -- product_order, 주문 단위로 한 번만 계산해 재사용).
        if v_org_product_order then
          continue;
        end if;

        if v_coupon.grant_type = 'granted' then
          if public.fn_coupon_is_granted(v_coupon.id, v_order.student_profile_id)
             and not public.fn_coupon_is_redeemed(v_coupon.id, v_order.student_profile_id, v_now) then
            v_owner := v_order.student_profile_id;
          elsif public.fn_coupon_is_granted(v_coupon.id, v_order.parent_profile_id)
                and not public.fn_coupon_is_redeemed(v_coupon.id, v_order.parent_profile_id, v_now) then
            v_owner := v_order.parent_profile_id;
          else
            continue;
          end if;
        else
          v_owner := null;
        end if;

        if public.fn_coupon_global_redeemed(v_coupon.id, v_now) then
          continue;
        end if;

        v_cand_ids       := array_append(v_cand_ids, v_coupon.id);
        v_cand_discounts := array_append(v_cand_discounts, v_coupon.discount_amount);
        v_cand_stackable := array_append(v_cand_stackable, v_coupon.stackable);
        v_cand_owners    := array_append(v_cand_owners, v_owner);
      end loop;

      -- 2) stacking 정산 — sql/69 원문과 동일.
      v_best_nonstack_idx := null;
      for v_i in 1 .. coalesce(array_length(v_cand_ids, 1), 0) loop
        if not v_cand_stackable[v_i] then
          if v_best_nonstack_idx is null
             or v_cand_discounts[v_i] > v_cand_discounts[v_best_nonstack_idx] then
            v_best_nonstack_idx := v_i;
          end if;
        end if;
      end loop;

      -- 3) 최종 적용 목록 조립 — sql/69 원문과 동일.
      for v_i in 1 .. coalesce(array_length(v_cand_ids, 1), 0) loop
        if v_cand_stackable[v_i] or v_i = v_best_nonstack_idx then
          if v_coupon_discount + v_cand_discounts[v_i] >= v_subtotal then
            continue;
          end if;
          v_applied_ids       := array_append(v_applied_ids, v_cand_ids[v_i]);
          v_applied_discounts := array_append(v_applied_discounts, v_cand_discounts[v_i]);
          v_applied_owners     := array_append(v_applied_owners, v_cand_owners[v_i]);
          v_coupon_discount    := v_coupon_discount + v_cand_discounts[v_i];
        end if;
      end loop;

      v_coupon_discount := least(v_coupon_discount, v_subtotal);

      -- skipped_coupon_ids: 요청(p_coupon_ids)에는 있었지만 최종 적용
      -- 목록(v_applied_ids)에 들지 못한 id 전부. 판정 루프의 continue
      -- 지점(비활성/기간만료/최소금액 미달/미보유/이미소진/전역 소진/
      -- org 쿠폰 불일치/org 상품 포함 주문)과 stacking 단계의 continue
      -- (non-stackable 탈락·누적액 초과 충돌)를 각각 따로 추적하는 대신
      -- "요청 - 적용" 차집합으로 한 번에 구한다 — continue 사유가 늘어나도
      -- 이 계산은 그대로 맞고, 사유별 개별 append 를 빠뜨릴 위험이 없다
      -- (sql/71 원문 그대로).
      v_skipped_ids := coalesce(
        (select array_agg(x) from (
           select unnest(p_coupon_ids)
           except
           select unnest(v_applied_ids)
         ) as t(x)),
        '{}'::uuid[]
      );
    end if;

    -- 4) 확정 금액 — 요청 시점 discount_amount(상품 단위 할인)에 쿠폰
    --    할인을 "더한다"(교체 아님) — orders.discount_amount = 상품 할인 +
    --    쿠폰 할인의 합이라는 불변식(sql/55_coupon_policy.sql:182-193)을
    --    유지해야 orders_amount_balance_check 와 감사용 분해 쿼리가 계속
    --    맞는다(sql/69 1-f절과 동일).
    v_new_discount_total := v_order.discount_amount + v_coupon_discount;
    v_new_amount          := v_order.list_amount - v_new_discount_total;

    if v_new_amount <= 0 then
      raise exception 'invalid_amount' using errcode = 'WC001';
    end if;

    update public.orders
       set approval_status  = 'approved',
           responded_at     = now(),
           discount_amount  = v_new_discount_total,
           amount           = v_new_amount,
           coupon_id        = case when array_length(v_applied_ids, 1) > 0
                                then v_applied_ids[1] else null end
     where id = p_order_id
    returning * into v_order;

    -- 6-a) 소진 직전 재검증(WC031) — advisory lock 을 우회한 경로가 이
    --    트랜잭션과 동시에 같은 (coupon, owner) 를 소진했다는 뜻이다.
    if array_length(v_applied_ids, 1) > 0 then
      for v_i in 1 .. array_length(v_applied_ids, 1) loop
        if v_applied_owners[v_i] is not null
           and public.fn_coupon_is_redeemed(v_applied_ids[v_i], v_applied_owners[v_i], v_now) then
          raise exception 'coupon_per_user_cap_exceeded'
            using errcode = 'WC031',
                  detail  = format('coupon_id=%s owner_profile_id=%s — advisory lock 우회 의심(귀속 직전 재검증 실패)',
                                    v_applied_ids[v_i], v_applied_owners[v_i]);
        end if;
      end loop;

      -- 6-b) 쿠폰 귀속(사용 이력).
      insert into public.coupon_redemptions (coupon_id, user_id, order_id, discount_amount)
      select v_applied_ids[gs.i], v_applied_owners[gs.i], p_order_id, v_applied_discounts[gs.i]
      from generate_subscripts(v_applied_ids, 1) as gs(i);
    end if;
  else
    if coalesce(btrim(p_reject_reason), '') = '' then
      raise exception 'reject_reason_required' using errcode = 'WC025';
    end if;

    -- 신규(sql/86) — approved 건은 승인 시점(위 p_approve=true 절)에 이미
    -- coupon_redemptions 행이 확정돼 있고 그 할인이 discount_amount/
    -- amount 에 반영돼 있을 수 있다. 반려로 종결시키는 이 건은 결제가
    -- 일어나지 않으므로 그 쿠폰을 "쓴 적 없는 것"으로 되돌려야 한다 —
    -- 살아있는(voided_at is null) redemption 을 전부 void 하고, void 한
    -- discount_amount 합만큼 아래 UPDATE 에서 orders.discount_amount 를
    -- 줄이고 amount 를 늘려 원복한다(위 30분 lazy 정리 절과 동일한 원복
    -- 등식). requested 건은 쿠폰이 확정되기 전이라 이 CTE 가 0행을
    -- 갱신하므로 v_reject_void_amount 가 0으로 남아 자연히 no-op 이다.
    -- ⚠ 이 함수는 RETURNS TABLE 의 out-param 으로 discount_amount/amount 라는
    --   PL/pgSQL 변수를 갖는다 — 아래 SQL 에서 같은 이름을 무한정으로 쓰면
    --   42702(ambiguous column reference)가 난다. CTE 결과와 orders 갱신식
    --   양쪽 모두 반드시 별칭으로 한정한다(첫 적용에서 실제로 터진 버그).
    with voided as (
      update public.coupon_redemptions cr
         set voided_at   = v_now,
             void_reason = 'enrollment_rejected'
       where cr.order_id = p_order_id
         and cr.voided_at is null
      returning cr.discount_amount
    )
    select coalesce(sum(v.discount_amount), 0)
      into v_reject_void_amount
      from voided v;

    -- 제약 정합(코드로 검증 불가 — 근거만 남긴다):
    --  · orders_reject_reason_pairing_check(sql/68 114-116행, (approval_
    --    status='rejected')=(reject_reason is not null)): 아래 UPDATE 가
    --    둘을 항상 함께 세팅 — 좌변/우변 모두 true.
    --  · orders_responded_at_pairing_check(sql/68 118-120행, (approval_
    --    status='requested')=(responded_at is null)): 결과 approval_
    --    status='rejected' 이므로 좌변 false, responded_at=now() 로
    --    우변도 false.
    --  · orders_approval_before_payment_check(sql/69 3절 수정본,
    --    approval_status='approved' or status in (pending,canceled,
    --    failed)): 결과 approval_status='rejected'(approved 아님)이므로
    --    좌변 false, status='canceled' 는 허용 목록 안 — 원래
    --    approval_status 가 requested 였든 approved 였든 이 UPDATE 직전
    --    status 는 위 WC040 게이트로 이미 'pending' 이 보장돼 있어 문제
    --    없다.
    --  · orders_discount_amount_check(sql/58, discount_amount>=0):
    --    v_reject_void_amount 는 쿠폰 할인분 합계일 뿐이고 discount_
    --    amount = 상품 할인 + 쿠폰 할인의 합(sql/55 182-193행 불변식,
    --    sql/71 268-272행 주석과 동일 근거)이라 쿠폰 할인분은 항상
    --    discount_amount 이하다 — 뺀 결과가 음수가 될 수 없다.
    --  · orders_amount_balance_check(sql/58, amount=list_amount-
    --    discount_amount): discount_amount 를 v_reject_void_amount 만큼
    --    줄이고 amount 를 그만큼 늘리는 대칭 갱신이라 list_amount 가
    --    불변인 한 등식이 그대로 유지된다(위 30분 lazy 정리 절, sql/71
    --    152-190행과 동일한 원복 등식).
    update public.orders o
       set approval_status  = 'rejected',
           responded_at     = now(),
           reject_reason    = p_reject_reason,
           status           = 'canceled',
           discount_amount  = o.discount_amount - v_reject_void_amount,
           amount           = o.amount + v_reject_void_amount,
           coupon_id        = null
     where o.id = p_order_id
    returning * into v_order;
  end if;

  return query
    select v_order.id, v_order.status, v_order.approval_status,
           v_order.amount, v_order.discount_amount,
           v_applied_ids, v_skipped_ids;
end;
$$;


ALTER FUNCTION "public"."fn_respond_enrollment"("p_order_id" "text", "p_approve" boolean, "p_reject_reason" "text", "p_coupon_ids" "uuid"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_respond_enrollment"("p_order_id" "text", "p_approve" boolean, "p_reject_reason" "text", "p_coupon_ids" "uuid"[]) IS '학부모가 학생의 수강신청(주문)을 수락/반려한다(sql/71 재작성 — RETURNS 를 orders 레코드에서 TABLE(단일 행: order_id/status/approval_status/amount/discount_amount/applied_coupon_ids/skipped_coupon_ids)로 변경, 2026-08-12). 응답 게이트는 WC021(주문 없음)·WC022(학부모 아님)에 신규 WC040(orders.status<>pending — 이 함수를 거치지 않은 경로로 이미 종결된 요청 재응답 차단)을 더했다. 승인(p_approve=true)은 approval_status=requested 인 건만 받는다(WC023). 반려(p_approve=false)는 requested 뿐 아니라 approved 인 건도 받는다(sql/86, WC023 재사용 — rejected/superseded 등 이미 종결된 건은 여전히 거부) — 학부모가 수락 후 아직 결제 전(status=pending)에 마음을 바꿔 반려할 수 있게 한다. 승인 시 쿠폰을 여기서 직접 확정한다(쌍 OR 자격·advisory lock·stacking·재검증 WC031, sql/69 1-f절과 동일). 단체 쿠폰(coupons.org_code)은 학생·학부모 둘 다 소속 코드가 불일치하면 후보에서 제외한다(20260831020402, 조작된 p_coupon_ids 우회 차단). 이 주문에 org 한정 상품(products.org_code not null)이 섞여 있으면 쿠폰 축과 무관하게 전부 제외한다(2026-09-01, 주문 단위로 한 번만 계산). p_coupon_ids 중 최종 미적용 id 는 skipped_coupon_ids 로 보고한다(차집합 계산, 사유 미분류). 30분 lazy 정리로 다른 pending 주문의 coupon_redemptions 가 void 될 때 그 주문의 discount_amount/amount 도 함께 원복한다(sql/71). 반려 시 사유 필수(WC025)이며 orders.status 를 canceled 로 내린다. approved 건 반려 시 그 주문의 살아있는 coupon_redemptions 를 전부 void(void_reason=enrollment_rejected)하고 void 한 할인 합만큼 discount_amount/amount 를 원복하며 coupon_id 를 NULL 로 되돌린다(sql/86, requested 건은 void 대상 0행이라 자연히 no-op). 2026-09-22 org_code text 비교를 tenant_id 비교로 전환.';



CREATE OR REPLACE FUNCTION "public"."fn_respond_refund"("p_refund_request_id" bigint, "p_approve" boolean, "p_reject_reason" "text" DEFAULT NULL::"text", "p_refund_bank" "text" DEFAULT NULL::"text", "p_refund_account" "text" DEFAULT NULL::"text", "p_refund_holder" "text" DEFAULT NULL::"text") RETURNS "public"."refund_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_row                public.refund_requests;
  v_order              public.orders;
  v_is_virtual_account boolean;
  v_normalized_account "text";
begin
  select * into v_row from public.refund_requests where id = p_refund_request_id for update;
  if not found then
    raise exception 'refund_request_not_found' using errcode = 'WC026';
  end if;

  if v_row.parent_profile_id is distinct from auth.uid() then
    raise exception 'not_refund_parent' using errcode = 'WC027';
  end if;

  if v_row.approval_status <> 'requested' then
    raise exception 'refund_not_pending' using errcode = 'WC028';
  end if;

  if p_approve then
    -- 신규(WC058) — 가상계좌 결제 건은 환불계좌 없이는 실제로 돈을 돌려줄
    -- 수단이 없다(토스 결제취소 API가 가상계좌 취소에 refundReceiveAccount를
    -- 요구한다, api/complete-refund.ts). 화면(RefundApprovalModal)이 이미
    -- 필수 입력으로 막지만, 화면과 DB가 다른 답을 하면 안 된다는 이 저장소의
    -- 원칙(fn_refund_quote 주석 참고)에 따라 서버도 같은 판정을 반복한다.
    --
    -- 계좌번호는 숫자만 남긴 뒤 빈 값인지 판정한다(fn_request_refund와 동일
    -- 판정, 20260822000002) — 하이픈만 입력해도 btrim 만으로는 "값이 있다"로
    -- 오판된다. 저장도 이 정규화된 값으로 한다 — 판정에 쓴 값과 실제로
    -- 저장되는 값이 다르면(예: 판정은 숫자만 보고 통과시켰는데 하이픈 섞인
    -- 원본을 그대로 저장) api/complete-refund.ts가 나중에 다시 걸러야 하는
    -- 불일치가 생긴다.
    select * into v_order from public.orders where id = v_row.order_id;
    v_is_virtual_account := (v_order.raw -> 'virtualAccount') is not null
      and (v_order.raw -> 'virtualAccount') <> 'null'::jsonb;
    v_normalized_account := regexp_replace(p_refund_account, '[^0-9]', '', 'g');

    if v_is_virtual_account
       and (coalesce(btrim(p_refund_bank), '') = ''
            or coalesce(v_normalized_account, '') = ''
            or coalesce(btrim(p_refund_holder), '') = '') then
      raise exception 'refund_account_required_for_virtual_account'
        using errcode = 'WC058';
    end if;

    update public.refund_requests
       set approval_status        = 'approved',
           approval_responded_at  = now(),
           refund_bank            = coalesce(p_refund_bank, refund_bank),
           refund_account         = coalesce(nullif(v_normalized_account, ''), refund_account),
           refund_holder          = coalesce(p_refund_holder, refund_holder)
     where id = p_refund_request_id
    returning * into v_row;
  else
    if coalesce(btrim(p_reject_reason), '') = '' then
      raise exception 'reject_reason_required' using errcode = 'WC029';
    end if;

    update public.refund_requests
       set approval_status         = 'rejected',
           approval_responded_at   = now(),
           approval_reject_reason  = p_reject_reason
       -- status(어드민 처리축)는 건드리지 않는다 — refund_requests_approval_
       -- before_processing_check 상 이미 'requested' 로 고정돼 있고, 학생은
       -- 3)절 부분 유니크 인덱스 대상에서 이 행이 빠지는 즉시(approval_status
       -- <> 'requested' 가 되는 순간) 같은 주문으로 재신청할 수 있다.
     where id = p_refund_request_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."fn_respond_refund"("p_refund_request_id" bigint, "p_approve" boolean, "p_reject_reason" "text", "p_refund_bank" "text", "p_refund_account" "text", "p_refund_holder" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_respond_refund"("p_refund_request_id" bigint, "p_approve" boolean, "p_reject_reason" "text", "p_refund_bank" "text", "p_refund_account" "text", "p_refund_holder" "text") IS '학부모가 학생이 신청한 환불(approval_status=requested)에 응답한다(sql/68 신규, 2026-08-22 환불계좌 3필드 추가). 호출자는 그 신청의 parent_profile_id 여야 한다(WC027). 반려 시 사유 필수(WC029). 승인 시 그 주문이 가상계좌 결제면 환불계좌 3필드가 함께 필수다(WC058) — fn_request_refund(학부모 직접 신청)와 달리 이 경로는 학생이 낸 신청에 학부모가 승인 시점에 계좌를 보탠다. status(어드민 처리축)는 건드리지 않는다.';



CREATE OR REPLACE FUNCTION "public"."fn_revalidate_order_coupons"("p_order_id" "text") RETURNS TABLE("coupon_id" "uuid", "ok" boolean, "reason" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_now timestamptz := now();
begin
  return query
  select
    cr.coupon_id,
    (chk.is_granted and not chk.is_redeemed and not chk.is_sold_out
     and chk.is_org_ok and not chk.is_org_product_excluded) as ok,
    case
      when not chk.is_granted then 'not_granted'
      when chk.is_redeemed then 'already_used'
      when chk.is_sold_out then 'sold_out'
      when not chk.is_org_ok then 'org_mismatch'
      when chk.is_org_product_excluded then 'org_product_excluded'
      else null
    end as reason
  from public.coupon_redemptions cr
  join public.orders o on o.id = cr.order_id
  join public.coupons c on c.id = cr.coupon_id
  cross join lateral (
    select
      (cr.user_id is null or public.fn_coupon_is_granted(cr.coupon_id, cr.user_id)) as is_granted,
      (cr.user_id is not null
        and public.fn_coupon_is_redeemed(cr.coupon_id, cr.user_id, v_now, p_order_id)) as is_redeemed,
      public.fn_coupon_global_redeemed(cr.coupon_id, v_now, p_order_id) as is_sold_out,
      public.fn_tenant_matches(c.tenant_id, o.student_profile_id, o.parent_profile_id) as is_org_ok,
      exists (
        select 1
          from public.order_items oi
          join public.products p on p.id = oi.product_id
         where oi.order_id = o.id
           and p.tenant_id is not null
      ) as is_org_product_excluded
  ) as chk
  where cr.order_id = p_order_id
    and cr.voided_at is null;
end;
$$;


ALTER FUNCTION "public"."fn_revalidate_order_coupons"("p_order_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_revalidate_order_coupons"("p_order_id" "text") IS 'service_role 전용. 결제 승인 직전 호출 — coupon_redemptions 행마다 그 행의 귀속 소유자(cr.user_id)를 축으로 재판정한다(sql/68 5-i절 재작성, orders.user_id 단일 축 폐기). cr.user_id NULL(auto)은 소유 판정 없이 항상 발급·미소진 취급. 판정 축 5개: 발급(not_granted)/1인 사용 횟수(already_used)/전체 발행량(sold_out)/단체 소속 일치(org_mismatch, 20260831020402 — coupons.org_code 축, orders 의 student_profile_id/parent_profile_id 로 판정)/주문에 org 한정 상품 포함(org_product_excluded, 2026-09-01 — products.org_code 축, coupons.org_code 와 독립). 행이 없으면 이 주문에 쿠폰이 없다는 뜻(통과). ok=false 행이 있으면 승인을 진행하지 않아야 한다. 2026-09-22 org_code text 비교를 tenant_id 비교로 전환.';



CREATE OR REPLACE FUNCTION "public"."fn_revoke_coupon_grant"("p_grant_id" bigint, "p_reason" "text" DEFAULT NULL::"text") RETURNS "public"."coupon_grants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_row public.coupon_grants;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.coupon_grants
     set revoked_at    = now(),
         revoke_reason = p_reason
   where id = p_grant_id
     and revoked_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'grant_not_found_or_already_revoked' using errcode = 'WC003';
  end if;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."fn_revoke_coupon_grant"("p_grant_id" bigint, "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_revoke_coupon_grant"("p_grant_id" bigint, "p_reason" "text") IS '관리자 전용. 발급 1건을 회수한다(revoked_at UPDATE) — 절대 DELETE 하지 않는다. 없거나 이미 회수됐으면 errcode=WC003. 관리자가 아니면 42501. 되돌리려면 되살리는 게 아니라 다시 발급한다(새 행).';



CREATE OR REPLACE FUNCTION "public"."fn_revoke_program_access_for_order"("p_order_id" "text", "p_user_id" "uuid", "p_payment_status" "text" DEFAULT 'refunded'::"text", "p_reason" "text" DEFAULT 'order_revoked'::"text", "p_order_item_ids" bigint[] DEFAULT NULL::bigint[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_order   public.orders;
  v_status  text;
  v_reason  text;
  v_keys    text[] := '{}';
  v_key     text;
  v_closed  int    := 0;
  v_sync    jsonb  := '[]'::jsonb;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'WC010';
  end if;

  -- 결제자(학부모) 확인. 부여 함수(5-e)와 동일 근거의 가드.
  if v_order.parent_profile_id is distinct from p_user_id then
    raise exception 'order_user_mismatch' using errcode = 'WC011';
  end if;

  -- student_profile_id 는 NOT NULL 이 보장돼 도달 불가에 가깝다(원문 유지).
  if v_order.student_profile_id is null then
    return jsonb_build_object(
      'ok', true, 'revoked', '[]'::jsonb, 'recalculated', '[]'::jsonb,
      'skipped', jsonb_build_array(jsonb_build_object('reason', 'order_has_no_user')),
      'ledger_closed', 0, 'synced', '[]'::jsonb);
  end if;

  -- 5-e절과 같은 락 순서(주문 행 → advisory, 대상은 student_profile_id).
  perform pg_advisory_xact_lock(hashtextextended(v_order.student_profile_id::text, 101));

  v_status := case when p_payment_status in ('refunded', 'cancelled')
                   then p_payment_status else 'refunded' end;
  v_reason := coalesce(nullif(btrim(p_reason), ''), 'order_revoked');

  -- 부분해지(20260901 Ver10) — p_order_item_ids 가 있으면 그 라인만 닫는다.
  -- 잔여 구성서비스는 존속한다(제33조의2 ⑧).
  with closed as (
    update public.program_access_grants g
       set revoked_at    = now(),
           revoke_reason = v_reason,
           updated_at    = now()
     where g.order_id = p_order_id
       and g.revoked_at is null
       and (p_order_item_ids is null or g.order_item_id = any(p_order_item_ids))
    returning g.program_key
  )
  select coalesce(array_agg(distinct program_key), '{}'), count(*)
    into v_keys, v_closed
    from closed;

  if array_length(v_keys, 1) is null then
    select coalesce(array_agg(distinct g.program_key), '{}')
      into v_keys
      from public.program_access_grants g
     where g.order_id = p_order_id
       and (p_order_item_ids is null or g.order_item_id = any(p_order_item_ids));
  end if;

  -- 캐시 재계산 — fn_sync_program_access_cache 는 살아있는 부여에서 다시
  -- 계산하므로, 같은 program_key 의 다른 부여가 남아 있으면 활성이 유지되고
  -- 전부 닫혔을 때만 v_status 로 종결된다(부분해지에 그대로 안전).
  foreach v_key in array v_keys loop
    v_sync := v_sync || public.fn_sync_program_access_cache(v_order.student_profile_id, v_key, v_status);
  end loop;

  return jsonb_build_object(
    'ok',            true,
    'revoked',       to_jsonb(v_keys),
    'recalculated',  to_jsonb(v_keys),
    'skipped',       '[]'::jsonb,
    'ledger_closed', v_closed,
    'synced',        v_sync
  );
end;
$$;


ALTER FUNCTION "public"."fn_revoke_program_access_for_order"("p_order_id" "text", "p_user_id" "uuid", "p_payment_status" "text", "p_reason" "text", "p_order_item_ids" bigint[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_revoke_program_access_for_order"("p_order_id" "text", "p_user_id" "uuid", "p_payment_status" "text", "p_reason" "text", "p_order_item_ids" bigint[]) IS '주문의 이용 권한을 회수한다(M6 재작성 + 20260901 Ver10 부분 회수). p_order_item_ids 가 있으면 그 구성서비스 라인만 닫는다(제33조의2 ② 부분해지 — 잔여 라인 존속 ⑧). 회수 대상은 orders.student_profile_id(학생), p_user_id 는 WC011 가드 전용. 원장 행은 DELETE 하지 않고 revoked_at/revoke_reason 으로 닫는다. 캐시는 fn_sync_program_access_cache 가 살아있는 부여에서 재계산한다.';



CREATE OR REPLACE FUNCTION "public"."fn_selfeval_claim_step"("p_session_id" "uuid", "p_profile_id" "uuid", "p_step" "text", "p_stale_seconds" integer DEFAULT 120) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."fn_selfeval_claim_step"("p_session_id" "uuid", "p_profile_id" "uuid", "p_step" "text", "p_stale_seconds" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_selfeval_claim_step"("p_session_id" "uuid", "p_profile_id" "uuid", "p_step" "text", "p_stale_seconds" integer) IS '자기평가서 단계 선점. 프로필 advisory 잠금(101) 뒤 세션 행을 for update 로 읽어 단계를 running 으로 표시한다. 반환 kind 어휘: claimed(attempts)/locked/order(currentStep)/running/exhausted(attempts). 순서 가드는 current_step 기준으로 analyze 2 이상, write 3 이상, verify 4 이상이다(명세 No.65). 이미 ok 인 단계도 다시 선점할 수 있다(재분석, 재생성, 재검증). 시도 상한은 단계당 10(No.89). startedAt 이 p_stale_seconds 보다 오래된 running 은 서버리스 중단으로 보고 다시 선점한다. draft 세션은 in_progress 로 올린다. p_step 이 analyze, write, verify 밖이면 예외(selfeval_step_unknown).';



CREATE OR REPLACE FUNCTION "public"."fn_selfeval_finalize"("p_session_id" "uuid", "p_profile_id" "uuid", "p_promoted" "jsonb", "p_sections" "jsonb", "p_char_count" "jsonb", "p_score" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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

  -- 구분값은 심화탐구와 같은 어휘(교과, 자율, 동아리, 진로)를 쓴다. subject 는 교과면 과목명, 창체면 활동명.
  v_group := case v_session.area
    when 'subject' then '교과'
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


ALTER FUNCTION "public"."fn_selfeval_finalize"("p_session_id" "uuid", "p_profile_id" "uuid", "p_promoted" "jsonb", "p_sections" "jsonb", "p_char_count" "jsonb", "p_score" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_selfeval_finalize"("p_session_id" "uuid", "p_profile_id" "uuid", "p_promoted" "jsonb", "p_sections" "jsonb", "p_char_count" "jsonb", "p_score" integer) IS '자기평가서 최종 저장(6단계). 한 트랜잭션에서 final 리포트 insert(revision max+1), activity_records 승격(source_program=self, source_ref_id=세션 id, status=final, 7항목은 p_promoted 의 topic, concept, method, result, limitation, numbers, sources), 세션 completed 와 current_step 6 기록을 한다. 승격은 (source_program, source_ref_id) 충돌 시 갱신해 재요청에도 중복되지 않는다. 반환 jsonb: {ok:false, reason:not_found}/{ok:false, reason:not_ready}(in_progress 아님 또는 current_step 5 미만)/{ok:true, reason:already_completed, activityRecordId, finalRevision}(멱등)/{ok:true, reason:completed, activityRecordId, finalRevision}.';



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


ALTER FUNCTION "public"."fn_selfeval_finish_step"("p_session_id" "uuid", "p_profile_id" "uuid", "p_step" "text", "p_ok" boolean, "p_patch" "jsonb", "p_issues" "jsonb", "p_extra_attempts" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_selfeval_finish_step"("p_session_id" "uuid", "p_profile_id" "uuid", "p_step" "text", "p_ok" boolean, "p_patch" "jsonb", "p_issues" "jsonb", "p_extra_attempts" integer) IS '자기평가서 단계 종료. 선점한 running 단계를 ok 또는 failed 로 닫는다. 반환 boolean: true 는 반영됨, false 는 행 없음, 세션이 draft/in_progress 아님, 단계가 running 아님(다른 요청이 끝냈거나 stale 선점이 덮어씀). p_ok 면 p_patch 허용 키만 반영하고 허용 밖 키는 무시한다. current_step(정수, greatest 로만 올림), regenerate_increment(true 면 regenerate_count 1 증가, 상한 3 은 호출자가 검사하고 CHECK 가 최종 방어), report({report_type, sections, char_count, score, mandatory_fixes}, selfeval_reports 에 같은 세션과 유형의 max(revision)+1 로 insert), analyses(배열 {activity_record_id, analysis, analysis_source}, selfeval_session_activities 갱신). 실패면 issues 를 p_issues 로 기록하고 그 밖은 건드리지 않는다. attempts 는 선점 때 이미 1 올라가 있고 p_extra_attempts 를 더 더한다.';



CREATE OR REPLACE FUNCTION "public"."fn_selfeval_terminate_session"("p_session_id" "uuid", "p_profile_id" "uuid", "p_step" "text", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."fn_selfeval_terminate_session"("p_session_id" "uuid", "p_profile_id" "uuid", "p_step" "text", "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_selfeval_terminate_session"("p_session_id" "uuid", "p_profile_id" "uuid", "p_step" "text", "p_reason" "text") IS '자기평가서 세션 종결. draft 또는 in_progress 세션을 archived 로 바꾸고 step_state.terminal 에 {reason, at, step} 을 병합한다(steps 는 보존). p_step 은 파기처럼 단계가 없는 종결을 위해 null 을 허용한다. 반환 jsonb: {ok:false, reason:not_found}(행 없음)/{ok:false, reason:not_open}(draft, in_progress 아님)/{ok:true, needsReverse, ledgerId}. needsReverse 는 ledger_id 가 있고 ledger_reversed_at 이 비어 있을 때 true 다. 프로필 advisory 잠금(101) 뒤 세션 행을 for update 로 잡는다.';



CREATE OR REPLACE FUNCTION "public"."fn_set_my_tenant"("p_code" "text") RETURNS TABLE("tenant_id" "uuid", "name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_caller   uuid := auth.uid();
  v_existing uuid;
  v_id       uuid;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  select p.tenant_id into v_existing from public.profiles p where p.id = v_caller;

  if v_existing is not null then
    raise exception 'tenant_already_set' using errcode = 'WC071';
  end if;

  -- 코드 정규화·레이트리밋(WC068)은 fn_resolve_tenant_code 가 담당한다.
  -- 못 찾으면 NULL — 여기서 raise 하면 그 함수가 남긴 실패 기록이 같이
  -- 롤백돼 리밋이 무력화되므로, 0행을 돌려주고 "없는 코드" 표기는 프론트
  -- 몫으로 둔다.
  v_id := public.fn_resolve_tenant_code(p_code);

  if v_id is null then
    return;
  end if;

  perform set_config('app.tenant_set_via_rpc', '1', true);

  update public.profiles
     set tenant_id  = v_id,
         updated_at = now()
   where id = v_caller;

  return query
    select t.id, t.name from public.tenants t where t.id = v_id;
end;
$$;


ALTER FUNCTION "public"."fn_set_my_tenant"("p_code" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_set_my_tenant"("p_code" "text") IS '20260922 — 로그인 회원이 스스로 소속 코드를 입력해 profiles.tenant_id 를 세팅한다. 이미 소속이 설정돼 있으면 WC071(재설정은 어드민 경로 — fn_admin_set_profile_tenant). 코드 판정은 fn_resolve_tenant_code 재사용(시도 초과 WC068). 없는 코드면 raise 하지 않고 0행을 돌려준다 — raise 하면 실패 기록이 롤백돼 리밋이 무력화되기 때문이며, "없는 코드" 안내는 프론트가 0행을 보고 한다. fn_profiles_lock_tenant 트리거를 통과시키려고 update 직전 app.tenant_set_via_rpc 를 켠다.';



CREATE OR REPLACE FUNCTION "public"."fn_student_parent"() RETURNS TABLE("link_id" "uuid", "parent_profile_id" "uuid", "link_status" "text", "linked_at" timestamp with time zone, "parent_name" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_student uuid := auth.uid();
begin
  if v_student is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  return query
  select
    l.id,
    l.parent_id,
    l.status,
    coalesce(l.responded_at, l.requested_at),
    p.name
  from public.parent_child_links l
  join public.profiles p on p.id = l.parent_id
  where l.student_id = v_student
    and l.status in ('pending', 'approved')
  -- approved 를 먼저 — 화면은 첫 행만 쓴다.
  order by (l.status = 'approved') desc, coalesce(l.responded_at, l.requested_at) desc;
end;
$$;


ALTER FUNCTION "public"."fn_student_parent"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_student_parent"() IS '학생이 연결된 학부모를 조회한다(sql/77). fn_parent_children(sql/73)의 반대 방향 — profiles_select_own 때문에 학생이 학부모 이름을 못 읽는 문제를 RLS 완화 대신 이 함수로 좁게 푼다. pending/approved 링크만, 이름만 돌려준다. 학생 "신청 상세 내역"(3967:3571)의 결제담당 표시가 유일한 호출부다.';



CREATE OR REPLACE FUNCTION "public"."fn_student_profiles_stamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."fn_student_profiles_stamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_sync_admin_member_role"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_profile_id uuid;
  v_active     boolean;
begin
  v_profile_id := coalesce(new.profile_id, old.profile_id);

  select exists (
    select 1 from public.admin_members m
     where m.profile_id = v_profile_id
       and m.status = 'active'
  ) into v_active;

  update public.profiles
     set role = case when v_active then 'admin' else 'user' end
   where id = v_profile_id
     and role is distinct from (case when v_active then 'admin' else 'user' end);

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."fn_sync_admin_member_role"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_sync_admin_member_role"() IS 'admin_members.status → profiles.role 동기화(20260822000014). 활성이면 admin, 아니면 user. 판정 축이 admin_members(신규)와 is_admin()(기존 RLS 수백 곳)으로 갈려 있어 어긋나면 "화면은 열리는데 표가 비거나" "정지시켰는데 REST 로는 읽히는" 상태가 된다. RLS 술어를 fn_admin_can 으로 옮기기 전까지의 다리다.';



CREATE OR REPLACE FUNCTION "public"."fn_sync_program_access_cache"("p_profile_id" "uuid", "p_program_key" "text", "p_empty_payment_status" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_live            int;
  v_unlimited_term  boolean;
  v_has_term        boolean;
  v_max_expires     timestamptz;
  v_unlimited_quota boolean;
  v_quota_total     int;
  v_paid_sum        int;
  v_min_start       timestamptz;
  v_expires_cache   timestamptz;
  v_mixed           boolean;
begin
  select count(*),
         bool_or(g.expires_at is null),
         bool_or(g.expires_at is not null),
         max(g.expires_at),
         bool_or(g.granted_sessions is null),
         coalesce(sum(g.granted_sessions), 0),
         coalesce(sum(g.paid_amount), 0),
         min(g.starts_at)
    into v_live, v_unlimited_term, v_has_term, v_max_expires,
         v_unlimited_quota, v_quota_total, v_paid_sum, v_min_start
    from public.program_access_grants g
   where g.profile_id  = p_profile_id
     and g.program_key = p_program_key
     and g.revoked_at is null;

  -- ── 살아있는 부여가 없다 ──────────────────────────────────────────
  if v_live = 0 then
    if p_empty_payment_status is null then
      return jsonb_build_object('program_key', p_program_key, 'action', 'noop', 'live_grants', 0);
    end if;

    update public.program_access pa
       set payment_status    = p_empty_payment_status,
           access_status     = 'inactive',
           access_expires_at = null,
           expires_at        = null,
           paid_amount       = 0,
           -- quota_total/quota_used/wc_mixed_term 을 더 이상 쓰지 않는다
           -- (정정 4) — 남아 있으면 지운다. 다른 키는 건드리지 않는다.
           meta              = (coalesce(pa.meta, '{}'::jsonb) - 'quota_total' - 'quota_used' - 'wc_mixed_term'),
           updated_at        = now()
     where pa.id = p_profile_id
       and pa.program_key = p_program_key;

    return jsonb_build_object('program_key', p_program_key, 'action', 'closed',
                              'live_grants', 0, 'payment_status', p_empty_payment_status);
  end if;

  -- ── 살아있는 부여가 있다 → 기간·금액을 재계산(회차는 meta 에 쓰지 않는다) ──
  v_expires_cache := case when v_unlimited_term then null else v_max_expires end;
  v_mixed         := v_unlimited_term and v_has_term;

  insert into public.program_access as pa (
    id, program_key, payment_status, access_status, paid_amount, paid_at,
    access_started_at, starts_at, access_expires_at, expires_at,
    profile_id, user_id, meta, updated_at
  ) values (
    p_profile_id, p_program_key, 'paid', 'active', v_paid_sum, v_min_start,
    v_min_start, v_min_start, v_expires_cache, v_expires_cache,
    p_profile_id, p_profile_id,
    '{}'::jsonb,
    now()
  )
  on conflict (id, program_key) do update set
    payment_status    = 'paid',
    access_status     = 'active',
    paid_amount       = excluded.paid_amount,
    paid_at           = excluded.paid_at,
    access_started_at = excluded.access_started_at,
    starts_at         = excluded.starts_at,
    access_expires_at = excluded.access_expires_at,
    expires_at        = excluded.expires_at,
    profile_id        = excluded.profile_id,
    user_id           = excluded.user_id,
    -- 다른 키는 보존하고 회차 관련 3개 키만 지운다(정정 4 — 물리적 삭제,
    -- 자기 정화). 이 함수가 그 키들을 다시는 쓰지 않으므로 한 번 지워지면
    -- 재부여·재환불을 거듭해도 되살아나지 않는다.
    meta = coalesce(pa.meta, '{}'::jsonb) - 'quota_total' - 'quota_used' - 'wc_mixed_term',
    updated_at = now();

  return jsonb_build_object(
    'program_key',        p_program_key,
    'action',             'synced',
    'live_grants',        v_live,
    'expires_at',         v_expires_cache,
    'unlimited_period',   coalesce(v_unlimited_term, false),
    'unlimited_sessions', coalesce(v_unlimited_quota, false),
    'quota_total',        case when v_unlimited_quota then null else v_quota_total end,
    'mixed_term',         coalesce(v_mixed, false),
    'paid_amount',        v_paid_sum
  );
end;
$$;


ALTER FUNCTION "public"."fn_sync_program_access_cache"("p_profile_id" "uuid", "p_program_key" "text", "p_empty_payment_status" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_sync_program_access_cache"("p_profile_id" "uuid", "p_program_key" "text", "p_empty_payment_status" "text") IS 'program_access(캐시)를 program_access_grants(원장)의 살아있는 행에서 재계산한다. sql/64 원문에서 meta 계산만 재작성했다(정정 4) — quota_total/quota_used/wc_mixed_term 을 더 이상 meta 에 쓰지 않고, 남아 있으면 지운다. 반환 jsonb 의 quota_total 등은 로그 전용이며 저장되지 않는다.';



CREATE OR REPLACE FUNCTION "public"."fn_tenant_matches"("p_tenant_id" "uuid", "p_student" "uuid", "p_parent" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select
    p_tenant_id is null
    or exists (
      select 1
      from public.profiles p
      where p.id in (p_student, p_parent)
        and p.tenant_id = p_tenant_id
    );
$$;


ALTER FUNCTION "public"."fn_tenant_matches"("p_tenant_id" "uuid", "p_student" "uuid", "p_parent" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_tenant_matches"("p_tenant_id" "uuid", "p_student" "uuid", "p_parent" "uuid") IS '단체 소속 판정(2026-09-22, fn_coupon_org_matches/fn_product_org_matches 와 동일 쌍 OR 본문을 tenant_id 축으로 재정의). p_tenant_id 가 NULL 이면 항상 true(소속 제한 없음). 아니면 학생(p_student) 또는 학부모(p_parent) 중 하나라도 profiles.tenant_id 가 그 값과 같으면 true. coupons.tenant_id/products.tenant_id 판정 양쪽에서 재사용한다.';



CREATE OR REPLACE FUNCTION "public"."fn_tenants_lock_code"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if new.code is distinct from old.code then
    raise exception using errcode = 'P0001',
      message = '소속 코드는 변경할 수 없습니다.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."fn_tenants_lock_code"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_tenants_lock_code"() IS '20260922 — tenants.code 변경 잠금 트리거 함수. fn_profiles_lock_identity_fields(20260825093331)와 달리 service_role·관리자 예외가 없다 — DB 밖으로 이미 유통된 값이라 어떤 경로로도 재발급 없이는 바꿀 수 없다.';



CREATE OR REPLACE FUNCTION "public"."fn_usable_coupons"("p_subtotal" integer DEFAULT 0, "p_student_profile_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("id" "uuid", "title" "text", "discount_amount" integer, "min_amount" integer, "valid_until" "date", "is_active" boolean, "eligible" boolean, "reason" "text", "owner_profile_id" "uuid", "owner_is_student" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_caller  uuid := auth.uid();
  v_student uuid;
  v_parent  uuid;
  v_today   date := (now() at time zone 'Asia/Seoul')::date;
begin
  if p_student_profile_id is null then
    v_student := v_caller;
  else
    if v_caller is distinct from p_student_profile_id
       and not public.fn_is_linked_pair(v_caller, p_student_profile_id) then
      raise exception 'not_authorized_for_student' using errcode = 'WC030';
    end if;
    v_student := p_student_profile_id;
  end if;

  select l.parent_id into v_parent
    from public.parent_child_links l
   where l.student_id = v_student and l.status = 'approved'
   limit 1;

  -- 쌍이 없으면(학부모 미연결, 또는 v_student 자체가 NULL 인 비로그인) 후보
  -- 없음 — 결제 자체가 불가능하므로 쿠폰도 없다.
  if v_student is null or v_parent is null then
    return;
  end if;

  return query
  select
    c.id,
    c.title,
    c.discount_amount,
    c.min_amount,
    eff.until_date as valid_until,
    c.is_active,
    (
      c.is_active
      and (eff.until_date is null or eff.until_date >= v_today)
      and coalesce(p_subtotal, 0) >= c.min_amount
      and (c.max_uses_per_user is null or v_student is not null)
      and not chk.is_sold_out
      and (c.grant_type <> 'granted' or own.owner_id is not null)
      and org.matches
    ) as eligible,
    case
      when not c.is_active then 'inactive'
      when eff.until_date is not null and eff.until_date < v_today then 'expired'
      when coalesce(p_subtotal, 0) < c.min_amount then 'below_min_amount'
      when not org.matches then 'org_mismatch'
      when c.max_uses_per_user is not null and v_student is null then 'login_required'
      when c.grant_type = 'granted' and not own.is_granted_overall then 'not_granted'
      when chk.is_sold_out then 'sold_out'
      when c.grant_type = 'granted' and own.owner_id is null then 'already_used'
      else null
    end as reason,
    own.owner_id as owner_profile_id,
    (own.owner_id is not null and own.owner_id = v_student) as owner_is_student
  from public.coupons c
  -- LATERAL 로 학생·학부모 판정을 행당 한 번씩만 계산한다(sql/55 3)절과
  -- 같은 원칙 — eligible/reason/owner 세 컬럼에서 재사용).
  cross join lateral (
    select
      public.fn_coupon_is_granted(c.id, v_student) as is_granted_student,
      public.fn_coupon_is_granted(c.id, v_parent)  as is_granted_parent,
      public.fn_coupon_is_redeemed(c.id, v_student, now()) as is_redeemed_student,
      public.fn_coupon_is_redeemed(c.id, v_parent, now())  as is_redeemed_parent,
      public.fn_coupon_global_redeemed(c.id, now()) as is_sold_out,
      public.fn_coupon_grant_valid_until(c.id, v_student) as grant_until_student,
      public.fn_coupon_grant_valid_until(c.id, v_parent)  as grant_until_parent
  ) as chk
  cross join lateral (
    select
      (chk.is_granted_student or chk.is_granted_parent) as is_granted_overall,
      -- 5-d절과 동일 규칙 — 학생 소유·미소진 우선, 아니면 학부모, 둘 다
      -- 아니면 NULL(granted 인데 소유자가 없거나 이미 다 소진). auto 는
      -- 항상 NULL.
      case
        when c.grant_type <> 'granted' then null
        when chk.is_granted_student and not chk.is_redeemed_student then v_student
        when chk.is_granted_parent and not chk.is_redeemed_parent then v_parent
        else null
      end as owner_id
  ) as own
  cross join lateral (
    select
      -- 쿠폰 기한과 발급분 기한 중 이른 날. greatest 로 쌍의 두 발급분 중
      -- 늦은 쪽을 고르는 이유는 "이 쌍이 이 쿠폰을 쓸 수 있는 마지막 날"이
      -- 표시 의미이기 때문이다(둘 중 하나만 살아 있어도 결제가 된다).
      least(
        c.valid_until,
        greatest(chk.grant_until_student, chk.grant_until_parent)
      ) as until_date
  ) as eff
  cross join lateral (
    select public.fn_coupon_org_matches(c.org_code, v_student, v_parent) as matches
  ) as org
  where c.is_active = true
  order by c.discount_amount desc, c.slug;
end;
$$;


ALTER FUNCTION "public"."fn_usable_coupons"("p_subtotal" integer, "p_student_profile_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_usable_coupons"("p_subtotal" integer, "p_student_profile_id" "uuid") IS '쿠폰 판정 정본(활성 쿠폰만, sql/68 5-h절 쌍 축 재작성). p_student_profile_id 가 NULL 이면 호출자를 학생으로 보고 approved 학부모를 도출한다 — 값이 있으면 호출자가 그 학생 본인/학부모인지 검증한다(WC030). 쌍(학생+학부모)이 없으면 빈 목록. eligible/reason 은 5-d절 fn_respond_enrollment 와 동일 규칙(granted=쌍 OR+학생 우선, auto=소유 판정 없음). 반환 valid_until 은 쿠폰 기한과 발급분 기한(coupon_grants.valid_until) 중 이른 날이다(20260825000010) — 발급일 기준 기한이 붙은 쿠폰이 "무기한"으로 표시되지 않게 한다. owner_profile_id/owner_is_student 로 "누구 보유분"인지 알려준다(auto 는 owner_profile_id NULL). 단체 쿠폰(coupons.org_code)은 학생 또는 학부모의 profiles.org_code 가 일치해야 하고, 불일치면 reason=''org_mismatch''(20260831020402). 한국어 라벨은 만들지 않는다 — 표기는 프론트 책임.';



CREATE OR REPLACE FUNCTION "public"."fn_usable_coupons"("p_subtotal" integer DEFAULT 0, "p_student_profile_id" "uuid" DEFAULT NULL::"uuid", "p_order_id" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "title" "text", "discount_amount" integer, "min_amount" integer, "valid_until" "date", "is_active" boolean, "eligible" boolean, "reason" "text", "owner_profile_id" "uuid", "owner_is_student" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_caller  uuid := auth.uid();
  v_student uuid;
  v_parent  uuid;
  v_today   date := (now() at time zone 'Asia/Seoul')::date;
  v_org_excluded boolean;
begin
  if p_student_profile_id is null then
    v_student := v_caller;
  else
    if v_caller is distinct from p_student_profile_id
       and not public.fn_is_linked_pair(v_caller, p_student_profile_id) then
      raise exception 'not_authorized_for_student' using errcode = 'WC030';
    end if;
    v_student := p_student_profile_id;
  end if;

  select l.parent_id into v_parent
    from public.parent_child_links l
   where l.student_id = v_student and l.status = 'approved'
   limit 1;

  -- 쌍이 없으면(학부모 미연결, 또는 v_student 자체가 NULL 인 비로그인) 후보
  -- 없음 — 결제 자체가 불가능하므로 쿠폰도 없다.
  if v_student is null or v_parent is null then
    return;
  end if;

  -- 신규(2026-09-01) — 주문에 org 한정 상품(busan-9900 등)이 있으면 이
  -- 주문 전체에서 쿠폰을 배제한다. p_order_id 가 NULL 이면(호출부가 아직
  -- 넘기지 않는 기존 경로) 이 축은 평가하지 않는다 — 하위호환.
  v_org_excluded := p_order_id is not null and exists (
    select 1
      from public.order_items oi
      join public.products p on p.id = oi.product_id
     where oi.order_id = p_order_id
       and p.tenant_id is not null
  );

  return query
  select
    c.id,
    c.title,
    c.discount_amount,
    c.min_amount,
    eff.until_date as valid_until,
    c.is_active,
    (
      not v_org_excluded
      and c.is_active
      and (eff.until_date is null or eff.until_date >= v_today)
      and coalesce(p_subtotal, 0) >= c.min_amount
      and (c.max_uses_per_user is null or v_student is not null)
      and not chk.is_sold_out
      and (c.grant_type <> 'granted' or own.owner_id is not null)
      and org.matches
    ) as eligible,
    case
      when v_org_excluded then 'org_product_excluded'
      when not c.is_active then 'inactive'
      when eff.until_date is not null and eff.until_date < v_today then 'expired'
      when coalesce(p_subtotal, 0) < c.min_amount then 'below_min_amount'
      when not org.matches then 'org_mismatch'
      when c.max_uses_per_user is not null and v_student is null then 'login_required'
      when c.grant_type = 'granted' and not own.is_granted_overall then 'not_granted'
      when chk.is_sold_out then 'sold_out'
      when c.grant_type = 'granted' and own.owner_id is null then 'already_used'
      else null
    end as reason,
    own.owner_id as owner_profile_id,
    (own.owner_id is not null and own.owner_id = v_student) as owner_is_student
  from public.coupons c
  -- LATERAL 로 학생·학부모 판정을 행당 한 번씩만 계산한다(sql/55 3)절과
  -- 같은 원칙 — eligible/reason/owner 세 컬럼에서 재사용).
  cross join lateral (
    select
      public.fn_coupon_is_granted(c.id, v_student) as is_granted_student,
      public.fn_coupon_is_granted(c.id, v_parent)  as is_granted_parent,
      public.fn_coupon_is_redeemed(c.id, v_student, now()) as is_redeemed_student,
      public.fn_coupon_is_redeemed(c.id, v_parent, now())  as is_redeemed_parent,
      public.fn_coupon_global_redeemed(c.id, now()) as is_sold_out,
      public.fn_coupon_grant_valid_until(c.id, v_student) as grant_until_student,
      public.fn_coupon_grant_valid_until(c.id, v_parent)  as grant_until_parent
  ) as chk
  cross join lateral (
    select
      (chk.is_granted_student or chk.is_granted_parent) as is_granted_overall,
      -- 5-d절과 동일 규칙 — 학생 소유·미소진 우선, 아니면 학부모, 둘 다
      -- 아니면 NULL(granted 인데 소유자가 없거나 이미 다 소진). auto 는
      -- 항상 NULL.
      case
        when c.grant_type <> 'granted' then null
        when chk.is_granted_student and not chk.is_redeemed_student then v_student
        when chk.is_granted_parent and not chk.is_redeemed_parent then v_parent
        else null
      end as owner_id
  ) as own
  cross join lateral (
    select
      -- 쿠폰 기한과 발급분 기한 중 이른 날. greatest 로 쌍의 두 발급분 중
      -- 늦은 쪽을 고르는 이유는 "이 쌍이 이 쿠폰을 쓸 수 있는 마지막 날"이
      -- 표시 의미이기 때문이다(둘 중 하나만 살아 있어도 결제가 된다).
      least(
        c.valid_until,
        greatest(chk.grant_until_student, chk.grant_until_parent)
      ) as until_date
  ) as eff
  cross join lateral (
    select public.fn_tenant_matches(c.tenant_id, v_student, v_parent) as matches
  ) as org
  where c.is_active = true
  order by c.discount_amount desc, c.slug;
end;
$$;


ALTER FUNCTION "public"."fn_usable_coupons"("p_subtotal" integer, "p_student_profile_id" "uuid", "p_order_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_usable_coupons"("p_subtotal" integer, "p_student_profile_id" "uuid", "p_order_id" "text") IS '쿠폰 판정 정본(활성 쿠폰만, sql/68 5-h절 쌍 축 재작성). p_student_profile_id 가 NULL 이면 호출자를 학생으로 보고 approved 학부모를 도출한다 — 값이 있으면 호출자가 그 학생 본인/학부모인지 검증한다(WC030). 쌍(학생+학부모)이 없으면 빈 목록. eligible/reason 은 5-d절 fn_respond_enrollment 와 동일 규칙(granted=쌍 OR+학생 우선, auto=소유 판정 없음). 반환 valid_until 은 쿠폰 기한과 발급분 기한(coupon_grants.valid_until) 중 이른 날이다(20260825000010) — 발급일 기준 기한이 붙은 쿠폰이 "무기한"으로 표시되지 않게 한다. owner_profile_id/owner_is_student 로 "누구 보유분"인지 알려준다(auto 는 owner_profile_id NULL). 단체 쿠폰(coupons.org_code)은 학생 또는 학부모의 profiles.org_code 가 일치해야 하고, 불일치면 reason=''org_mismatch''(20260831020402). p_order_id(신규, 2026-09-01, 기본 NULL·하위호환)를 넘기면 그 주문의 order_items 에 org 한정 상품(products.org_code not null)이 있는지 검사해, 있으면 전부 eligible=false·reason=''org_product_excluded''로 덮어쓴다(정가 특가 상품엔 쿠폰을 겹치지 않는다). 한국어 라벨은 만들지 않는다 — 표기는 프론트 책임. 2026-09-22 org_code text 비교를 tenant_id 비교로 전환.';



CREATE TABLE IF NOT EXISTS "public"."coupon_redemptions" (
    "id" bigint NOT NULL,
    "coupon_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "order_id" "text" NOT NULL,
    "discount_amount" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "voided_at" timestamp with time zone,
    "void_reason" "text",
    CONSTRAINT "coupon_redemptions_discount_amount_check" CHECK (("discount_amount" > 0))
);


ALTER TABLE "public"."coupon_redemptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."coupon_redemptions" IS '쿠폰 사용 이력. 소진 여부는 이 테이블 단독이 아니라 orders.status 와 조인해 판정 시점에 평가한다(fn_coupon_is_redeemed) — sql/55_coupon_policy.sql 상단 주석 참고. voided_at 이 NULL 이 아니면 판정에서 제외된다(관리자 명시적 취소, P1-4).';



COMMENT ON COLUMN "public"."coupon_redemptions"."user_id" IS '귀속 주체 — 둘 다 소유한 경우 소진된 쪽(granted 는 학생 우선, sql/68 5-d절). auto 쿠폰은 NULL(소유 판정 없음). fn_redeem_coupons 가 이 값을 채우는 유일한 경로(서버 전용)라 위조 불가. FK 는 RESTRICT(2026-08-12) — SET NULL 이면 "auto 라 소유자 없음"과 "소유자가 탈퇴해 소실"이 같은 NULL 로 겹친다.';



COMMENT ON COLUMN "public"."coupon_redemptions"."voided_at" IS '관리자가 이 쿠폰 사용을 명시적으로 무효화한 시각. NULL = 유효(정상 소진으로 집계됨). 절대 행을 DELETE 하지 않는다 — 이 컬럼으로 되돌린다(P1-4).';



COMMENT ON COLUMN "public"."coupon_redemptions"."void_reason" IS '무효화 사유(자유 텍스트, 관리자 기입). voided_at 이 NULL 이면 의미 없음.';



CREATE OR REPLACE FUNCTION "public"."fn_void_coupon_redemption"("p_redemption_id" bigint, "p_reason" "text" DEFAULT NULL::"text") RETURNS "public"."coupon_redemptions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_row public.coupon_redemptions;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.coupon_redemptions
     set voided_at   = now(),
         void_reason = p_reason
   where id = p_redemption_id
     and voided_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'redemption_not_found_or_already_voided' using errcode = 'WC002';
  end if;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."fn_void_coupon_redemption"("p_redemption_id" bigint, "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_void_coupon_redemption"("p_redemption_id" bigint, "p_reason" "text") IS '관리자 전용. 쿠폰 사용 이력 1건을 명시적으로 무효화(voided_at=now())한다 — 절대 DELETE 하지 않는다. 이미 무효화됐거나 존재하지 않으면 errcode=WC002. 관리자가 아니면 errcode=42501.';



CREATE OR REPLACE FUNCTION "public"."generate_link_code_string"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  c_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  c_len      constant int  := length(c_alphabet);              -- 31
  c_limit    constant int  := (256 / c_len) * c_len;           -- 248
  v_code text := '';
  v_byte int;
begin
  while length(v_code) < 6 loop
    v_byte := get_byte(extensions.gen_random_bytes(1), 0);
    if v_byte < c_limit then
      v_code := v_code || substr(c_alphabet, (v_byte % c_len) + 1, 1);
    end if;
  end loop;

  return v_code;
end;
$$;


ALTER FUNCTION "public"."generate_link_code_string"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (
    id,
    email,
    role,
    updated_at
  )
  values (
    new.id,
    coalesce(new.email, ''),
    'user',
    now()
  )
  on conflict (id) do update
  set
    email = coalesce(nullif(excluded.email, ''), public.profiles.email),
    role = coalesce(public.profiles.role, 'user'),
    updated_at = now();

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_board_view"("p_source" "text", "p_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_headers    json;
  v_ip         text;
  v_ua         text;
  v_today      date;
  v_viewer_key text;
  v_count      integer;
  v_visible    boolean;
begin
  -- (a) 화이트리스트. 이 검사를 통과하기 전에는 동적 SQL 을 한 글자도
  --     조립하지 않는다. 없으면 anon 이 임의 테이블을 UPDATE 할 수 있다.
  if p_source is null or p_source not in ('company_news', 'notices') then
    raise exception 'increment_board_view: unsupported source %', p_source
      using errcode = '22023';
  end if;

  if p_id is null then
    raise exception 'increment_board_view: p_id is required'
      using errcode = '22023';
  end if;

  -- (a-2) 대상 글의 존재 + 활성 확인. **반드시 board_views insert 보다 먼저다.**
  --   · 무한 증식 방어: 이 RPC 는 anon 에게 열려 있고 board_views 는 방문마다
  --     행이 늘어난다. 존재 확인을 insert 뒤로 미루면, 존재하지도 않는 uuid 를
  --     반복 호출하는 것만으로 대장이 무한히 부풀 수 있다(그때마다 viewer_key
  --     가 p_id 를 섞어 만들어지므로 PK 충돌조차 나지 않는다). rate limit 도
  --     자동 정리 잡도 없으니, "쓰기 전에 대상부터 확인" 이 유일한 방어선이다.
  --   · 비활성 글 영구 잠금 방어: 확인이 뒤에 있으면 비활성 글 조회 시
  --     board_views 행만 남고 UPDATE 는 coalesce(is_active, true) 조건에 걸려
  --     0행이 된다. 같은 날 관리자가 글을 활성화해도 그 방문자는 이미 대장에
  --     찍혀 있어 재집계되지 않는다. 확인을 앞으로 옮기면 비활성 구간의 호출은
  --     대장에 아무 흔적도 남기지 않으므로, 활성화 직후 정상 집계된다.
  --   · 동적 SQL 은 format('%I') 로 식별자만 넣고 uuid 는 using 바인딩이다
  --     (화이트리스트를 통과한 p_source 외에는 어떤 값도 문자열로 붙이지 않는다).
  --   · 여기서 통과한 뒤 UPDATE 사이에 글이 비활성화되는 경합은 조회수 +1 이
  --     0행이 되는 것뿐이라 무해하다 — 잠그지 않는다.
  execute format(
    'select exists(select 1 from public.%I where id = $1 and coalesce(is_active, true))',
    p_source
  )
     into v_visible
    using p_id;

  if not coalesce(v_visible, false) then
    return 0;
  end if;

  v_today := (now() at time zone 'Asia/Seoul')::date;

  -- PostgREST 가 넘겨주는 요청 헤더. HTTP 밖 호출이면 NULL 이다.
  v_headers := nullif(current_setting('request.headers', true), '')::json;

  v_ip := nullif(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '');
  v_ua := coalesce(v_headers ->> 'user-agent', '');

  -- 원본 IP 는 여기서 즉시 해시로 접히고, 어디에도 저장되지 않는다.
  -- IP 를 못 얻은 경로(SQL Editor 등)는 'unknown' 버킷으로 모인다 —
  -- 그런 호출은 사실상 관리자 수동 호출이므로 하루 1회로 묶여도 무해하다.
  v_viewer_key := md5(
    coalesce(v_ip, 'unknown') || '|' || v_ua || '|' ||
    v_today::text || '|' || p_source || '|' || p_id::text
  );

  insert into public.board_views (source, post_id, viewer_key, viewed_on)
  values (p_source, p_id, v_viewer_key, v_today)
  on conflict do nothing;

  -- on conflict do nothing 으로 아무 행도 안 들어갔으면 오늘 이미 집계된
  -- 방문이다. 증가 없이 현재 값만 돌려준다.
  if not found then
    execute format('select view_count from public.%I where id = $1', p_source)
       into v_count
      using p_id;
    return coalesce(v_count, 0);
  end if;

  execute format(
    'update public.%I set view_count = coalesce(view_count, 0) + 1 '
    ' where id = $1 and coalesce(is_active, true) '
    ' returning view_count',
    p_source
  )
     into v_count
    using p_id;

  return coalesce(v_count, 0);
end;
$_$;


ALTER FUNCTION "public"."increment_board_view"("p_source" "text", "p_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."increment_board_view"("p_source" "text", "p_id" "uuid") IS '게시판 조회수 +1 (IP+UA 해시 기준 1일 1회). p_source 는 company_news|notices 화이트리스트. 반환값은 반영 후 view_count.';



CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_email_available"("check_email" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  v_email text;
  v_exists_profiles boolean;
  v_exists_auth boolean;
begin
  v_email := lower(trim(coalesce(check_email, '')));

  if v_email = '' then
    return false;
  end if;

  select exists (
    select 1
    from public.profiles p
    where lower(trim(p.email)) = v_email
  ) into v_exists_profiles;

  select exists (
    select 1
    from auth.users u
    where lower(trim(u.email)) = v_email
  ) into v_exists_auth;

  return not (coalesce(v_exists_profiles, false) or coalesce(v_exists_auth, false));
end;
$$;


ALTER FUNCTION "public"."is_email_available"("check_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_username_available"("check_username" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select not exists (
    select 1
    from public.profiles p
    where lower(trim(p.username)) = lower(trim(check_username))
      and p.username is not null
      and trim(p.username) <> ''
  );
$$;


ALTER FUNCTION "public"."is_username_available"("check_username" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_winning_admin"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles
    where (
      profiles.id = auth.uid()
      or lower(profiles.email) = lower(auth.jwt() ->> 'email')
    )
    and profiles.role in ('admin', 'admin_basic', 'admin_manager', 'admin_master')
  );
$$;


ALTER FUNCTION "public"."is_winning_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_student_link_code"("p_student_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  c_max_attempt constant int := 10;
  v_code       text;
  v_attempt    int := 0;
  v_constraint text;
begin
  if p_student_id is null then
    raise exception 'student_id_required';
  end if;

  -- 이력 보존: 삭제가 아니라 비활성화. 학생당 활성 1건 인덱스를 위해 선행한다.
  update public.student_link_codes
  set is_active = false,
      deactivated_at = now()
  where student_id = p_student_id
    and is_active;

  loop
    v_attempt := v_attempt + 1;
    v_code := public.generate_link_code_string();

    begin
      insert into public.student_link_codes (student_id, code)
      values (p_student_id, v_code);

      return v_code;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;

      -- 같은 학생에 대해 발급이 동시에 들어온 경우(재발급 버튼 연타 등).
      -- 재시도해도 계속 막히므로 즉시 구분되는 예외로 던진다.
      if v_constraint = 'student_link_codes_active_student_key' then
        raise exception 'link_code_issue_conflict';
      end if;

      -- 그 외(코드 충돌)는 새 코드로 재시도.
      if v_attempt >= c_max_attempt then
        raise exception 'link_code_generation_failed';
      end if;
    end;
  end loop;
end;
$$;


ALTER FUNCTION "public"."issue_student_link_code"("p_student_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."keep_updated_at_on_view_count_only"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.view_count is distinct from old.view_count
     and (to_jsonb(new) - 'view_count' - 'updated_at')
       = (to_jsonb(old) - 'view_count' - 'updated_at')
  then
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."keep_updated_at_on_view_count_only"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."keep_updated_at_on_view_count_only"() IS 'view_count 만 변경된 UPDATE 에서 updated_at 을 원값으로 되돌리는 BEFORE UPDATE 가드. 기존 set_updated_at 계열 트리거보다 뒤(알파벳 순 zz_)에 실행되어야 한다.';



CREATE OR REPLACE FUNCTION "public"."match_student_performance_sessions"("query_embedding" "extensions"."vector", "filter_profile_id" "uuid", "match_count" integer DEFAULT 8, "match_threshold" double precision DEFAULT 0.48) RETURNS TABLE("session_id" "uuid", "grade_label" "text", "subject_group" "text", "subject" "text", "career_goal" "text", "topic_title" "text", "summary_text" "text", "created_at" timestamp with time zone, "similarity" double precision)
    LANGUAGE "plpgsql" STABLE
    AS $$
begin
  -- (ㄱ) 필터 누락 = 전체 스캔 사고. 조용히 0행이 아니라 터뜨린다.
  if filter_profile_id is null then
    raise exception 'match_student_performance_sessions: filter_profile_id는 null일 수 없다(소유자 격리 필수).'
      using errcode = '22004';
  end if;

  -- (ㄴ) 인증된 호출자는 자기 자신만 조회할 수 있다.
  --      service_role 서버 호출은 auth.uid()가 null이라 통과한다.
  if auth.uid() is not null and auth.uid() <> filter_profile_id then
    raise exception 'match_student_performance_sessions: 다른 사용자의 수행 기록은 조회할 수 없다.'
      using errcode = '42501';
  end if;

  return query
  select
    v.session_id,
    v.grade_label,
    v.subject_group,
    v.subject,
    v.career_goal,
    v.topic_title,
    v.summary_text,
    v.created_at,
    1 - (v.embedding <=> query_embedding) as similarity
  from public.performance_session_vectors v
  where v.profile_id = filter_profile_id          -- (ㄷ) 소유자 격리
    and v.rag_use = true
    and v.embedding is not null
    and 1 - (v.embedding <=> query_embedding) >= match_threshold
  order by v.embedding <=> query_embedding asc
  limit least(coalesce(match_count, 8), 20);
end;
$$;


ALTER FUNCTION "public"."match_student_performance_sessions"("query_embedding" "extensions"."vector", "filter_profile_id" "uuid", "match_count" integer, "match_threshold" double precision) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."match_student_performance_sessions"("query_embedding" "extensions"."vector", "filter_profile_id" "uuid", "match_count" integer, "match_threshold" double precision) IS '학생 과거 수행 리포트 유사도 검색(임베딩 단위 = 세션 1건). 외부 앱 match_student_reports_all_subjects의 재설계본 — text student_code 대신 uuid profile_id로 소유자를 격리한다. threshold 기본 0.48. SECURITY INVOKER + filter_profile_id NOT NULL + auth.uid() 일치 검사 3중 방어.';



CREATE OR REPLACE FUNCTION "public"."match_winning_suhaeng_all_subjects"("query_embedding" "extensions"."vector", "filter_knowledge_type" "text", "filter_grade" "text" DEFAULT NULL::"text", "match_count" integer DEFAULT 10, "match_threshold" double precision DEFAULT 0.52, "filter_subject" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "knowledge_type" "text", "grade" "text", "subject" "text", "career_field" "text", "title" "text", "content" "text", "source" "text", "source_link" "text", "memo" "text", "similarity" double precision)
    LANGUAGE "sql" STABLE
    AS $$
  select
    w.id,
    w.knowledge_type,
    w.grade,
    w.subject,
    w.career_field,
    w.title,
    w.content,
    w.source,
    w.source_link,
    w.memo,
    1 - (w.embedding <=> query_embedding) as similarity
  from public.winning_assessment_knowledge_items w
  where w.is_active = true
    and coalesce(w.rag_use, true) = true
    and w.embedding is not null
    and w.knowledge_type in ('topic_pattern', 'verified_resource')
    and w.knowledge_type = filter_knowledge_type
    and (
      filter_grade is null
      or w.grade = filter_grade
      or w.grade in ('공통', '전체', '확인 필요')
    )
    -- filter_subject: null 이면 과목 필터 없음(= 이 파일 이전의 동작 그대로).
    -- 값이 있으면 해당 과목 + 과목 무관 태그('공통'/'전체'/'확인 필요')를 통과시킨다.
    --
    -- 바로 위 filter_grade 절과 **같은 모양**이다. 명세서 §8
    -- (docs/수행평가-상세-명세.md:1862)이 "grade와 동일하게 '공통'/'전체'/
    -- '확인 필요' 허용"을 지시하고, 레거시 키워드 경로도 '공통'/'전체'를 후보에
    -- 넣는다(외부 앱 api/_lib/dynamic-knowledge.js:282-289 subjectCandidates).
    -- 정확 일치로 좁히면 subject 가 '공통'/'전체'로 태깅된 행이 벡터 경로에서
    -- **에러 없이** 통째로 빠져 리콜만 조용히 줄고 키워드 폴백으로 떨어진다
    -- (명세서 §8:1853이 지목하는 실패 양식과 동일). 그래서 폴백을 넣는다.
    and (
      filter_subject is null
      or w.subject = filter_subject
      or w.subject in ('공통', '전체', '확인 필요')
    )
    and 1 - (w.embedding <=> query_embedding) >= match_threshold
  order by w.embedding <=> query_embedding asc
  limit least(match_count, 20);
$$;


ALTER FUNCTION "public"."match_winning_suhaeng_all_subjects"("query_embedding" "extensions"."vector", "filter_knowledge_type" "text", "filter_grade" "text", "match_count" integer, "match_threshold" double precision, "filter_subject" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."match_winning_suhaeng_all_subjects"("query_embedding" "extensions"."vector", "filter_knowledge_type" "text", "filter_grade" "text", "match_count" integer, "match_threshold" double precision, "filter_subject" "text") IS '수행평가 RAG 전과목 벡터 검색. 53_performance.sql에서 source_link 반환 컬럼과 filter_subject 파라미터를 추가. SECURITY INVOKER이므로 service_role(RLS 우회) 또는 어드민 세션에서만 결과가 나온다.';



CREATE OR REPLACE FUNCTION "public"."match_winning_suhaeng_hybrid"("query_embedding" "extensions"."vector", "query_keywords" "text", "filter_knowledge_type" "text", "filter_grade" "text" DEFAULT NULL::"text", "match_count" integer DEFAULT 10, "match_threshold" double precision DEFAULT 0.52, "filter_subject" "text" DEFAULT NULL::"text", "full_text_weight" double precision DEFAULT 1, "semantic_weight" double precision DEFAULT 1, "rrf_k" integer DEFAULT 60) RETURNS TABLE("id" "uuid", "knowledge_type" "text", "grade" "text", "subject" "text", "career_field" "text", "title" "text", "content" "text", "source" "text", "source_link" "text", "memo" "text", "similarity" double precision, "semantic_rank" integer, "keyword_rank" integer, "keyword_score" double precision, "rrf_score" double precision)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
  with semantic as (
    select
      w.id,
      (row_number() over (order by w.embedding <=> query_embedding asc))::integer as rank_ix
    from public.winning_assessment_knowledge_items w
    where w.is_active = true
      and coalesce(w.rag_use, true) = true
      and w.embedding is not null
      and w.knowledge_type in ('topic_pattern', 'verified_resource')
      and w.knowledge_type = filter_knowledge_type
      and (
        filter_grade is null
        or w.grade = filter_grade
        or w.grade in ('공통', '전체', '확인 필요')
      )
      and (
        filter_subject is null
        or w.subject = filter_subject
        or w.subject in ('공통', '전체', '확인 필요')
      )
      and 1 - (w.embedding <=> query_embedding) >= match_threshold
    order by w.embedding <=> query_embedding asc
    limit least(match_count, 20) * 2
  ),
  keyword_hits as (
    select
      w.id,
      pgroonga_score(w.tableoid, w.ctid) as score
    from public.winning_assessment_knowledge_items w
    where coalesce(btrim(query_keywords), '') <> ''
      and w.search_text &@~ query_keywords
      and w.is_active = true
      and coalesce(w.rag_use, true) = true
      and w.embedding is not null
      and w.knowledge_type in ('topic_pattern', 'verified_resource')
      and w.knowledge_type = filter_knowledge_type
      and (
        filter_grade is null
        or w.grade = filter_grade
        or w.grade in ('공통', '전체', '확인 필요')
      )
      and (
        filter_subject is null
        or w.subject = filter_subject
        or w.subject in ('공통', '전체', '확인 필요')
      )
  ),
  keyword as (
    select
      k.id,
      k.score,
      (row_number() over (order by k.score desc, k.id))::integer as rank_ix
    from keyword_hits k
    order by k.score desc, k.id
    limit least(match_count, 20) * 2
  ),
  fused as (
    select
      coalesce(s.id, k.id) as id,
      s.rank_ix as semantic_rank,
      k.rank_ix as keyword_rank,
      k.score as keyword_score,
      coalesce(1.0 / (rrf_k + s.rank_ix), 0.0) * semantic_weight
        + coalesce(1.0 / (rrf_k + k.rank_ix), 0.0) * full_text_weight as rrf_score
    from semantic s
    full outer join keyword k on k.id = s.id
  )
  select
    w.id,
    w.knowledge_type,
    w.grade,
    w.subject,
    w.career_field,
    w.title,
    w.content,
    w.source,
    w.source_link,
    w.memo,
    1 - (w.embedding <=> query_embedding) as similarity,
    f.semantic_rank,
    f.keyword_rank,
    f.keyword_score::double precision,
    f.rrf_score::double precision
  from fused f
  join public.winning_assessment_knowledge_items w on w.id = f.id
  order by f.rrf_score desc, similarity desc
  limit least(match_count, 20);
$$;


ALTER FUNCTION "public"."match_winning_suhaeng_hybrid"("query_embedding" "extensions"."vector", "query_keywords" "text", "filter_knowledge_type" "text", "filter_grade" "text", "match_count" integer, "match_threshold" double precision, "filter_subject" "text", "full_text_weight" double precision, "semantic_weight" double precision, "rrf_k" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."match_winning_suhaeng_hybrid"("query_embedding" "extensions"."vector", "query_keywords" "text", "filter_knowledge_type" "text", "filter_grade" "text", "match_count" integer, "match_threshold" double precision, "filter_subject" "text", "full_text_weight" double precision, "semantic_weight" double precision, "rrf_k" integer) IS '수행평가 RAG 하이브리드 검색. pgvector 의미 순위와 PGroonga 단어 순위를 RRF(1/(rrf_k + rank), 가중치 곱)로 합친다. SECURITY INVOKER 이므로 service_role(RLS 우회) 또는 어드민 세션에서만 결과가 나온다.';



CREATE OR REPLACE FUNCTION "public"."orders_guard_refunded_immutable"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if old.status = 'refunded' and new.status is distinct from 'refunded' then
    raise exception 'refunded_order_immutable' using errcode = 'WC039';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."orders_guard_refunded_immutable"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."orders_guard_refunded_immutable"() IS 'orders.status=refunded 인 주문의 status 를 다른 값으로 되돌리는 UPDATE 를 차단한다(WC039, sql/71). refunded→paid 전이를 막는 수단이 이전까지 없어 웹훅 재전송으로 환불 완료 주문이 부활하고 회수된 program_access_grants 가 restore_revoked 로 재부여되는 경로가 실측·재현됐다.';



CREATE OR REPLACE FUNCTION "public"."orders_void_coupons_on_terminal_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if new.status is distinct from old.status
     and new.status in ('canceled', 'failed') then
    update public.coupon_redemptions
       set voided_at   = now(),
           void_reason = case new.status
                            when 'canceled' then 'order_canceled'
                            when 'failed'   then 'order_failed'
                          end
     where order_id = new.id
       and voided_at is null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."orders_void_coupons_on_terminal_status"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."orders_void_coupons_on_terminal_status"() IS 'orders.status 가 canceled/failed 로 전이되는 순간 그 주문의 살아있는(voided_at is null) coupon_redemptions 를 자동 void 한다(void_reason=order_canceled/order_failed). refunded 는 제외(sql/55_coupon_policy.sql:104-112 확정 정책 — 환불 쿠폰 복원은 운영자가 수기로 한다). fn_coupon_is_redeemed/fn_coupon_global_redeemed(1-c절)가 voided_at 단일 축으로 바뀌면서 이 트리거가 그 축의 유일한 자동 기록원 중 하나가 됐다(다른 하나는 1-f절 30분 lazy 정리).';



CREATE OR REPLACE FUNCTION "public"."performance_credit_ledger_validate_reversal"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_orig public.performance_credit_ledger;
begin
  if new.reversal_of is null then
    return new;
  end if;

  select * into v_orig
    from public.performance_credit_ledger
   where id = new.reversal_of;
  -- FK 가 이미 존재를 보장하므로 not found 는 도달 불가에 가깝지만
  -- for update 없이 조회하는 구간이라 방어적으로 남긴다.
  if not found then
    raise exception 'reversal_target_not_found' using errcode = 'WC013';
  end if;

  if v_orig.reversal_of is not null then
    raise exception 'reversal_of_a_reversal_not_allowed' using errcode = 'WC014';
  end if;

  if new.grant_id is distinct from v_orig.grant_id then
    raise exception 'reversal_grant_mismatch' using errcode = 'WC015';
  end if;

  if new.profile_id is distinct from v_orig.profile_id then
    raise exception 'reversal_profile_mismatch' using errcode = 'WC016';
  end if;

  if new.source_kind is distinct from v_orig.source_kind then
    raise exception 'reversal_source_kind_mismatch' using errcode = 'WC017';
  end if;

  if new.delta <> -v_orig.delta then
    raise exception 'reversal_delta_magnitude_mismatch' using errcode = 'WC018';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."performance_credit_ledger_validate_reversal"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."performance_credit_ledger_validate_reversal"() IS '되돌림 행(reversal_of not null)이 원본 행과 grant_id/profile_id/source_kind 를 그대로 상속하고 delta 가 정확히 상쇄(new.delta = -원본.delta)되는지 강제한다. WC013=원본 없음(방어적, FK 로 사실상 불가) / WC014=되돌림의 되돌림 금지 / WC015=grant_id 불일치 / WC016=profile_id 불일치 / WC017=source_kind 불일치 / WC018=delta 크기 불일치. sql/66.';



CREATE OR REPLACE FUNCTION "public"."performance_owns_session"("p_session_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.performance_sessions s
    where s.id = p_session_id
      and s.profile_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."performance_owns_session"("p_session_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."performance_owns_session"("p_session_id" "uuid") IS '수행평가 세션 하위 테이블 RLS용 소유권 판정. SECURITY DEFINER라 상위 테이블 RLS를 재평가하지 않는다. auth.uid() 고정 기준이므로 인자로 남의 세션 id를 넣어도 false만 반환한다.';



CREATE OR REPLACE FUNCTION "public"."refund_requests_guard_direct_completion"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    if current_setting('winning.refund_completing', true) is distinct from new.id::text then
      raise exception 'refund_completion_direct_update_blocked' using errcode = 'WC038';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."refund_requests_guard_direct_completion"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."refund_requests_guard_direct_completion"() IS 'status 가 completed 로 전이되는 UPDATE 를 fn_complete_refund 경유만 허용한다(WC038). 그 함수가 트랜잭션 로컬 세션 변수(winning.refund_completing = 그 행의 id)를 먼저 세팅하고, 이 트리거가 그 값이 지금 UPDATE 되는 행의 id 와 일치하는지 확인한다. 세션 변수 부재(NULL, 어드민 화면 직접 PATCH 등)나 다른 id 면 거부한다(sql/69 5-f절).';



CREATE OR REPLACE FUNCTION "public"."reissue_link_code"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_student_id uuid;
  v_old_code_id uuid;
  v_code       text;
  v_rejected   int := 0;
begin
  v_student_id := auth.uid();

  if v_student_id is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_student_id and member_type = 'student'
  ) then
    raise exception 'not_a_student';
  end if;

  select id into v_old_code_id
  from public.student_link_codes
  where student_id = v_student_id
    and is_active;

  v_code := public.issue_student_link_code(v_student_id);

  if v_old_code_id is not null then
    update public.parent_child_links
    set status = 'rejected', responded_at = now()
    where student_id = v_student_id
      and status = 'pending'
      and link_code_id = v_old_code_id;

    get diagnostics v_rejected = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'link_code', v_code,
    'rejected_pending', v_rejected
  );
end;
$$;


ALTER FUNCTION "public"."reissue_link_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_parent_link"("p_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_parent_id  uuid;
  v_code       text;
  v_code_id    uuid;
  v_student_id uuid;
  v_link_id    uuid;
  v_status     text;
begin
  v_parent_id := auth.uid();

  if v_parent_id is null then
    raise exception 'not_authenticated';
  end if;

  -- 회원유형 검증: FK로는 강제할 수 없어 여기서 본다([5] 주석 참고)
  if not exists (
    select 1 from public.profiles
    where id = v_parent_id and member_type = 'parent'
  ) then
    raise exception 'not_a_parent';
  end if;

  -- 학부모가 소문자로 입력해도 받아준다. 코드 자체는 항상 대문자로 저장된다.
  v_code := upper(trim(coalesce(p_code, '')));

  if v_code !~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$' then
    raise exception 'invalid_code_format';
  end if;

  select id, student_id into v_code_id, v_student_id
  from public.student_link_codes
  where code = v_code
    and is_active;

  if v_student_id is null then
    raise exception 'link_code_not_found';
  end if;

  if v_student_id = v_parent_id then
    raise exception 'cannot_link_self';
  end if;

  -- 자녀 1명 : 학부모 1명 — 이미 승인된 학부모가 있으면 요청 자체를 막는다.
  if exists (
    select 1 from public.parent_child_links
    where student_id = v_student_id and status = 'approved'
  ) then
    raise exception 'student_already_linked';
  end if;

  -- 이 학부모와의 기존 요청 상태를 먼저 확인해 23505 대신 구분되는 예외를 던진다.
  select status into v_status
  from public.parent_child_links
  where parent_id = v_parent_id
    and student_id = v_student_id
    and status in ('pending', 'approved');

  if v_status = 'pending' then
    raise exception 'link_already_requested';
  end if;

  insert into public.parent_child_links (parent_id, student_id, link_code_id, status, responded_at)
  values (v_parent_id, v_student_id, v_code_id, 'approved', now())
  returning id into v_link_id;

  return jsonb_build_object(
    'ok', true,
    'link_id', v_link_id,
    'status', 'approved',
    'student_name', (select name from public.profiles where id = v_student_id)
  );
end;
$_$;


ALTER FUNCTION "public"."request_parent_link"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."respond_parent_link"("p_link_id" "uuid", "p_approve" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_student_id uuid;
  v_status     text;
  v_new_status text;
  v_rejected   int := 0;
begin
  v_student_id := auth.uid();

  if v_student_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_approve is null then
    raise exception 'approve_required';
  end if;

  -- 당사자(학생) 본인의 요청만 응답할 수 있다. 남의 link_id를 넣으면
  -- 조회 자체가 안 되므로 link_not_found로 끝난다.
  select status into v_status
  from public.parent_child_links
  where id = p_link_id
    and student_id = v_student_id;

  if v_status is null then
    raise exception 'link_not_found';
  end if;

  if v_status <> 'pending' then
    raise exception 'link_not_pending';
  end if;

  if p_approve then
    if exists (
      select 1 from public.parent_child_links
      where student_id = v_student_id and status = 'approved'
    ) then
      raise exception 'student_already_linked';
    end if;

    -- 승인될 수 없게 된 나머지 요청을 먼저 정리한다.
    update public.parent_child_links
    set status = 'rejected', responded_at = now()
    where student_id = v_student_id
      and status = 'pending'
      and id <> p_link_id;

    get diagnostics v_rejected = row_count;

    v_new_status := 'approved';
  else
    v_new_status := 'rejected';
  end if;

  update public.parent_child_links
  set status = v_new_status, responded_at = now()
  where id = p_link_id;

  return jsonb_build_object(
    'ok', true,
    'link_id', p_link_id,
    'status', v_new_status,
    'auto_rejected', v_rejected   -- 함께 정리된 다른 요청 수
  );
end;
$$;


ALTER FUNCTION "public"."respond_parent_link"("p_link_id" "uuid", "p_approve" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reverse_growth_credit"("p_report_id" "uuid", "p_profile_id" "uuid", "p_reason" "text" DEFAULT 'growth:generation-failed'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."reverse_growth_credit"("p_report_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."reverse_growth_credit"("p_report_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") IS '성장설계 차감 되돌림(No.14: 생성 실패 시 되돌림). growth_reports.ledger_id 의 원장 행을 reversal_of 로 참조하는 +1 행을 적재하고 ledger_reversed_at 을 기록한다. status 어휘: reversed/nothing_to_reverse/already_reversed/report_completed/session_not_found. completed 회차는 되돌리지 않고 report_completed 를 돌려준다. 되돌림 행은 있는데 ledger_reversed_at 이 비어 있으면 already_reversed 분기에서 시각을 채워 복구한다. 원장 reason 에는 report_id 를 붙인다. 되돌림 행은 원본의 grant_id, profile_id, source_kind 를 상속하고 session_id 는 NULL(performance_credit_ledger_validate_reversal 요구). 잠금은 consume_growth_credit 과 같은 advisory(101).';



CREATE OR REPLACE FUNCTION "public"."reverse_inquiry_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text" DEFAULT 'inquiry:generation-failed'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_session public.inquiry_sessions;
  v_orig   public.performance_credit_ledger;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 101));

  select * into v_session
    from public.inquiry_sessions r
   where r.id = p_session_id and r.profile_id = p_profile_id
     for update;

  if not found then
    return jsonb_build_object('status', 'session_not_found', 'reversed', false);
  end if;

  if v_session.ledger_id is null then
    return jsonb_build_object('status', 'nothing_to_reverse', 'reversed', false);
  end if;

  if v_session.ledger_reversed_at is not null
     or exists (
       select 1 from public.performance_credit_ledger l
        where l.reversal_of = v_session.ledger_id
     ) then
    -- 되돌림 행은 있는데 세션 시각이 비어 있는 불일치를 복구한다.
    if v_session.ledger_reversed_at is null then
      update public.inquiry_sessions
         set ledger_reversed_at = now(),
             updated_at = now()
       where id = p_session_id;
    end if;

    return jsonb_build_object(
      'status', 'already_reversed', 'reversed', false,
      'ledger_id', v_session.ledger_id
    );
  end if;

  -- 확정된 세션은 되돌리지 않는다(확정 완료 세션의 무료화 방지).
  if v_session.status = 'completed' then
    return jsonb_build_object('status', 'session_completed', 'reversed', false);
  end if;

  select * into v_orig
    from public.performance_credit_ledger l
   where l.id = v_session.ledger_id;

  insert into public.performance_credit_ledger
    (profile_id, grant_id, delta, reason, source_kind, reversal_of, session_id)
  values (
    v_orig.profile_id, v_orig.grant_id, -v_orig.delta,
    coalesce(nullif(btrim(p_reason), ''), 'inquiry:generation-failed') || ':' || p_session_id::text,
    v_orig.source_kind, v_orig.id, null
  );

  update public.inquiry_sessions
     set ledger_reversed_at = now(),
         updated_at = now()
   where id = p_session_id;

  return jsonb_build_object(
    'status', 'reversed', 'reversed', true, 'ledger_id', v_session.ledger_id
  );
end;
$$;


ALTER FUNCTION "public"."reverse_inquiry_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."reverse_inquiry_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") IS '심화탐구 차감 되돌림(세션 종결 시 되돌림). inquiry_sessions.ledger_id 의 원장 행을 reversal_of 로 참조하는 +1 행을 적재하고 ledger_reversed_at 을 기록한다. status 어휘: reversed/nothing_to_reverse/already_reversed/session_completed/session_not_found. completed 세션은 되돌리지 않고 session_completed 를 돌려준다. 되돌림 행은 있는데 ledger_reversed_at 이 비어 있으면 already_reversed 분기에서 시각을 채워 복구한다. 원장 reason 에는 session_id 를 붙인다. 되돌림 행은 원본의 grant_id, profile_id, source_kind 를 상속하고 session_id 는 NULL(performance_credit_ledger_validate_reversal 요구). 잠금은 consume_inquiry_credit 과 같은 advisory(101).';



CREATE OR REPLACE FUNCTION "public"."reverse_selfeval_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text" DEFAULT 'selfeval:verify-failed'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_session public.selfeval_sessions;
  v_orig    public.performance_credit_ledger;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 101));

  select * into v_session
    from public.selfeval_sessions s
   where s.id = p_session_id and s.profile_id = p_profile_id
     for update;

  if not found then
    return jsonb_build_object('status', 'session_not_found', 'reversed', false);
  end if;

  if v_session.ledger_id is null then
    return jsonb_build_object('status', 'nothing_to_reverse', 'reversed', false);
  end if;

  if v_session.ledger_reversed_at is not null
     or exists (
       select 1 from public.performance_credit_ledger l
        where l.reversal_of = v_session.ledger_id
     ) then
    -- 되돌림 행은 있는데 세션 시각이 비어 있는 불일치를 복구한다.
    if v_session.ledger_reversed_at is null then
      update public.selfeval_sessions
         set ledger_reversed_at = now(),
             updated_at = now()
       where id = p_session_id;
    end if;

    return jsonb_build_object(
      'status', 'already_reversed', 'reversed', false,
      'ledger_id', v_session.ledger_id
    );
  end if;

  -- 정상 완료된 세션은 되돌리지 않는다(완료 세션의 무료화 방지).
  if v_session.status = 'completed' then
    return jsonb_build_object('status', 'session_completed', 'reversed', false);
  end if;

  select * into v_orig
    from public.performance_credit_ledger l
   where l.id = v_session.ledger_id;

  insert into public.performance_credit_ledger
    (profile_id, grant_id, delta, reason, source_kind, reversal_of, session_id)
  values (
    v_orig.profile_id, v_orig.grant_id, -v_orig.delta,
    coalesce(nullif(btrim(p_reason), ''), 'selfeval:verify-failed') || ':' || p_session_id::text,
    v_orig.source_kind, v_orig.id, null
  );

  update public.selfeval_sessions
     set ledger_reversed_at = now(),
         updated_at = now()
   where id = p_session_id;

  return jsonb_build_object(
    'status', 'reversed', 'reversed', true, 'ledger_id', v_session.ledger_id
  );
end;
$$;


ALTER FUNCTION "public"."reverse_selfeval_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."reverse_selfeval_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") IS '자기평가서 차감 되돌림. selfeval_sessions.ledger_id 의 원장 행을 reversal_of 로 참조하는 +1 행을 적재하고 ledger_reversed_at 을 기록한다. status 어휘: reversed/nothing_to_reverse/already_reversed/session_completed/session_not_found. completed 세션은 되돌리지 않고 session_completed 를 돌려준다. 되돌림 행은 있는데 ledger_reversed_at 이 비어 있으면 already_reversed 분기에서 시각을 채워 복구한다. 원장 reason 에는 session_id 를 붙인다. 되돌림 행은 원본의 grant_id, profile_id, source_kind 를 상속하고 session_id 는 NULL 이다. 잠금은 consume_selfeval_credit 과 같은 advisory(101).';



CREATE OR REPLACE FUNCTION "public"."revoke_parent_link"("p_link_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid    uuid;
  v_status text;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select status into v_status
  from public.parent_child_links
  where id = p_link_id
    and (student_id = v_uid or parent_id = v_uid);

  if v_status is null then
    raise exception 'link_not_found';
  end if;

  if v_status not in ('pending', 'approved') then
    raise exception 'link_not_active';
  end if;

  update public.parent_child_links
  set status = 'revoked',
      revoked_at = now(),
      revoked_by = v_uid
  where id = p_link_id;

  return jsonb_build_object('ok', true, 'link_id', p_link_id, 'status', 'revoked');
end;
$$;


ALTER FUNCTION "public"."revoke_parent_link"("p_link_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_homepage_content_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_homepage_content_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "source_program" "text" NOT NULL,
    "source_ref_id" "uuid",
    "status" "text" NOT NULL,
    "grade_label" "text",
    "semester" smallint,
    "subject_group" "text",
    "subject" "text",
    "topic" "text",
    "concept" "text",
    "method" "text",
    "result" "text",
    "limitation" "text",
    "numbers" "jsonb",
    "sources" "jsonb",
    "confirmed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "activity_records_grade_label_check" CHECK (("grade_label" = ANY (ARRAY['고1'::"text", '고2'::"text", '고3'::"text"]))),
    CONSTRAINT "activity_records_manual_shape_check" CHECK ((("source_program" <> 'manual'::"text") OR (("status" = ANY (ARRAY['planned'::"text", 'draft'::"text"])) AND ("source_ref_id" IS NULL)))),
    CONSTRAINT "activity_records_semester_check" CHECK (("semester" = ANY (ARRAY[1, 2]))),
    CONSTRAINT "activity_records_source_program_check" CHECK (("source_program" = ANY (ARRAY['performance'::"text", 'deep'::"text", 'self'::"text", 'manual'::"text", 'upload'::"text"]))),
    CONSTRAINT "activity_records_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'draft'::"text", 'confirmed'::"text", 'final'::"text"]))),
    CONSTRAINT "activity_records_subject_group_check" CHECK ((("subject_group" IS NULL) OR ("subject_group" = ANY (ARRAY['교과'::"text", '자율'::"text", '동아리'::"text", '진로'::"text"])))),
    CONSTRAINT "activity_records_upload_ref_check" CHECK ((("source_program" <> 'upload'::"text") OR ("source_ref_id" IS NOT NULL)))
);


ALTER TABLE "public"."activity_records" OWNER TO "postgres";


COMMENT ON TABLE "public"."activity_records" IS '활동 기록 저장소. status: planned(재료 조회 제외) / draft(직접 입력 작성 중) / confirmed(수행평가 최종본, 심화탐구 확정본) / final(자기평가서 최종본). source_program=upload 는 growth_uploads.id 를 source_ref_id 로 쓴다. (source_program, source_ref_id) 부분 유니크로 중복 승격을 막는다. 본인은 manual 행만 쓰고 나머지 source 는 service_role 만 쓴다. 직접 입력(manual)은 planned/draft 까지만 허용하고 확정 승격(confirmed/final)은 service_role 이 한다.';



COMMENT ON COLUMN "public"."activity_records"."subject_group" IS '활동 구분. 교과, 자율, 동아리, 진로 중 하나이며 업로드 추출은 null 이다. 교과면 subject 에 과목명, 창체(자율, 동아리, 진로)면 subject 에 활동명(없으면 null)을 둔다.';



CREATE TABLE IF NOT EXISTS "public"."admin_access_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid",
    "actor_email" "text" NOT NULL,
    "action" "text" NOT NULL,
    "resource_key" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "row_count" integer,
    "target_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "admin_access_logs_action_check" CHECK (("action" = ANY (ARRAY['download'::"text", 'unmask'::"text"]))),
    CONSTRAINT "admin_access_logs_reason_not_blank" CHECK (("btrim"("reason") <> ''::"text"))
);


ALTER TABLE "public"."admin_access_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."admin_access_logs" IS '개인정보 반출 원장(20260831041800). 엑셀 다운로드·마스킹 해제 직전에 화면 게이트가 한 줄씩 넣는다. update/delete 정책이 없어 적재 후에는 누구도 고칠 수 없다.';



COMMENT ON COLUMN "public"."admin_access_logs"."actor_email" IS '실행 시점의 계정 이메일 스냅샷. profile 이 지워져도 남아야 하므로 profile_id 와 별도로 박는다.';



COMMENT ON COLUMN "public"."admin_access_logs"."resource_key" IS 'ADMIN_SECTION_KEYS 와 같은 메뉴 키(members, mentorApplications, premiumConsults, revenue ...).';



COMMENT ON COLUMN "public"."admin_access_logs"."row_count" IS '다운로드에 실제로 포함된 행 수. 마스킹 해제(unmask)에서는 null.';



COMMENT ON COLUMN "public"."admin_access_logs"."target_id" IS '마스킹 해제 대상 회원의 profile id. 다운로드에서는 null.';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "name" "text",
    "phone" "text",
    "role" "text" DEFAULT 'user'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "username" "text",
    "email" "text",
    "region" "text",
    "school_type" "text",
    "school_name" "text",
    "terms_service_agreed" boolean DEFAULT false,
    "privacy_required_agreed" boolean DEFAULT false,
    "privacy_optional_agreed" boolean DEFAULT false,
    "marketing_agreed" boolean DEFAULT false,
    "ads_agreed" boolean DEFAULT false,
    "member_type" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "birth_date" "date",
    "gender" "text",
    "landline" "text",
    "address" "text",
    "address_detail" "text",
    "sms_agreed" boolean DEFAULT false,
    "memo" "text",
    "is_active" boolean DEFAULT true,
    "payment_terminal_id" "text",
    "guardian_phone" "text",
    "guardian_consent" boolean DEFAULT false,
    "member_category" "text" DEFAULT '일반회원'::"text",
    "org_code" "text",
    "tenant_id" "uuid",
    CONSTRAINT "profiles_gender_check" CHECK ((("gender" IS NULL) OR ("gender" = ANY (ARRAY['남'::"text", '여'::"text"])))),
    CONSTRAINT "profiles_member_type_check" CHECK ((("member_type" IS NULL) OR ("member_type" = ANY (ARRAY['student'::"text", 'parent'::"text", 'mentor'::"text"])))),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."guardian_phone" IS '법정대리인 연락처(만 14세 미만 가입). 본인확인된 번호는 identity_verifications.mobile.';



COMMENT ON COLUMN "public"."profiles"."guardian_consent" IS '법정대리인 정보를 학부모 정보로 수집하는 것에 대한 동의(D-2).';



COMMENT ON COLUMN "public"."profiles"."member_category" IS '관리자 전용 회원구분 라벨(QA #3, 2026-08-22). 기본값 "일반회원", 그 외 "OO학교"/"OO기관"/"OO캠퍼스"/"OO기업"/"기타" 등은 관리자가 자유 텍스트로 기입한다 — CHECK 없음(고정 목록이 아니라 관리자 재량). 일반 회원 화면에는 노출하지 않는다(회원구분 관리 화면 전용).';



COMMENT ON COLUMN "public"."profiles"."org_code" IS '2026-09-22 tenant_id로 대체됨, 읽기·쓰기 금지, 후속 PR에서 drop 예정.';



COMMENT ON CONSTRAINT "profiles_gender_check" ON "public"."profiles" IS 'gender 는 null 또는 ''남''/''여''. 20260825113811 에서 validate 완료 — 전 행에 적용된다.';



CREATE OR REPLACE VIEW "public"."admin_access_log_entries" WITH ("security_invoker"='on') AS
 SELECT "l"."id",
    "l"."created_at",
    "l"."action",
    "l"."resource_key",
    "l"."reason",
    "l"."row_count",
    "l"."target_id",
    "l"."actor_email",
    COALESCE("p"."name", '(탈퇴 계정)'::"text") AS "actor_name"
   FROM ("public"."admin_access_logs" "l"
     LEFT JOIN "public"."profiles" "p" ON (("p"."id" = "l"."profile_id")));


ALTER VIEW "public"."admin_access_log_entries" OWNER TO "postgres";


COMMENT ON VIEW "public"."admin_access_log_entries" IS '개인정보 접근 로그 열람 화면용 평면 뷰(20260831041800). security_invoker=on — 조회자 권한으로 admin_access_logs RLS 를 평가한다.';



CREATE TABLE IF NOT EXISTS "public"."enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid",
    "term_name" "text" DEFAULT ''::"text",
    "category_name" "text" DEFAULT ''::"text",
    "program_name" "text" DEFAULT ''::"text",
    "class_name" "text" DEFAULT ''::"text",
    "guardian_name" "text" DEFAULT ''::"text",
    "student_name" "text" DEFAULT ''::"text",
    "phone" "text" DEFAULT ''::"text",
    "grade" "text" DEFAULT ''::"text",
    "school_name" "text" DEFAULT ''::"text",
    "application_status" "text" DEFAULT '신청완료'::"text",
    "payment_status" "text" DEFAULT '납부대기'::"text",
    "price" integer DEFAULT 0,
    "discount_amount" integer DEFAULT 0,
    "paid_amount" integer DEFAULT 0,
    "memo" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "order_id" "text"
);


ALTER TABLE "public"."enrollments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."enrollments"."order_id" IS '이 오프라인 수강 건에 대응하는 온라인 주문(orders.id). 어드민이 손으로 연결한다 — 대응 주문이 없는 현금 수납 등은 NULL(20260831053500, QA 272).';



CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" bigint NOT NULL,
    "order_id" "text" NOT NULL,
    "product_slug" "text",
    "service_key" "text",
    "name" "text" NOT NULL,
    "list_price" integer DEFAULT 0 NOT NULL,
    "price" integer DEFAULT 0 NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "product_id" "uuid",
    CONSTRAINT "order_items_list_price_check" CHECK (("list_price" >= 0)),
    CONSTRAINT "order_items_price_check" CHECK (("price" >= 0)),
    CONSTRAINT "order_items_price_le_list_price_check" CHECK (("price" <= "list_price")),
    CONSTRAINT "order_items_quantity_check" CHECK (("quantity" >= 1))
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."order_items"."product_slug" IS '구매 시점 상품 식별자 스냅샷(products.slug). FK 가 없다 — 상품이 단종·개명·가격 개편되거나 product_id 가 on delete set null 로 비어도, 이 값은 바뀌지 않아 정산·환불 대응에 필요한 "무엇을 샀는가"를 사람이 읽을 수 있다(sql/56_surrogate_uuid_keys.sql 3)절).';



COMMENT ON COLUMN "public"."order_items"."product_id" IS '관계(FK). products.id(uuid) 참조, on delete set null — restrict 로 걸면 한 번이라도 팔린 상품을 영구히 삭제할 수 없어 어드민이 soft-delete 만 쓸 수 있게 된다. 카탈로그 조인(현재가·상태 조회)에 쓴다.';



CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "order_name" "text",
    "list_amount" integer DEFAULT 0 NOT NULL,
    "discount_amount" integer DEFAULT 0 NOT NULL,
    "amount" integer NOT NULL,
    "coupon_id" "uuid",
    "customer_email" "text" NOT NULL,
    "payment_key" "text",
    "method" "text",
    "paid_at" timestamp with time zone,
    "raw" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "student_profile_id" "uuid" NOT NULL,
    "parent_profile_id" "uuid" NOT NULL,
    "approval_status" "text" DEFAULT 'requested'::"text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responded_at" timestamp with time zone,
    "reject_reason" "text",
    "superseded_by_order_id" "text",
    CONSTRAINT "orders_amount_balance_check" CHECK (("amount" = ("list_amount" - "discount_amount"))),
    CONSTRAINT "orders_amount_check" CHECK (("amount" > 0)),
    CONSTRAINT "orders_approval_before_payment_check" CHECK ((("approval_status" = 'approved'::"text") OR ("status" = ANY (ARRAY['pending'::"text", 'canceled'::"text", 'failed'::"text"])))),
    CONSTRAINT "orders_approval_status_check" CHECK (("approval_status" = ANY (ARRAY['requested'::"text", 'approved'::"text", 'rejected'::"text", 'superseded'::"text"]))),
    CONSTRAINT "orders_discount_amount_check" CHECK (("discount_amount" >= 0)),
    CONSTRAINT "orders_list_amount_check" CHECK (("list_amount" >= 0)),
    CONSTRAINT "orders_pair_distinct_check" CHECK (("student_profile_id" <> "parent_profile_id")),
    CONSTRAINT "orders_reject_reason_pairing_check" CHECK ((("approval_status" = 'rejected'::"text") = ("reject_reason" IS NOT NULL))),
    CONSTRAINT "orders_responded_at_pairing_check" CHECK ((("approval_status" = 'requested'::"text") = ("responded_at" IS NULL))),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'waiting_deposit'::"text", 'failed'::"text", 'canceled'::"text", 'refunded'::"text"]))),
    CONSTRAINT "orders_superseded_pairing_check" CHECK ((("approval_status" = 'superseded'::"text") = ("superseded_by_order_id" IS NOT NULL))),
    CONSTRAINT "orders_user_id_is_parent_check" CHECK (("user_id" = "parent_profile_id"))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


COMMENT ON COLUMN "public"."orders"."student_profile_id" IS '권한 수혜자(학생). 결제로 이용 권한을 받는 쪽은 항상 학생이다(사용자 확정, sql/68).';



COMMENT ON COLUMN "public"."orders"."parent_profile_id" IS '결제 실행자(학부모). orders.user_id 는 이 값과 항상 같다(orders_user_id_is_parent_check).';



COMMENT ON COLUMN "public"."orders"."superseded_by_order_id" IS '이 주문이 superseded 로 종결됐을 때 그 요청을 대체한 새 주문의 id(fn_parent_create_enrollment 가 채운다). 대체되지 않은 주문은 항상 NULL(sql/85).';



COMMENT ON CONSTRAINT "orders_amount_balance_check" ON "public"."orders" IS '실결제금액 = 정가합계 - 총할인. fn_redeem_coupons 가 항상 이 등식을 만족하는 값만 커밋한다(sql/55_coupon_policy.sql:1676-1688) — 향후 이 등식을 깨는 코드 변경이 생기면 INSERT/UPDATE 시점에 즉시 드러나게 한다(M14, 2026-08-11).';



COMMENT ON CONSTRAINT "orders_amount_check" ON "public"."orders" IS '0원 이하 주문은 fn_redeem_coupons 의 WC001 예외로 이미 커밋 자체가 불가능하다(sql/55_coupon_policy.sql:1679-1688) — 이 CHECK 는 그 불변식을 DB 레벨에서도 보장한다(M14, 2026-08-11).';



COMMENT ON CONSTRAINT "orders_approval_before_payment_check" ON "public"."orders" IS '학부모 수락 전에는 결제가 진행될 수 없다 — approval_status 가 requested/rejected 인 동안 orders.status 는 pending/canceled/failed 만 허용된다(사용자 확정 흐름: 학생 신청 → 학부모 수락 → 결제, sql/68). failed 추가(sql/69, 내 설계 오류 수정) — 결제 실패 기록은 승인 여부와 무관하게 항상 가능해야 한다. 이게 없으면 미승인 주문의 토스 승인 실패가 23514 로 막혀 영구 pending 으로 남는다(R2 재현).';



COMMENT ON CONSTRAINT "orders_approval_status_check" ON "public"."orders" IS '승인축 4값(sql/85 로 superseded 추가) — requested/approved/rejected 는 sql/68 원문, superseded 는 학부모가 원래 요청의 상품 구성을 바꿔 새 주문으로 대체했을 때(fn_parent_create_enrollment) 원래 주문에 남는 종결 상태다.';



COMMENT ON CONSTRAINT "orders_status_check" ON "public"."orders" IS '허용값 6개(sql/55 0-d절 5개 + refunded, sql/69). refunded = fn_complete_refund 가 환불을 완결하며 세팅하는 최종 상태. fn_coupon_is_redeemed/fn_coupon_global_redeemed(sql/69 1-c절)는 더 이상 이 컬럼을 보지 않는다(voided_at 단일 축) — refunded 로 전이돼도 1-e절 트리거가 쿠폰을 자동 void 하지 않는다(환불 쿠폰 복원은 운영자가 수기로 한다, sql/55_coupon_policy.sql:104-112 확정 정책). 새 status 값을 추가할 때는 1-e절 트리거의 대상 목록(canceled/failed)을 재검토할 것.';



COMMENT ON CONSTRAINT "orders_superseded_pairing_check" ON "public"."orders" IS 'superseded_by_order_id 는 approval_status=superseded 인 주문에만 채워진다(그 반대도 성립) — reject_reason/responded_at 페어링 체크(sql/68)와 같은 원칙(sql/85).';



COMMENT ON CONSTRAINT "orders_user_id_is_parent_check" ON "public"."orders" IS 'orders.user_id(결제 실행자, sql/67 로 NOT NULL)는 이제 항상 parent_profile_id 와 같다 — 기존 컬럼·RLS·호출부를 깨지 않으면서 의미를 고정한다(사용자 확정: 결제자=학부모, sql/68).';



CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_key" "text" NOT NULL,
    "service_name" "text" NOT NULL,
    "service_desc" "text",
    "service_sort_order" integer DEFAULT 99 NOT NULL,
    "sort_order" integer DEFAULT 99 NOT NULL,
    "name" "text" NOT NULL,
    "list_price" integer NOT NULL,
    "price" integer NOT NULL,
    "badge" "text",
    "is_recommended" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "slug" "text" NOT NULL,
    "program_key" "text",
    "duration_months" integer,
    "session_quota" integer,
    "is_orderable" boolean DEFAULT true NOT NULL,
    "validity_days" integer,
    "org_code" "text",
    "sale_ends_at" timestamp with time zone,
    "tenant_id" "uuid",
    "addon_only" boolean DEFAULT false NOT NULL,
    "grant_expires_floor_at" timestamp with time zone,
    "grant_expires_floor_paid_before" timestamp with time zone,
    CONSTRAINT "products_duration_months_positive_check" CHECK ((("duration_months" IS NULL) OR ("duration_months" > 0))),
    CONSTRAINT "products_entitlement_shape_check" CHECK ((("program_key" IS NULL) OR ("duration_months" IS NOT NULL) OR ("session_quota" IS NOT NULL))),
    CONSTRAINT "products_grant_expires_floor_pair_check" CHECK ((("grant_expires_floor_at" IS NULL) = ("grant_expires_floor_paid_before" IS NULL))),
    CONSTRAINT "products_list_price_check" CHECK (("list_price" >= 0)),
    CONSTRAINT "products_org_code_normalized_check" CHECK ((("org_code" IS NULL) OR ("org_code" = "upper"(TRIM(BOTH FROM "org_code"))))),
    CONSTRAINT "products_price_check" CHECK (("price" >= 0)),
    CONSTRAINT "products_price_le_list_price_check" CHECK (("price" <= "list_price")),
    CONSTRAINT "products_session_quota_positive_check" CHECK ((("session_quota" IS NULL) OR ("session_quota" > 0))),
    CONSTRAINT "products_validity_days_positive_check" CHECK ((("validity_days" IS NULL) OR ("validity_days" > 0))),
    CONSTRAINT "products_validity_days_shape_check" CHECK ((("validity_days" IS NULL) OR ("duration_months" IS NULL)))
);


ALTER TABLE "public"."products" OWNER TO "postgres";


COMMENT ON COLUMN "public"."products"."id" IS '대체키(surrogate key). 의미를 담지 않는다 — 사람이 읽는 핸들은 slug 다.';



COMMENT ON COLUMN "public"."products"."slug" IS '사람이 읽는 안정 자연키. sql/ 시드의 멱등 충돌 대상이자 어드민 핸들. 구 text id 의 보존본이기도 하다(susi-30 → susi-3 만 실제 회차로 정정). 상품의 의미가 바뀌면 이 값을 고치고 id 는 그대로 둔다.';



COMMENT ON COLUMN "public"."products"."program_key" IS '이 상품이 부여하는 이용 권한(programs.program_key). service_key(그룹핑·라우팅용, 불변 스냅샷 원본)와 별개 컬럼이다 — goal→target 처럼 표시용 키와 권한 키가 다를 수 있어서다(M3, 2026-08-11). NULL 허용 = "이 상품은 앱 이용 권한을 주지 않는다"는 명시적 상태.';



COMMENT ON COLUMN "public"."products"."duration_months" IS '이용 기간(개월). NULL = 무기한. 달력 개월이며 30일 고정이 아니다 — 1/31 결제 1개월권의 만료는 2/28 이다(sql/64 (나)·4)절 헬퍼).';



COMMENT ON COLUMN "public"."products"."session_quota" IS '이용 회차. NULL = 무제한. 기간이 상한이다 — 만료 시 잔여 회차는 소멸한다(duration_months 가 NULL 인 무기한 상품은 기간이 없으므로 소멸도 없다: mentor-1, suhaeng-1).';



COMMENT ON COLUMN "public"."products"."is_orderable" IS '셀프서브 결제 플로우(학생 수강신청 StudentEnrollmentRequest.tsx / 학부모 결제 ParentCheckout.tsx)에서 노출·주문 허용 여부. is_active(판매 중 여부)와 별개 축 — false여도 다른 화면(PricingSelling.tsx 등)에는 계속 보일 수 있다. 프론트 ALLOWED_SERVICE_KEYS 하드코딩 상수를 대체한다(2026-08-25).';



COMMENT ON COLUMN "public"."products"."validity_days" IS '기간이 정해져 있지 않은 회차 이용권의 유효기간(일). 제33조의1 ⑤ — 1회권은 구매일부터 30일. duration_months 와 동시 보유 금지(유효기간은 기간이 없는 상품의 속성). NULL = 유효기간 없음.';



COMMENT ON COLUMN "public"."products"."org_code" IS '2026-09-22 tenant_id로 대체됨, 읽기·쓰기 금지, 후속 PR에서 drop 예정.';



COMMENT ON COLUMN "public"."products"."sale_ends_at" IS '판매 마감 시각(2026-09-01). NULL 이면 마감 없음. now() >= sale_ends_at 이면 신청 함수(fn_request_enrollment·fn_parent_create_enrollment)가 거부한다(WC065) — 카탈로그 노출 여부는 이 컬럼과 별개로 프론트/조회 쿼리가 판단한다.';



COMMENT ON COLUMN "public"."products"."addon_only" IS '추가 이용권 여부. true 면 해당 program_key 의 살아있는 부여가 있는 학생만 주문할 수 있고(WC067) 수량 1~10 을 허용한다(WC068). false 는 수량 1 고정.';



COMMENT ON COLUMN "public"."products"."grant_expires_floor_at" IS '번들 부여 만료 하한. grant_expires_floor_paid_before 이전에 결제한 주문의 모든 부여는 expires_at = greatest(정상 계산 만료, 이 값)이다. 둘 다 NULL 이면 특례 없음.';



COMMENT ON COLUMN "public"."products"."grant_expires_floor_paid_before" IS 'grant_expires_floor_at 이 적용되는 결제 시각의 상한(미포함). grant_expires_floor_at 과 함께 설정한다.';



COMMENT ON CONSTRAINT "products_entitlement_shape_check" ON "public"."products" IS '권한을 부여하는 상품(program_key not null)은 기간이나 회차 중 최소 하나를 반드시 가져야 한다. 둘 다 NULL 이면 결제 시 영구 무제한 권한이 되고 되돌릴 수 없다(M1, 2026-08-12).';



COMMENT ON CONSTRAINT "products_price_le_list_price_check" ON "public"."products" IS '판매가는 정가를 넘을 수 없다. 이 저장소는 상품 편집 어드민 화면이 없어 Supabase Studio 직접 입력이 유일한 경로다 — 이 CHECK 가 유일한 방어선(M14, 2026-08-11).';



CREATE OR REPLACE VIEW "public"."admin_enrollment_entries" WITH ("security_invoker"='on') AS
 SELECT ('order:'::"text" || ("oi"."id")::"text") AS "id",
    '온라인'::"text" AS "source",
    COALESCE("o"."paid_at", "o"."created_at") AS "created_at",
    "o"."id" AS "order_id",
    NULL::"text" AS "term_name",
    COALESCE("p"."service_name", "oi"."service_key") AS "category_name",
    "oi"."name" AS "program_name",
    NULL::"text" AS "class_name",
    "parent"."name" AS "guardian_name",
    COALESCE("student"."name", "payer"."name") AS "student_name",
    COALESCE("student"."phone", "payer"."phone") AS "phone",
    NULL::"text" AS "grade",
    NULL::"text" AS "school_name",
        CASE "o"."status"
            WHEN 'refunded'::"text" THEN '환불완료'::"text"
            ELSE '납부완료'::"text"
        END AS "payment_status",
    "o"."method" AS "payment_method",
    (("o"."raw" -> 'card'::"text") ->> 'approveNo'::"text") AS "approval_no",
    (COALESCE("oi"."list_price", "oi"."price", 0) * COALESCE("oi"."quantity", 1)) AS "price",
    0 AS "discount_amount",
    (COALESCE("oi"."price", 0) * COALESCE("oi"."quantity", 1)) AS "paid_amount",
    NULL::"text" AS "memo"
   FROM ((((("public"."order_items" "oi"
     JOIN "public"."orders" "o" ON (("o"."id" = "oi"."order_id")))
     LEFT JOIN "public"."products" "p" ON (("p"."id" = "oi"."product_id")))
     LEFT JOIN "public"."profiles" "payer" ON (("payer"."id" = "o"."user_id")))
     LEFT JOIN "public"."profiles" "student" ON (("student"."id" = "o"."student_profile_id")))
     LEFT JOIN "public"."profiles" "parent" ON (("parent"."id" = "o"."parent_profile_id")))
  WHERE ("o"."status" = ANY (ARRAY['paid'::"text", 'refunded'::"text"]))
UNION ALL
 SELECT ('enroll:'::"text" || ("e"."id")::"text") AS "id",
    '오프라인'::"text" AS "source",
    "e"."created_at",
    "e"."order_id",
    "e"."term_name",
    "e"."category_name",
    "e"."program_name",
    "e"."class_name",
    "e"."guardian_name",
    "e"."student_name",
    "e"."phone",
    "e"."grade",
    "e"."school_name",
    "e"."payment_status",
    "o"."method" AS "payment_method",
    (("o"."raw" -> 'card'::"text") ->> 'approveNo'::"text") AS "approval_no",
    "e"."price",
    "e"."discount_amount",
    "e"."paid_amount",
    "e"."memo"
   FROM ("public"."enrollments" "e"
     LEFT JOIN "public"."orders" "o" ON (("o"."id" = "e"."order_id")));


ALTER VIEW "public"."admin_enrollment_entries" OWNER TO "postgres";


COMMENT ON VIEW "public"."admin_enrollment_entries" IS '「수강 신청 내역」 화면의 원천(20260831062100). 온라인 결제(order_items, status paid/refunded)와 오프라인 장부(enrollments)의 합집합이고 행 단위는 강좌 한 건이다. id 는 ''order:''/''enroll:'' 접두사로 두 원장을 구분한다 — 화면은 읽기 전용이라 이 id 로 수정하지 않는다. security_invoker=on 이라 orders/enrollments 의 RLS 가 그대로 적용된다.';



CREATE TABLE IF NOT EXISTS "public"."admin_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_super" boolean DEFAULT false NOT NULL,
    "is_system" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_roles" OWNER TO "postgres";


COMMENT ON TABLE "public"."admin_roles" IS '권한 묶음(20260822000010_admin_permissions). is_super 묶음은 권한 항목을 갖지 않고 판정 함수가 전 메뉴 edit 으로 단락시킨다 — 새 메뉴가 추가돼도 최고 관리자는 자동 사용 가능해야 하므로.';



CREATE OR REPLACE VIEW "public"."admin_member_directory" WITH ("security_invoker"='on') AS
 SELECT "m"."profile_id",
    "m"."role_id",
    "m"."department",
    "m"."status",
    "m"."invited_at",
    "m"."activated_at",
    "m"."invited_by",
    "r"."name" AS "role_name",
    "r"."is_super" AS "role_is_super",
    "p"."name" AS "member_name",
    "p"."email" AS "member_email",
    "p"."phone" AS "member_phone",
    "p"."created_at" AS "joined_at"
   FROM (("public"."admin_members" "m"
     LEFT JOIN "public"."admin_roles" "r" ON (("r"."id" = "m"."role_id")))
     LEFT JOIN "public"."profiles" "p" ON (("p"."id" = "m"."profile_id")));


ALTER VIEW "public"."admin_member_directory" OWNER TO "postgres";


COMMENT ON VIEW "public"."admin_member_directory" IS '직원 관리 화면용 평면 뷰(20260822000012). security_invoker=on — 조회자 권한으로 admin_members RLS 를 평가한다(끄면 이 뷰가 RLS 우회 경로가 된다).';



CREATE TABLE IF NOT EXISTS "public"."admin_member_permissions" (
    "profile_id" "uuid" NOT NULL,
    "resource_key" "text" NOT NULL,
    "level" "text" NOT NULL,
    "granted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "admin_member_permissions_level_check" CHECK (("level" = ANY (ARRAY['edit'::"text", 'view'::"text", 'none'::"text"])))
);


ALTER TABLE "public"."admin_member_permissions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."admin_refund_ledger" WITH ("security_invoker"='on') AS
 SELECT "r"."id",
    "r"."completed_at",
    "r"."order_id",
    COALESCE("student"."name", "payer"."name") AS "student_name",
    COALESCE("student"."org_code", "payer"."org_code") AS "org_code",
    "r"."order_name" AS "program_name",
    "o"."amount" AS "paid_amount",
    "r"."amount" AS "refund_amount",
    "r"."refund_method",
    "handler"."name" AS "processed_by_name",
    "r"."reason",
    "r"."admin_memo",
    "r"."status",
    "tenant"."name" AS "tenant_name"
   FROM ((((("public"."refund_requests" "r"
     LEFT JOIN "public"."orders" "o" ON (("o"."id" = "r"."order_id")))
     LEFT JOIN "public"."profiles" "student" ON (("student"."id" = "r"."student_profile_id")))
     LEFT JOIN "public"."profiles" "payer" ON (("payer"."id" = "r"."user_id")))
     LEFT JOIN "public"."profiles" "handler" ON (("handler"."id" = "r"."processed_by")))
     LEFT JOIN "public"."tenants" "tenant" ON (("tenant"."id" = COALESCE("student"."tenant_id", "payer"."tenant_id"))))
  WHERE ("r"."status" = 'completed'::"text");


ALTER VIEW "public"."admin_refund_ledger" OWNER TO "postgres";


COMMENT ON VIEW "public"."admin_refund_ledger" IS '「환불 처리 대장」 화면의 원천(20260831081100, 파일18 기준). 완료된 환불만 싣는다 — 처리 중인 건은 환불 신청 내역 화면이 본다. security_invoker=on 이라 refund_requests 의 RLS 가 그대로 적용된다. 2026-09-22 — tenant_name(학생 우선, 없으면 결제자 tenant_id 기준) 컬럼을 끝에 추가했다. 기존 org_code 컬럼은 그대로 유지한다(drop 은 후속 PR).';



CREATE TABLE IF NOT EXISTS "public"."admin_resources" (
    "key" "text" NOT NULL,
    "group_title" "text" NOT NULL,
    "label" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_resources" OWNER TO "postgres";


COMMENT ON TABLE "public"."admin_resources" IS '권한을 걸 수 있는 어드민 메뉴 마스터(20260823000002_admin_resources_recategorize 로 대분류 재편). key 는 ADMIN_SECTION_KEYS 와 같은 문자열이어야 한다 — 코드가 정본이고 이 테이블은 그 사본이다. 어긋나면 화면은 있는데 권한을 못 주거나(키 누락) 권한 화면에 유령 항목이 뜬다(키 잔존).';



CREATE OR REPLACE VIEW "public"."admin_revenue_items" WITH ("security_invoker"='on') AS
 WITH "item_base" AS (
         SELECT "oi"."id" AS "order_item_id",
            "oi"."order_id",
            "oi"."service_key",
            "oi"."name" AS "item_name",
            COALESCE("oi"."quantity", 1) AS "quantity",
            (COALESCE("oi"."list_price", "oi"."price", 0) * COALESCE("oi"."quantity", 1)) AS "list_amount",
            "o"."user_id" AS "payer_profile_id",
            "o"."student_profile_id",
            "o"."discount_amount" AS "order_discount_amount",
            "o"."paid_at",
            "o"."status" AS "order_status",
            "o"."method",
            "sum"((COALESCE("oi"."list_price", "oi"."price", 0) * COALESCE("oi"."quantity", 1))) OVER (PARTITION BY "oi"."order_id") AS "order_list_total"
           FROM ("public"."order_items" "oi"
             JOIN "public"."orders" "o" ON (("o"."id" = "oi"."order_id")))
        ), "item_amounts" AS (
         SELECT "b"."order_item_id",
            "b"."order_id",
            "b"."service_key",
            "b"."item_name",
            "b"."quantity",
            "b"."list_amount",
            "b"."payer_profile_id",
            "b"."student_profile_id",
            "b"."order_discount_amount",
            "b"."paid_at",
            "b"."order_status",
            "b"."method",
            "b"."order_list_total",
                CASE
                    WHEN ("b"."order_list_total" > 0) THEN "round"(((("b"."order_discount_amount")::numeric * ("b"."list_amount")::numeric) / ("b"."order_list_total")::numeric))
                    ELSE (0)::numeric
                END AS "discount_amount"
           FROM "item_base" "b"
        )
 SELECT "a"."order_item_id",
    "a"."order_id",
    "a"."paid_at",
    "a"."order_status",
    "a"."method",
    "a"."payer_profile_id",
    "payer"."name" AS "payer_name",
    "payer"."email" AS "payer_email",
    "a"."student_profile_id",
    "student"."name" AS "student_name",
    "a"."service_key",
    "a"."item_name",
    "a"."quantity",
    "a"."list_amount",
    "a"."discount_amount",
    (("a"."list_amount")::numeric - "a"."discount_amount") AS "paid_amount",
    COALESCE("refund"."refunded_amount", (0)::bigint) AS "refunded_amount",
        CASE
            WHEN (COALESCE("refund"."refunded_amount", (0)::bigint) > 0) THEN 'refunded'::"text"
            ELSE 'normal'::"text"
        END AS "revenue_status",
    ((("a"."list_amount")::numeric - "a"."discount_amount") - (COALESCE("refund"."refunded_amount", (0)::bigint))::numeric) AS "net_amount"
   FROM ((("item_amounts" "a"
     LEFT JOIN "public"."profiles" "payer" ON (("payer"."id" = "a"."payer_profile_id")))
     LEFT JOIN "public"."profiles" "student" ON (("student"."id" = "a"."student_profile_id")))
     LEFT JOIN LATERAL ( SELECT "sum"("r"."amount") AS "refunded_amount"
           FROM "public"."refund_requests" "r"
          WHERE (("r"."order_item_id" = "a"."order_item_id") AND ("r"."status" = 'completed'::"text"))) "refund" ON (true))
  WHERE ("a"."order_status" = ANY (ARRAY['paid'::"text", 'refunded'::"text"]));


ALTER VIEW "public"."admin_revenue_items" OWNER TO "postgres";


COMMENT ON VIEW "public"."admin_revenue_items" IS '「매출 및 결제」 화면의 원천(20260823000011). 행 = order_item 한 건이고, 주문 단위 할인은 정가 비중대로 안분한다. 환불은 refund_requests.status=''completed'' 만 센다(승인이 아니라 실제 환불 완료 기준 — 사용자 확정 2026-08-23). 매출은 net_amount 합으로 낸다. security_invoker=on 이므로 orders/order_items 의 RLS(is_admin())가 그대로 적용된다.';



CREATE TABLE IF NOT EXISTS "public"."admin_role_permissions" (
    "role_id" "uuid" NOT NULL,
    "resource_key" "text" NOT NULL,
    "level" "text" NOT NULL,
    CONSTRAINT "admin_role_permissions_level_check" CHECK (("level" = ANY (ARRAY['edit'::"text", 'view'::"text", 'none'::"text"])))
);


ALTER TABLE "public"."admin_role_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admission_acceptance_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "year" integer NOT NULL,
    "rate" numeric(5,2) DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "admission_acceptance_rates_rate_range" CHECK ((("rate" >= (0)::numeric) AND ("rate" <= (100)::numeric)))
);


ALTER TABLE "public"."admission_acceptance_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admission_case_logos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "logo_url" "text" DEFAULT ''::"text" NOT NULL,
    "display_height_rem" numeric(5,3) DEFAULT 2,
    "opacity" numeric(3,2) DEFAULT 1,
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "row_no" smallint DEFAULT 1 NOT NULL,
    CONSTRAINT "admission_case_logos_height_range" CHECK ((("display_height_rem" > (0)::numeric) AND ("display_height_rem" <= (10)::numeric))),
    CONSTRAINT "admission_case_logos_opacity_range" CHECK ((("opacity" > (0)::numeric) AND ("opacity" <= (1)::numeric))),
    CONSTRAINT "admission_case_logos_row_no_range" CHECK ((("row_no" = 1) OR ("row_no" = 2)))
);


ALTER TABLE "public"."admission_case_logos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admission_jungsi_results" (
    "id" bigint NOT NULL,
    "track" "text",
    "university_name" "text" NOT NULL,
    "department_name" "text" NOT NULL,
    "apply_group" "text",
    "quota" integer,
    "region_city" "text",
    "region_district" "text",
    "university_short_name" "text",
    "department_short_name" "text",
    "proper_score" numeric,
    "expected_score" numeric,
    "reach_score" numeric,
    "proper_percentile" numeric,
    "expected_percentile" numeric,
    "reach_percentile" numeric,
    "past_accept_2411" numeric,
    "past_accept_2311" numeric,
    "past_accept_2211" numeric,
    "past_accept_2111" numeric,
    "past_accept_2011" numeric,
    "past_accept_1911" numeric,
    "past_70_2411" numeric,
    "past_70_2311" numeric,
    "past_70_2211" numeric,
    "past_70_2111" numeric,
    "past_70_2011" numeric,
    "past_70_1911" numeric,
    "university_key" "text",
    "department_key" "text",
    "source_sheet" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."admission_jungsi_results" OWNER TO "postgres";


COMMENT ON TABLE "public"."admission_jungsi_results" IS 'DEPRECATED (2026-08-05): 통합 테이블 public.admission_results 로 대체됨(recruitment_period=''정시''). wide(연도-컬럼) 포맷이라 신규 연도 축 추가가 스키마 변경을 요구하는 문제로 long 포맷 admission_results가 정본이 됨. 로컬·dev·운영 전부 0행 확인 — 이관 대상 데이터 없음. 향후 DROP 후보.';



CREATE SEQUENCE IF NOT EXISTS "public"."admission_jungsi_results_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."admission_jungsi_results_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."admission_jungsi_results_id_seq" OWNED BY "public"."admission_jungsi_results"."id";



CREATE TABLE IF NOT EXISTS "public"."admission_posts" (
    "id" bigint NOT NULL,
    "category" "text" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text",
    "image_url" "text",
    "file_url" "text",
    "file_name" "text",
    "is_pinned" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_urls" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "attachments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "show_on_home" boolean DEFAULT false NOT NULL,
    "content_json" "jsonb",
    CONSTRAINT "admission_posts_category_check" CHECK (("category" = ANY (ARRAY['susi'::"text", 'jungsi'::"text", 'essay'::"text"])))
);


ALTER TABLE "public"."admission_posts" OWNER TO "postgres";


ALTER TABLE "public"."admission_posts" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."admission_posts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."admission_results" (
    "id" bigint NOT NULL,
    "result_year" smallint NOT NULL,
    "university_key" "text" NOT NULL,
    "university_name" "text" NOT NULL,
    "department_key" "text" NOT NULL,
    "department_name" "text" NOT NULL,
    "main_track" "text",
    "screening_category" "text",
    "admission_track" "text" NOT NULL,
    "grade_50" numeric(4,2),
    "grade_70" numeric(4,2),
    "grade_85" numeric(4,2),
    "grade_90" numeric(4,2),
    "converted_score" numeric,
    "percentile" numeric,
    "quota" integer,
    "competition_rate" numeric(6,2),
    "waitlist_rank" "text",
    "subject_reflection" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "source_sheet" "text",
    "source_row" integer,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "grade_avg" numeric(4,2),
    "grade_min" numeric(4,2),
    "grade_avg10" numeric(4,2),
    "grade_min10" numeric(4,2),
    "grade_first_avg" numeric(4,2),
    "variant_seq" smallint DEFAULT 0 NOT NULL,
    CONSTRAINT "admission_results_main_track_check" CHECK ((("main_track" IS NULL) OR ("main_track" = ANY (ARRAY['교과'::"text", '종합'::"text", '논술'::"text", '실기'::"text", '기타'::"text"])))),
    CONSTRAINT "admission_results_result_year_check" CHECK ((("result_year" >= 2015) AND ("result_year" <= 2035))),
    CONSTRAINT "admission_results_screening_category_check" CHECK ((("screening_category" IS NULL) OR ("screening_category" = ANY (ARRAY['일반'::"text", '추천형'::"text", '지역인재'::"text", '농어촌'::"text", '기회균형'::"text", '특성화고'::"text", '특수교육'::"text", '논술'::"text", '실기'::"text", '성인학습자'::"text", '재외국민'::"text", '기타'::"text"]))))
);


ALTER TABLE "public"."admission_results" OWNER TO "postgres";


COMMENT ON TABLE "public"."admission_results" IS '입결 통합 테이블(long 포맷). 2026-08-11 sql/53 으로 recruitment_period 축을 제거해 **수시 전용**이 됐다(원본 자료에 모집시기 개념이 없음). 정본 소스는 입결_마스터_2개년.xlsx(2025·2026학년도 43,170행). sql/43_admission_results.sql + sql/53_admission_results_2yr.sql 참고.';



COMMENT ON COLUMN "public"."admission_results"."main_track" IS '중심전형: 교과|종합|논술|실기|기타. 마스터 xlsx C열 원문 그대로(접두어 없음).';



COMMENT ON COLUMN "public"."admission_results"."screening_category" IS '전형유형 11종: 일반|추천형|지역인재|농어촌|기회균형|특성화고|특수교육|논술|실기|성인학습자|재외국민 (+기타). 마스터 xlsx D열 원문.';



COMMENT ON COLUMN "public"."admission_results"."grade_85" IS '교과등급 85%컷(최종등록자 전과목). 마스터 xlsx K열. 154건 — 2025학년도 전용, v1 화면 미노출.';



COMMENT ON COLUMN "public"."admission_results"."grade_90" IS '교과등급 90%컷(최종등록자 전과목). 마스터 xlsx L열. 111건 — 2025학년도 전용, v1 화면 미노출.';



COMMENT ON COLUMN "public"."admission_results"."note" IS '적재 시 품질 플래그. 문구 정본은 로더 scripts/build-admission-results-csv.py 의 NOTE_RATE_ZERO / NOTE_CUT_INVERSION 상수다: ''경쟁률 0 → 결측 승격''(141건), ''50%컷 > 70%컷 (원문 유지)''(601건). 한 행에 둘 다 붙으면 ''; '' 로 잇는다. 값 보정은 하지 않고 플래그만 남긴다.';



COMMENT ON COLUMN "public"."admission_results"."grade_avg" IS '합격자 평균등급(전과목). 마스터 xlsx M열. 커버리지 0.33% — 유일하게 양연도에 값이 있는 신규 지표, v1 화면 미노출.';



COMMENT ON COLUMN "public"."admission_results"."grade_min" IS '합격자 최저등급(전과목). 마스터 xlsx N열. 89건 — 2026학년도 전용, v1 화면 미노출.';



COMMENT ON COLUMN "public"."admission_results"."grade_avg10" IS '합격자 평균등급(반영 10과목). 마스터 xlsx O열. 238건 — 2026학년도 전용, v1 화면 미노출.';



COMMENT ON COLUMN "public"."admission_results"."grade_min10" IS '합격자 최저등급(반영 10과목). 마스터 xlsx P열. 238건 — 2026학년도 전용, v1 화면 미노출.';



COMMENT ON COLUMN "public"."admission_results"."grade_first_avg" IS '최초합격자 평균등급. 마스터 xlsx Q열. 192건 — 2025학년도 전용, v1 화면 미노출.';



COMMENT ON COLUMN "public"."admission_results"."variant_seq" IS '동일 자연키 분할모집 변별자. 0=단일. 로더가 그룹 내 (quota desc, competition_rate desc, source_row asc) 정렬 순서로 결정적 부여.';



CREATE OR REPLACE VIEW "public"."admission_result_department_index" WITH ("security_invoker"='true') AS
 SELECT "university_key",
    "department_key",
    "min"("department_name") AS "department_name",
    "array_agg"(DISTINCT "main_track") FILTER (WHERE ("main_track" IS NOT NULL)) AS "tracks"
   FROM "public"."admission_results"
  WHERE (("university_key" IS NOT NULL) AND ("department_key" IS NOT NULL) AND ("is_active" = true))
  GROUP BY "university_key", "department_key";


ALTER VIEW "public"."admission_result_department_index" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."admission_result_university_index" WITH ("security_invoker"='true') AS
 SELECT "university_key",
    "min"("university_name") AS "university_name",
    "count"(DISTINCT "department_key") AS "dept_count"
   FROM "public"."admission_results"
  WHERE (("university_key" IS NOT NULL) AND ("is_active" = true))
  GROUP BY "university_key";


ALTER VIEW "public"."admission_result_university_index" OWNER TO "postgres";


ALTER TABLE "public"."admission_results" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."admission_results_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."admission_susi_results" (
    "id" bigint NOT NULL,
    "year" integer NOT NULL,
    "university_name" "text" NOT NULL,
    "department_name" "text" NOT NULL,
    "main_track" "text",
    "admission_type" "text",
    "quota" integer,
    "competition_rate" numeric,
    "waitlist_rank" "text",
    "converted_50" numeric,
    "converted_70" numeric,
    "converted_total" numeric,
    "grade_50" numeric,
    "grade_70" numeric,
    "grade_85" numeric,
    "grade_90" numeric,
    "subject_reflection" "text",
    "university_key" "text",
    "department_key" "text",
    "source_sheet" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."admission_susi_results" OWNER TO "postgres";


COMMENT ON TABLE "public"."admission_susi_results" IS 'DEPRECATED (2026-08-05): 통합 테이블 public.admission_results 로 대체됨(recruitment_period=''수시''). 로컬·dev·운영 전부 0행 확인 — 이관 대상 데이터 없음. 향후 DROP 후보.';



CREATE SEQUENCE IF NOT EXISTS "public"."admission_susi_results_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."admission_susi_results_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."admission_susi_results_id_seq" OWNED BY "public"."admission_susi_results"."id";



CREATE TABLE IF NOT EXISTS "public"."admission_universities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "region" "text" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0,
    "special_group" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."admission_universities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admission_university_resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admission_year" integer DEFAULT 2027 NOT NULL,
    "source_name" "text" DEFAULT '2027쎈(SEN)진학 Preview'::"text" NOT NULL,
    "source_version" "text" DEFAULT 'V.7월2일'::"text" NOT NULL,
    "region" "text" NOT NULL,
    "university_name" "text" NOT NULL,
    "university_key" "text" NOT NULL,
    "campus" "text",
    "previous_year_changes" "text",
    "selection_method" "text",
    "minimum_requirements" "text",
    "exam_schedule" "text",
    "school_record_method" "text",
    "recruitment_quota" "text",
    "jungsi_guideline_url" "text",
    "official_source_url" "text",
    "memo" "text",
    "detail_status" "text",
    "matched_hwp_name" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recruitment_result_html" "text",
    "matched_text_name" "text",
    "minimum_requirements_html" "text",
    "school_record_method_html" "text",
    "selection_method_html" "text",
    "exam_schedule_html" "text",
    "previous_year_changes_html" "text",
    "previous_year_changes_json" "jsonb",
    "selection_method_json" "jsonb",
    "minimum_requirements_json" "jsonb",
    "exam_schedule_json" "jsonb",
    "school_record_method_json" "jsonb",
    "recruitment_quota_json" "jsonb",
    CONSTRAINT "admission_resources_json_shape" CHECK (((("previous_year_changes_json" IS NULL) OR ("jsonb_typeof"("previous_year_changes_json") = 'object'::"text")) AND (("selection_method_json" IS NULL) OR ("jsonb_typeof"("selection_method_json") = 'object'::"text")) AND (("minimum_requirements_json" IS NULL) OR ("jsonb_typeof"("minimum_requirements_json") = 'object'::"text")) AND (("exam_schedule_json" IS NULL) OR ("jsonb_typeof"("exam_schedule_json") = 'object'::"text")) AND (("school_record_method_json" IS NULL) OR ("jsonb_typeof"("school_record_method_json") = 'object'::"text")) AND (("recruitment_quota_json" IS NULL) OR ("jsonb_typeof"("recruitment_quota_json") = 'object'::"text"))))
);


ALTER TABLE "public"."admission_university_resources" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."admission_university_resource_index" WITH ("security_invoker"='true') AS
 SELECT "id",
    "admission_year",
    "region",
    "university_name",
    "university_key",
    "matched_hwp_name",
    "matched_text_name",
    "campus",
    "detail_status",
    "jungsi_guideline_url",
    "is_active",
    (COALESCE("previous_year_changes", ''::"text") <> ''::"text") AS "has_previous_year_changes",
    (COALESCE("selection_method", ''::"text") <> ''::"text") AS "has_selection_method",
    (COALESCE("minimum_requirements", ''::"text") <> ''::"text") AS "has_minimum_requirements",
    (COALESCE("exam_schedule", ''::"text") <> ''::"text") AS "has_exam_schedule",
    (COALESCE("school_record_method", ''::"text") <> ''::"text") AS "has_school_record_method",
    (COALESCE("recruitment_quota", ''::"text") <> ''::"text") AS "has_recruitment_quota",
    (COALESCE("previous_year_changes_html", ''::"text") <> ''::"text") AS "has_previous_year_changes_html",
    (COALESCE("selection_method_html", ''::"text") <> ''::"text") AS "has_selection_method_html",
    (COALESCE("minimum_requirements_html", ''::"text") <> ''::"text") AS "has_minimum_requirements_html",
    (COALESCE("exam_schedule_html", ''::"text") <> ''::"text") AS "has_exam_schedule_html",
    (COALESCE("school_record_method_html", ''::"text") <> ''::"text") AS "has_school_record_method_html",
    (COALESCE("recruitment_result_html", ''::"text") <> ''::"text") AS "has_recruitment_result_html",
        CASE
            WHEN ("previous_year_changes_json" IS NULL) THEN false
            WHEN ("jsonb_typeof"(("previous_year_changes_json" -> 'blocks'::"text")) = 'array'::"text") THEN ("jsonb_array_length"(("previous_year_changes_json" -> 'blocks'::"text")) > 0)
            ELSE false
        END AS "has_previous_year_changes_json",
        CASE
            WHEN ("selection_method_json" IS NULL) THEN false
            WHEN ("jsonb_typeof"(("selection_method_json" -> 'blocks'::"text")) = 'array'::"text") THEN ("jsonb_array_length"(("selection_method_json" -> 'blocks'::"text")) > 0)
            ELSE false
        END AS "has_selection_method_json",
        CASE
            WHEN ("minimum_requirements_json" IS NULL) THEN false
            WHEN ("jsonb_typeof"(("minimum_requirements_json" -> 'blocks'::"text")) = 'array'::"text") THEN ("jsonb_array_length"(("minimum_requirements_json" -> 'blocks'::"text")) > 0)
            ELSE false
        END AS "has_minimum_requirements_json",
        CASE
            WHEN ("exam_schedule_json" IS NULL) THEN false
            WHEN ("jsonb_typeof"(("exam_schedule_json" -> 'blocks'::"text")) = 'array'::"text") THEN ("jsonb_array_length"(("exam_schedule_json" -> 'blocks'::"text")) > 0)
            ELSE false
        END AS "has_exam_schedule_json",
        CASE
            WHEN ("school_record_method_json" IS NULL) THEN false
            WHEN ("jsonb_typeof"(("school_record_method_json" -> 'blocks'::"text")) = 'array'::"text") THEN ("jsonb_array_length"(("school_record_method_json" -> 'blocks'::"text")) > 0)
            ELSE false
        END AS "has_school_record_method_json",
        CASE
            WHEN ("recruitment_quota_json" IS NULL) THEN false
            WHEN ("jsonb_typeof"(("recruitment_quota_json" -> 'blocks'::"text")) = 'array'::"text") THEN ("jsonb_array_length"(("recruitment_quota_json" -> 'blocks'::"text")) > 0)
            ELSE false
        END AS "has_recruitment_quota_json",
    "official_source_url"
   FROM "public"."admission_university_resources";


ALTER VIEW "public"."admission_university_resource_index" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_model_calls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone NOT NULL,
    "trace_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "service" "text" NOT NULL,
    "feature" "text" NOT NULL,
    "step" "text",
    "target_kind" "text",
    "target_id" "uuid",
    "profile_id" "uuid",
    "model" "text" NOT NULL,
    "prompt_version" "text",
    "attempt" integer DEFAULT 1 NOT NULL,
    "retry_reason" "text",
    "transport_attempt" integer DEFAULT 1 NOT NULL,
    "status" "text" NOT NULL,
    "error_code" "text",
    "error_message" "text",
    "finish_reason" "text",
    "prompt_tokens" integer,
    "output_tokens" integer,
    "cached_tokens" integer,
    "thoughts_tokens" integer,
    "total_tokens" integer,
    "input_chars" integer,
    "output_chars" integer,
    "latency_ms" integer NOT NULL,
    "validation" "text",
    "issue_codes" "text"[],
    "call_key" "text",
    CONSTRAINT "ai_model_calls_attempt_check" CHECK (("attempt" >= 1)),
    CONSTRAINT "ai_model_calls_kind_check" CHECK (("kind" = ANY (ARRAY['generate'::"text", 'embed'::"text"]))),
    CONSTRAINT "ai_model_calls_latency_ms_check" CHECK (("latency_ms" >= 0)),
    CONSTRAINT "ai_model_calls_service_check" CHECK (("service" = ANY (ARRAY['performance'::"text", 'growth'::"text", 'inquiry'::"text", 'selfeval'::"text", 'goal'::"text"]))),
    CONSTRAINT "ai_model_calls_status_check" CHECK (("status" = ANY (ARRAY['ok'::"text", 'error'::"text"]))),
    CONSTRAINT "ai_model_calls_transport_attempt_check" CHECK (("transport_attempt" >= 1)),
    CONSTRAINT "ai_model_calls_validation_check" CHECK (("validation" = ANY (ARRAY['ok'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."ai_model_calls" OWNER TO "postgres";


COMMENT ON COLUMN "public"."ai_model_calls"."call_key" IS '한 단계 안 병렬 호출을 구분하는 키. 예 batch:0, section:2-1, match, planDraft, step';



CREATE TABLE IF NOT EXISTS "public"."ai_retrieval_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone NOT NULL,
    "trace_id" "uuid" NOT NULL,
    "service" "text" NOT NULL,
    "feature" "text" NOT NULL,
    "step" "text",
    "target_kind" "text",
    "target_id" "uuid",
    "profile_id" "uuid",
    "kind" "text" NOT NULL,
    "knowledge_type" "text",
    "threshold" double precision,
    "match_count_requested" integer,
    "raw_hits" integer,
    "packed_hits" integer,
    "top_score" double precision,
    "source" "text",
    "degraded" boolean DEFAULT false NOT NULL,
    "injected_chars" integer,
    "embed_ms" integer,
    "latency_ms" integer NOT NULL,
    "status" "text" NOT NULL,
    "error_message" "text",
    "hit_resource_ids" "uuid"[],
    "cited_resource_ids" "uuid"[],
    CONSTRAINT "ai_retrieval_events_kind_check" CHECK (("kind" = ANY (ARRAY['knowledge'::"text", 'student_history'::"text"]))),
    CONSTRAINT "ai_retrieval_events_latency_ms_check" CHECK (("latency_ms" >= 0)),
    CONSTRAINT "ai_retrieval_events_service_check" CHECK (("service" = ANY (ARRAY['performance'::"text", 'growth'::"text", 'inquiry'::"text", 'selfeval'::"text", 'goal'::"text"]))),
    CONSTRAINT "ai_retrieval_events_source_check" CHECK ((("source" IS NULL) OR ("source" = ANY (ARRAY['vector'::"text", 'keyword'::"text", 'none'::"text", 'hybrid'::"text"])))),
    CONSTRAINT "ai_retrieval_events_status_check" CHECK (("status" = ANY (ARRAY['ok'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."ai_retrieval_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."alimtalk_send_logs" (
    "id" bigint NOT NULL,
    "template_key" "text" NOT NULL,
    "channel" "text" NOT NULL,
    "profile_id" "uuid",
    "phone" "text" NOT NULL,
    "subject" "text",
    "message" "text" NOT NULL,
    "status" "text" NOT NULL,
    "provider_code" "text",
    "provider_message" "text",
    "provider_msg_id" "text",
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dedupe_key" "text",
    CONSTRAINT "alimtalk_send_logs_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."alimtalk_send_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."alimtalk_send_logs" IS '알림톡·문자 발송 이력(20260822000015). 회원 상세 「알림톡·문자」 탭과 크론 실패 추적의 근거다. 인증번호 발송은 본문에 코드가 그대로 들어가 로그가 인증 우회 수단이 되므로 여기 남기지 않는다.';



COMMENT ON COLUMN "public"."alimtalk_send_logs"."dedupe_key" IS '중복 발송 방지 키(예: dailyReport:<profile_id>:2026-08-22). 부분 유니크 인덱스가 걸려 있어 두 번째 insert 가 23505 로 튕긴다 — 크론 재시도·중복 기동에서 같은 알림이 두 번 나가지 않게 한다.';



ALTER TABLE "public"."alimtalk_send_logs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."alimtalk_send_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."banners" (
    "id" bigint NOT NULL,
    "title" "text" NOT NULL,
    "highlight" "text",
    "subtitle" "text",
    "image_url" "text",
    "button_text" "text" DEFAULT '무료로 시작하기'::"text",
    "button_link" "text" DEFAULT '/signup'::"text",
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "display_seconds" integer DEFAULT 10 NOT NULL,
    CONSTRAINT "banners_display_seconds_check" CHECK ((("display_seconds" >= 1) AND ("display_seconds" <= 600)))
);


ALTER TABLE "public"."banners" OWNER TO "postgres";


COMMENT ON COLUMN "public"."banners"."display_seconds" IS '랜딩 캐러셀에서 이 배너가 머무는 시간(초), QA A8/A9 2026-08-27';



ALTER TABLE "public"."banners" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."banners_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."board_views" (
    "source" "text" NOT NULL,
    "post_id" "uuid" NOT NULL,
    "viewer_key" "text" NOT NULL,
    "viewed_on" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."board_views" OWNER TO "postgres";


COMMENT ON TABLE "public"."board_views" IS '게시판 조회수 1일 1회 중복 방지 대장. public.increment_board_view() RPC 경유로만 기록된다(RLS on / 정책 0건). viewer_key 는 해시이며 원본 IP 는 저장하지 않는다.';



CREATE TABLE IF NOT EXISTS "public"."bundle_items" (
    "product_id" "uuid" NOT NULL,
    "program_key" "text" NOT NULL,
    "duration_months" integer,
    "session_quota" integer,
    "validity_days" integer,
    "list_price" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bundle_items_duration_months_positive_check" CHECK ((("duration_months" IS NULL) OR ("duration_months" > 0))),
    CONSTRAINT "bundle_items_entitlement_shape_check" CHECK ((COALESCE("duration_months", "session_quota") IS NOT NULL)),
    CONSTRAINT "bundle_items_list_price_check" CHECK (("list_price" >= 0)),
    CONSTRAINT "bundle_items_session_quota_positive_check" CHECK ((("session_quota" IS NULL) OR ("session_quota" > 0))),
    CONSTRAINT "bundle_items_validity_days_positive_check" CHECK ((("validity_days" IS NULL) OR ("validity_days" > 0))),
    CONSTRAINT "bundle_items_validity_days_shape_check" CHECK ((("validity_days" IS NULL) OR ("duration_months" IS NULL)))
);


ALTER TABLE "public"."bundle_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."bundle_items" IS '패키지 상품(products) 1행이 부여하는 권한 목록. products.program_key(단일 권한) 의 다권한 확장 — 이 테이블에 행이 있는 product_id 는 fn_grant_program_access_for_order 가 이 테이블 행별로 program_access_grants 를 부여한다(products 자체의 program_key/duration_months/session_quota 는 이 경우 전부 NULL 로 둔다).';



COMMENT ON COLUMN "public"."bundle_items"."list_price" IS '이 구성 권한의 개별 정가(원). paid_amount 안분 기준 — 번들 판매가(products.price)를 이 값들의 비율로 나눠 program_access_grants.paid_amount 에 배분한다(fn_grant_program_access_for_order).';



COMMENT ON CONSTRAINT "bundle_items_entitlement_shape_check" ON "public"."bundle_items" IS 'products_entitlement_shape_check 와 동일 원칙 — 기간이나 회차 중 최소 하나는 있어야 한다.';



COMMENT ON CONSTRAINT "bundle_items_validity_days_shape_check" ON "public"."bundle_items" IS 'products.validity_days 와 동일 원칙(20260901001438) — 유효기간은 기간이 없는 상품(회차권)의 속성이라 duration_months 와 동시 보유를 금지한다.';



CREATE TABLE IF NOT EXISTS "public"."company_news" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text",
    "image_url" "text",
    "image_urls" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "file_url" "text",
    "file_name" "text",
    "attachments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_pinned" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category" "text",
    "view_count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."company_news" OWNER TO "postgres";


ALTER TABLE "public"."coupon_grants" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."coupon_grants_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."coupon_redemptions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."coupon_redemptions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."coupons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text",
    "title" "text" NOT NULL,
    "discount_amount" integer NOT NULL,
    "min_amount" integer DEFAULT 0 NOT NULL,
    "valid_until" "date",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "max_uses_per_user" integer,
    "max_redemptions" integer,
    "stackable" boolean DEFAULT false NOT NULL,
    "slug" "text" NOT NULL,
    "grant_type" "text" DEFAULT 'auto'::"text" NOT NULL,
    "grant_on_signup" boolean DEFAULT false NOT NULL,
    "org_code" "text",
    "tenant_id" "uuid",
    CONSTRAINT "coupons_cap_derived_from_grant_type_check" CHECK ((NOT ("max_uses_per_user" IS DISTINCT FROM
CASE
    WHEN ("grant_type" = 'granted'::"text") THEN 1
    ELSE NULL::integer
END))),
    CONSTRAINT "coupons_discount_amount_check" CHECK (("discount_amount" > 0)),
    CONSTRAINT "coupons_grant_on_signup_check" CHECK (((NOT "grant_on_signup") OR ("grant_type" = 'granted'::"text"))),
    CONSTRAINT "coupons_grant_type_check" CHECK (("grant_type" = ANY (ARRAY['auto'::"text", 'granted'::"text"]))),
    CONSTRAINT "coupons_max_redemptions_check" CHECK ((("max_redemptions" IS NULL) OR ("max_redemptions" > 0))),
    CONSTRAINT "coupons_max_uses_per_user_check" CHECK ((("max_uses_per_user" IS NULL) OR ("max_uses_per_user" > 0))),
    CONSTRAINT "coupons_min_amount_check" CHECK (("min_amount" >= 0)),
    CONSTRAINT "coupons_org_code_normalized_check" CHECK ((("org_code" IS NULL) OR ("org_code" = "upper"(TRIM(BOTH FROM "org_code")))))
);


ALTER TABLE "public"."coupons" OWNER TO "postgres";


COMMENT ON COLUMN "public"."coupons"."id" IS '대체키(surrogate key). 의미를 담지 않는다 — 사람이 읽는 핸들은 slug 다.';



COMMENT ON COLUMN "public"."coupons"."max_uses_per_user" IS '1인당 사용 가능 횟수. 기본값 1(사용자당 1회, 2026-08-11 P2-6). NULL = 무제한(상시 할인 쿠폰, 반드시 명시적으로 채워야 한다). 양의 정수 N = 사용자당 N회까지. 0/음수는 CHECK 로 금지.';



COMMENT ON COLUMN "public"."coupons"."max_redemptions" IS '쿠폰 전체 발행량 상한(사용자 무관, 게스트 포함). NULL = 무제한. fn_coupon_global_redeemed 가 이 값과 coupon_redemptions 건수를 비교해 판정한다.';



COMMENT ON COLUMN "public"."coupons"."stackable" IS '다른 쿠폰과 동시 적용 가능 여부. false(기본) = 비결합 — 같은 주문에 비결합 쿠폰이 여럿 선택되면 그중 할인액이 가장 큰 1장만 적용한다. true = stacking 대상에서 제외하고 항상 함께 적용한다.';



COMMENT ON COLUMN "public"."coupons"."slug" IS '사람이 읽는 안정 자연키. sql/ 시드의 멱등 충돌 대상이자 어드민 핸들. 구 text id 의 보존본이기도 하다(signup-6000 → signup-2000 만 실제 할인액으로 정정). 할인액이 바뀌면 이 값을 고치고 id 는 그대로 둔다.';



COMMENT ON COLUMN "public"."coupons"."grant_type" IS '쿠폰 배포 방식. auto(기본) = 조건형, 금액·기간 조건만 맞으면 누구나. granted = 발급형, coupon_grants 에 살아있는 발급 행이 있는 사용자만 사용 가능(fn_coupon_is_granted).';



COMMENT ON COLUMN "public"."coupons"."grant_on_signup" IS '가입 시 자동 발급 대상 여부. 1-j)절 on_auth_user_created_coupon_grant 트리거가 이 플래그로 발급 대상을 찾는다(slug 하드코딩 금지). grant_type=granted 인 쿠폰에만 켤 수 있다.';



COMMENT ON COLUMN "public"."coupons"."org_code" IS '2026-09-22 tenant_id로 대체됨, 읽기·쓰기 금지, 후속 PR에서 drop 예정.';



COMMENT ON CONSTRAINT "coupons_cap_derived_from_grant_type_check" ON "public"."coupons" IS 'max_uses_per_user 는 grant_type 의 파생값이다(2026-08-12 팀 리드 확정, sql/70). grant_type=''granted'' → max_uses_per_user 는 반드시 1, grant_type=''auto'' → 반드시 NULL. 이 등식이 대체하기 전 sql/68_enrollment_request_pair.sql 5-d-2)/5-d-3)절의 편측 CHECK 두 개(coupons_per_user_cap_requires_grant_check/coupons_granted_cap_is_one_check)는 granted+NULL 조합을 막지 못하는 구멍이 있었다 — `max_uses_per_user = 1` 이 `NULL = 1` 로 NULL 평가되어 CHECK 를 통과했기 때문이다(PostgreSQL CHECK 는 FALSE 일 때만 위반, NULL 은 통과). N>1 지원으로 이 파생을 풀어야 하는 날에는 이 제약 하나만 고치지 말 것 — sql/68 5-d-3)절의 coupons_granted_cap_is_one_check/coupon_redemptions_single_use_uidx(둘 다 "N=1 고정" 전제의 DB 백스톱)도 반드시 함께 재설계하라. CouponAdmin 화면이 grant_type↔max_uses_per_user 를 파생 관계로 그리지 않는 독립 입력 필드라면 그 UI 도 함께 복구해야 한다(sql/70 파일 상단 참고).';



COMMENT ON CONSTRAINT "coupons_discount_amount_check" ON "public"."coupons" IS '음수 할인이 fn_redeem_coupons 의 0원 방지 분기(least/>=subtotal)를 둘 다 우회해 결제 금액이 정가를 초과시키는 경로를 막는다(M14, 2026-08-11). 근거: sql/55_coupon_policy.sql fn_redeem_coupons 1642-1670행.';



CREATE OR REPLACE VIEW "public"."coupon_wallet_state" WITH ("security_invoker"='true') AS
 SELECT "g"."user_id",
    "c"."id" AS "coupon_id",
    "c"."slug",
    "c"."title",
    "c"."discount_amount",
    "c"."min_amount",
    "c"."valid_until",
    "c"."is_active",
    "c"."grant_type",
    "c"."max_uses_per_user",
    "g"."granted_at",
    "g"."granted_by",
    "g"."revoked_at",
    ( SELECT "count"(*) AS "count"
           FROM "public"."coupon_redemptions" "r"
          WHERE (("r"."coupon_id" = "c"."id") AND ("r"."user_id" = "g"."user_id") AND ("r"."voided_at" IS NULL))) AS "used_count",
        CASE
            WHEN ("c"."max_uses_per_user" IS NULL) THEN NULL::bigint
            ELSE GREATEST(("c"."max_uses_per_user" - ( SELECT "count"(*) AS "count"
               FROM "public"."coupon_redemptions" "r"
              WHERE (("r"."coupon_id" = "c"."id") AND ("r"."user_id" = "g"."user_id") AND ("r"."voided_at" IS NULL)))), (0)::bigint)
        END AS "remaining_count",
    "g"."valid_until" AS "grant_valid_until"
   FROM ("public"."coupon_grants" "g"
     JOIN "public"."coupons" "c" ON (("c"."id" = "g"."coupon_id")));


ALTER VIEW "public"."coupon_wallet_state" OWNER TO "postgres";


COMMENT ON VIEW "public"."coupon_wallet_state" IS '보유 쿠폰 지갑 표시용(근사치) — 결제 판정의 정본은 판정 함수(fn_coupon_is_redeemed 등)다. coupon_grants 에 행이 없는 auto 쿠폰은 나오지 않는다(정의상 보유물이 아님). remaining_count NULL=무제한. used_count 는 voided_at is null 만 세고 실패/시간창 제외 로직은 복제하지 않는다(sql/68 6절). valid_until 은 쿠폰 전체 기한, grant_valid_until 은 이 발급분의 기한이다 — 실제 사용 가능 기한은 둘 중 이른 날(20260825000010).';



CREATE TABLE IF NOT EXISTS "public"."daily_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entry_date" "date" DEFAULT CURRENT_DATE,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "phone" "text" DEFAULT ''::"text",
    "program_name" "text" DEFAULT ''::"text",
    "class_name" "text" DEFAULT ''::"text",
    "memo" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."daily_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_settlements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "settlement_date" "date" DEFAULT CURRENT_DATE,
    "total_sale_amount" integer DEFAULT 0,
    "total_discount_amount" integer DEFAULT 0,
    "total_paid_amount" integer DEFAULT 0,
    "total_refund_amount" integer DEFAULT 0,
    "memo" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."daily_settlements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."diagnosis_attempts" (
    "id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "ledger_id" "uuid",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "diagnosis_attempts_credit_needs_ledger" CHECK ((("kind" <> 'credit'::"text") OR ("ledger_id" IS NOT NULL))),
    CONSTRAINT "diagnosis_attempts_kind_check" CHECK (("kind" = ANY (ARRAY['free'::"text", 'credit'::"text"])))
);


ALTER TABLE "public"."diagnosis_attempts" OWNER TO "postgres";


COMMENT ON TABLE "public"."diagnosis_attempts" IS '학습진단 제출 시도 원장. kind=free 는 회원가입 1회 무료분(프로필당 1행, 부분 유니크), kind=credit 은 이용권 차감분(performance_credit_ledger 행과 1:1). id 는 클라이언트 생성 attempt uuid — consume_diagnosis_attempt 의 멱등 키.';



CREATE TABLE IF NOT EXISTS "public"."diagnosis_reports" (
    "attempt_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "schema_version" "text" NOT NULL,
    "diagnosed_at" timestamp with time zone NOT NULL,
    "snapshot" "jsonb" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."diagnosis_reports" OWNER TO "postgres";


COMMENT ON TABLE "public"."diagnosis_reports" IS '학습진단 리포트 영속본. attempt_id = diagnosis_attempts pk(시도 1건당 1행, upsert 멱등). snapshot 은 제출 시점 DiagnosisInput 전문, payload 는 조립된 리포트 본문(열람은 payload 로 렌더). 쓰기는 api/diagnosis/report(service_role) 경유만.';



CREATE TABLE IF NOT EXISTS "public"."faqs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question" "text" DEFAULT ''::"text" NOT NULL,
    "answer" "text" DEFAULT ''::"text",
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "category" "text" DEFAULT ''::"text" NOT NULL,
    "content_json" "jsonb"
);


ALTER TABLE "public"."faqs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."galleries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "content" "text" DEFAULT ''::"text",
    "image_url" "text" DEFAULT ''::"text",
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "image_urls" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "category" "text",
    "view_count" integer DEFAULT 0 NOT NULL,
    "published_at" timestamp with time zone,
    "is_featured" boolean DEFAULT false NOT NULL,
    "content_json" "jsonb"
);


ALTER TABLE "public"."galleries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."goal_advice_cache" (
    "id" bigint NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "source" "text" NOT NULL,
    "generated_for" "date" NOT NULL,
    "origin" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "goal_advice_cache_origin_check" CHECK (("origin" = ANY (ARRAY['ai'::"text", 'rule'::"text"]))),
    CONSTRAINT "goal_advice_cache_source_check" CHECK (("source" = ANY (ARRAY['intake'::"text", 'daily'::"text"])))
);


ALTER TABLE "public"."goal_advice_cache" OWNER TO "postgres";


COMMENT ON TABLE "public"."goal_advice_cache" IS 'QA 행295·306 AI 입시조언(intake) / 오늘의 조언·내일 계획(daily) 캐시 — 학생×소스×날짜 1행. api/goal/advice.ts 만 쓴다. 원본 target/App.tsx의 ai_advice_cache 테이블 대응(App.tsx 캐시는 학생당 1행이었으나 여기는 하루 1행 — 실제 달력 모델과 정합).';



COMMENT ON COLUMN "public"."goal_advice_cache"."source" IS '트리거 종류. intake=온보딩 완료 직후(§3.16), daily=오늘의 공부 기록 저장 성공 직후.';



COMMENT ON COLUMN "public"."goal_advice_cache"."generated_for" IS 'KST 날짜(goal_daily_records.record_date와 같은 규약) — 캐시 키의 날짜 축. 하루 지나면 재생성 대상이 된다.';



COMMENT ON COLUMN "public"."goal_advice_cache"."origin" IS 'ai=Gemini 생성, rule=Gemini 실패/GEMINI_API_KEY 미설정 시 규칙 기반 폴백. 대시보드 뱃지("AI 입시 분석 조언" ↔ "일일 분석 조언") 분기 근거.';



COMMENT ON COLUMN "public"."goal_advice_cache"."payload" IS '{ probabilitySummary, sections:[{label,body}], majorTips:[{department,text}] } — api/goal/advice.ts buildAdvicePayload() 계약. 두 origin이 동일한 shape을 쓴다(폴백도 문자열 상수가 아니다).';



ALTER TABLE "public"."goal_advice_cache" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."goal_advice_cache_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."goal_daily_records" (
    "id" bigint NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "record_index" integer NOT NULL,
    "record_date" "date" NOT NULL,
    "virtual_day_index" smallint GENERATED ALWAYS AS (((EXTRACT("isodow" FROM "record_date"))::integer - 1)) STORED,
    "submitted_on" "date" NOT NULL,
    "study_hours" numeric(4,1) DEFAULT 0 NOT NULL,
    "achievement" "text" DEFAULT ''::"text" NOT NULL,
    "focus" "text" DEFAULT ''::"text" NOT NULL,
    "body_condition" "text" DEFAULT ''::"text" NOT NULL,
    "reasons" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "tasks" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "memo" "text" DEFAULT ''::"text" NOT NULL,
    "target_ideal_hours" numeric(4,1) DEFAULT 0 NOT NULL,
    "target_min_hours" numeric(4,1) DEFAULT 0 NOT NULL,
    "delta_ideal_susi" numeric(8,4) DEFAULT 0 NOT NULL,
    "delta_ideal_jungsi" numeric(8,4) DEFAULT 0 NOT NULL,
    "delta_min_susi" numeric(8,4) DEFAULT 0 NOT NULL,
    "delta_min_jungsi" numeric(8,4) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "goal_daily_records_achievement_check" CHECK (("achievement" = ANY (ARRAY[''::"text", 'full'::"text", 'high'::"text", 'mid'::"text", 'low'::"text", 'none'::"text"]))),
    CONSTRAINT "goal_daily_records_body_condition_check" CHECK (("body_condition" = ANY (ARRAY[''::"text", 'great'::"text", 'normal'::"text", 'tired'::"text", 'exhausted'::"text"]))),
    CONSTRAINT "goal_daily_records_focus_check" CHECK (("focus" = ANY (ARRAY[''::"text", 'excellent'::"text", 'good'::"text", 'normal'::"text", 'low'::"text", 'veryLow'::"text"]))),
    CONSTRAINT "goal_daily_records_record_index_check" CHECK (("record_index" >= 0)),
    CONSTRAINT "goal_daily_records_study_hours_check" CHECK (("study_hours" >= (0)::numeric))
);


ALTER TABLE "public"."goal_daily_records" OWNER TO "postgres";


COMMENT ON TABLE "public"."goal_daily_records" IS '목표관리 일별 학습 기록 + 확률 증분. 원본 target/api/student.mjs 의 study_records 테이블 대응(upsert row: student.mjs:2649-2673). record_date 는 실제 날짜가 아니라 가상 날짜(actual_start_date + record_index)다. 쓰기는 service_role(api/goal/daily-record.js)만. sql/55_goal_management.sql 참고.';



COMMENT ON COLUMN "public"."goal_daily_records"."id" IS '대리 키. 원본 study_records 에는 없었다(원본 물리 키는 (code, date)) — goal_probability_logs.source_record_id 가 참조할 안정적인 대상이 필요해 신설했다. 논리 식별자는 (profile_id, record_index) 다.';



COMMENT ON COLUMN "public"."goal_daily_records"."profile_id" IS 'goal_students.profile_id. 원본은 study_records.code 로 조인했다(student.mjs:2650).';



COMMENT ON COLUMN "public"."goal_daily_records"."record_index" IS '0-base 학습 N일차 표시값. ⚠ 더 이상 (profile_id, record_index) 전역
    유일이 아니다 — actual_start_date 가 재온보딩(api/goal/intake.js:754)
    으로 바뀌면 같은 record_index 가 다른 record_date 에 재사용될 수 있다.
    유일성은 (profile_id, record_date) 만 보장한다(goal_daily_records_date_key,
    api/_lib/goalRepo.js:442 onConflict). 원래는 학생당 전역 유일한 정본
    충돌키로 설계됐으나(원본 study_records.sequence, student.mjs:2669) D-8
    재설계로 실제 달력이 정본이 되며 이 컬럼은 record_date 의 파생값
    (record_index = diffDaysYMD(actual_start_date, record_date),
    api/goal/daily-record.js:236)으로 역전됐다. sql/82_goal_daily_records_drop_index_key.sql
    참고.';



COMMENT ON COLUMN "public"."goal_daily_records"."record_date" IS '가상 날짜 = getRecordDateFromActualStart(goal_students.actual_start_date, record_index)(virtualDate.js:54-66). 원본 study_records.date(student.mjs:2651·2632). 실제 달력과 어긋나는 것이 정상이다.';



COMMENT ON COLUMN "public"."goal_daily_records"."virtual_day_index" IS '가상 날짜의 요일(월=0 … 일=6). record_date 의 순함수라 generated column 으로 둔다 — 원본은 직접 저장해(student.mjs:2670) 갱신 누락 시 조용히 어긋날 수 있었다. getDayIndexFromYMDServer(virtualDate.js:72-78) 규약과 동일하다.';



COMMENT ON COLUMN "public"."goal_daily_records"."submitted_on" IS '실제 제출일(KST). 원본에 없는 신설 감사 컬럼. 가상 날짜(record_date)와의 괴리 진단용이며 계산에는 쓰이지 않는다. 하루 1건 UNIQUE 는 걸지 않는다 — 원본 규약("제출 N번 = N일차")에 주차 산정이 동결돼 있다(student.mjs:841).';



COMMENT ON COLUMN "public"."goal_daily_records"."study_hours" IS '그날 순공부 시간. 원본 study_records.study_hours(student.mjs:2652). calculateDailyBonus(bonus.js:174-260)의 주 입력이다.';



COMMENT ON COLUMN "public"."goal_daily_records"."achievement" IS '성취도. v1(원본 study_records.achievement, student.mjs:2654) 전용 컬럼이었으나 v2 수식(bonusV2.js calculateDailyBonusV2 — 달성률배수×컨디션배수×과목태그배수 3종만 곱한다)은 이 값을 읽지 않는다. api/goal/daily-record.js는 항상 빈 문자열로 저장한다. 스키마·CHECK는 sql/55_goal_management.sql 원판 그대로 유지(재구현하지 않음) — 향후 v1 계산으로 되돌릴 가능성을 열어 둔다.';



COMMENT ON COLUMN "public"."goal_daily_records"."focus" IS '집중도. achievement와 동일한 사유로 v2에서 미사용, ''(빈 문자열) 고정 저장. 원본 study_records.focus(student.mjs:2655), FOCUS_MULTIPLIER(bonus.js:36-42)는 v1 전용이다.';



COMMENT ON COLUMN "public"."goal_daily_records"."body_condition" IS '컨디션. 신시안 "오늘의 공부 기록"(#26) 4지선다 — great(아주 좋음)/normal(보통)/tired(피곤함)/exhausted(힘듦), 빈 문자열은 대시보드 카드-only 제출(컨디션 미입력)이다. src/lib/goal/calc/bonusV2.js CONDITION_MULTIPLIER(great=1.1/normal=1.0/tired=0.9/exhausted=0.8)의 곱셈 입력이다 — v1(원본 study_records.condition, student.mjs:2656)의 good/normal/bad 3지 값 도메인과 "계산에 쓰이지 않는 표시 전용" 서술은 sql/73_goal_daily_record_v2.sql로 대체됐다. 원본 achievement/focus 자기평가 항목은 v2 UI에 없다.';



COMMENT ON COLUMN "public"."goal_daily_records"."reasons" IS '학습 방해 요인 다중선택. 원본 study_records.reasons(student.mjs:2658). CHECK 를 걸지 않는다 — 화면에 그대로 뜨는 편집 가능한 카피라 45_faq_renewal.sql 의 카테고리 CHECK 기각 논리와 같다. 입력 통제는 서버 화이트리스트 상수가 맡는다(api/create-consult-request.js:18-26 관례).';



COMMENT ON COLUMN "public"."goal_daily_records"."tasks" IS '학습 항목 다중선택. 원본 study_records.tasks(student.mjs:2659). CHECK 미부여 사유는 reasons 와 동일하나, 이쪽은 calculateDailyBonus 의 다양성 가산 입력이기도 하다(bonus.js).';



COMMENT ON COLUMN "public"."goal_daily_records"."memo" IS '자유 메모. 원본 study_records.memo(student.mjs:2660).';



COMMENT ON COLUMN "public"."goal_daily_records"."target_ideal_hours" IS '그날 적용된 이상 목표 시간. 원본에 없는 신설 컬럼 — study_schedule 이 나중에 바뀌어도 그날 증분의 산출 근거를 재현할 수 있어야 한다. ⚠ 일요일 보충 목표 로직(원본 getSundayRemainingScheduleFromRecords)은 미이식이라 study_schedule.sunday 값을 그대로 넣는다(미결 Q4).';



COMMENT ON COLUMN "public"."goal_daily_records"."target_min_hours" IS '그날 적용된 최소 목표 시간. 신설 컬럼, 사유는 target_ideal_hours 와 동일.';



COMMENT ON COLUMN "public"."goal_daily_records"."delta_ideal_susi" IS '그날 획득한 이상 목표 수시 확률 증분(%). 원본 study_records.ideal_susi_bonus(student.mjs:2664). 원본은 브라우저가 계산한 값을 그대로 저장했으나(App.tsx:1620-1631) 우리는 서버가 calculateDailyBonus(bonus.js:174-260)로 계산한다 — 이 테이블에 클라이언트 write 정책이 없는 이유가 이 컬럼이다. 0시간 제출 시 음수.';



COMMENT ON COLUMN "public"."goal_daily_records"."delta_ideal_jungsi" IS '이상 목표 정시 확률 증분. 원본 study_records.ideal_jungsi_bonus(student.mjs:2665).';



COMMENT ON COLUMN "public"."goal_daily_records"."delta_min_susi" IS '최소 목표 수시 확률 증분. 원본 study_records.min_susi_bonus(student.mjs:2666).';



COMMENT ON COLUMN "public"."goal_daily_records"."delta_min_jungsi" IS '최소 목표 정시 확률 증분. 원본 study_records.min_jungsi_bonus(student.mjs:2667). 원본의 calculated_bonus(student.mjs:2662)와 응답 별칭 susi_bonus/jungsi_bonus 는 idealSusiBonus 와 항상 같은 값이라(bonus.js:249) 이식하지 않았다.';



COMMENT ON COLUMN "public"."goal_daily_records"."created_at" IS '행 생성 시각(실제 시각). 대시보드·차트 조회 인덱스의 정렬 키다 — 가상 날짜 record_date 와 혼동하지 마라.';



COMMENT ON COLUMN "public"."goal_daily_records"."updated_at" IS '마지막 갱신 시각. 트리거 trg_goal_daily_records_updated_at 이 채운다. 같은 record_index 로 재제출(upsert)하면 갱신된다.';



COMMENT ON COLUMN "public"."goal_daily_records"."submitted_at" IS 'QA3 행305 — 12시간 쿨다운 판정 기준 시각. api/goal/daily-record.ts POST가 저장 성공마다 now()로 덮어쓴다. record_date(가상 날짜)와 달리 실제 KST 시각 그대로다. 기존 행 백필값 = coalesce(updated_at, created_at).';



ALTER TABLE "public"."goal_daily_records" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."goal_daily_records_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."goal_direction_reports" (
    "id" bigint NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_label" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "snapshot" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "goal_direction_reports_kind_check" CHECK (("kind" = ANY (ARRAY['naesin'::"text", 'jungsi'::"text"]))),
    CONSTRAINT "goal_direction_reports_source_type_check" CHECK (("source_type" = ANY (ARRAY['intake'::"text", 'naesin'::"text", 'mogo'::"text"])))
);


ALTER TABLE "public"."goal_direction_reports" OWNER TO "postgres";


COMMENT ON TABLE "public"."goal_direction_reports" IS '학습방향 리포트(#37 내신 / #38 정시) 생성·저장 이력(QA 행301). 원본 target learning_direction_reports 대응(target-app-analysis.md §2.10) — kind별 스냅샷 컬럼을 snapshot 하나로 합친 점만 다르다. 생성 시점 3곳: (a) 온보딩 성공 시 kind별 1건(source_type=intake, source_label=''내 현재 위치''), (b) api/goal/grades.ts POST 성공 시 해당 kind 1건(source_type=naesin|mogo, source_label=시험 라벨), (c) 저장 리포트 0건인 기존 학생의 GET 조회 시 lazy 생성. 쓰기는 service_role(api/_lib/goalDirectionReport.ts 호출부)만.';



COMMENT ON COLUMN "public"."goal_direction_reports"."profile_id" IS 'goal_students.profile_id(≡auth.users.id). 소유자 판정은 언제나 세션 토큰에서 얻은 profileId로만 한다(api/_lib/goalRepo.ts openGoalSession 관례).';



COMMENT ON COLUMN "public"."goal_direction_reports"."source_type" IS '생성 트리거. intake=온보딩 직후, naesin=api/goal/grades.ts 내신 성적 저장, mogo=api/goal/grades.ts 모의고사 성적 저장. 원본 CHECK 도메인 그대로(target-app-analysis.md §2.10 source_type 열).';



COMMENT ON COLUMN "public"."goal_direction_reports"."source_label" IS '표시용 출처 라벨 — intake는 ''내 현재 위치'' 고정, naesin/mogo는 해당 회차의 term(예: ''고3 6월 모의고사''). 회차 칩(periodChips) 표시 문자열이자 (profile_id, kind, source_type, source_label) 유일 식별자의 일부다.';



COMMENT ON COLUMN "public"."goal_direction_reports"."kind" IS '리포트 종류. naesin=#37 내신 탭, jungsi=#38 정시 탭.';



COMMENT ON COLUMN "public"."goal_direction_reports"."payload" IS 'LearningDirectionReportPayload 전문(jsonb) — scaleMax/overallAverage/subjectAverage[]/studentType/subjectReports[](피라미드 레벨·방향 문구·추천 교재 포함). api/_lib/goalDirectionReport.ts buildGoalDirectionReport()의 반환값을 그대로 저장한다(GET 응답이 그대로 되돌려준다).';



COMMENT ON COLUMN "public"."goal_direction_reports"."snapshot" IS '생성 당시 입력 원본(jsonb) — 재현·감사용. naesin_scores.groupAverages 또는 legacy 회차 엔트리(mock_exam_scores.rounds 또는 records[]) 중 실제로 쓰인 것을 그대로 담는다. 원본 naesin_snapshot/jungsi_snapshot 두 컬럼을 kind로 이미 갈리는 이 테이블에서는 하나로 합쳤다.';



COMMENT ON COLUMN "public"."goal_direction_reports"."created_at" IS '리포트 생성 시각 — 회차 칩 정렬(최신순) 키.';



ALTER TABLE "public"."goal_direction_reports" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."goal_direction_reports_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."goal_mentor_comments" (
    "id" bigint NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "period_type" "text" NOT NULL,
    "period_key" "text" NOT NULL,
    "body" "text" NOT NULL,
    "written_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "goal_mentor_comments_body_check" CHECK ((("char_length"("body") >= 1) AND ("char_length"("body") <= 2000))),
    CONSTRAINT "goal_mentor_comments_check" CHECK (((("period_type" = 'weekly'::"text") AND ("period_key" ~ '^\d{4}-\d{2}-\d{2}$'::"text")) OR (("period_type" = 'monthly'::"text") AND ("period_key" ~ '^\d{4}-\d{2}$'::"text")))),
    CONSTRAINT "goal_mentor_comments_period_type_check" CHECK (("period_type" = ANY (ARRAY['weekly'::"text", 'monthly'::"text"])))
);


ALTER TABLE "public"."goal_mentor_comments" OWNER TO "postgres";


COMMENT ON TABLE "public"."goal_mentor_comments" IS '목표관리 성장 리포트(#33/#34) 멘토 코멘트. 기간(주/월)당 1건, upsert 대상. 쓰기 어드민 UI는 후속 — 이번 단계는 api/goal/report.js 의 select 전용. sql/79_goal_mentor_comments.sql 참고.';



COMMENT ON COLUMN "public"."goal_mentor_comments"."profile_id" IS 'goal_students.profile_id(≡auth.users.id). 소유자 판정은 언제나 세션 토큰에서 얻은 profileId 로만 한다(api/_lib/goalRepo.js openGoalSession 관례).';



COMMENT ON COLUMN "public"."goal_mentor_comments"."period_type" IS '리포트 종류. weekly=주간 성장 리포트(#33), monthly=월간 성장 리포트(#34). 학습방향 리포트(#37/#38)는 다루지 않는다.';



COMMENT ON COLUMN "public"."goal_mentor_comments"."period_key" IS '기간 키 — weekly는 그 주 월요일 YMD, monthly는 YYYY-MM. src/lib/goal/report/aggregate.js resolveWeeklyPeriod/resolveMonthlyPeriod 의 periodKey 와 글자 단위로 같아야 조회가 맞는다(가상 주차·ISO 주차 아님, 순수 달력).';



COMMENT ON COLUMN "public"."goal_mentor_comments"."body" IS '코멘트 본문. 1~2000자 방어적 상한(리포트 카드가 무한정 늘어나는 것을 막는다).';



COMMENT ON COLUMN "public"."goal_mentor_comments"."written_at" IS '작성 시각. 리포트 카드의 "YYYY-MM-DD 작성" 표기가 이 값을 KST로 잘라 쓴다.';



COMMENT ON COLUMN "public"."goal_mentor_comments"."updated_at" IS '마지막 갱신 시각. 트리거 trg_goal_mentor_comments_updated_at 이 공용 public.set_updated_at()(00_base_schema.sql:1432)으로 채운다.';



ALTER TABLE "public"."goal_mentor_comments" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."goal_mentor_comments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."goal_plan_tasks" (
    "id" bigint NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "plan_date" "date" NOT NULL,
    "title" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "duration_minutes" integer DEFAULT 0 NOT NULL,
    "done" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "workbook_id" bigint,
    "page_from" integer,
    "page_to" integer,
    CONSTRAINT "goal_plan_tasks_duration_minutes_check" CHECK (("duration_minutes" >= 0)),
    CONSTRAINT "goal_plan_tasks_page_range_check" CHECK ((("page_from" IS NULL) OR ("page_to" IS NULL) OR ("page_from" <= "page_to"))),
    CONSTRAINT "goal_plan_tasks_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'done'::"text", 'fail'::"text"]))),
    CONSTRAINT "goal_plan_tasks_subject_check" CHECK (("subject" = ANY (ARRAY['korean'::"text", 'math'::"text", 'english'::"text", 'science'::"text", 'social'::"text", 'history'::"text", 'second_lang'::"text", 'etc'::"text"]))),
    CONSTRAINT "goal_plan_tasks_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 100)))
);


ALTER TABLE "public"."goal_plan_tasks" OWNER TO "postgres";


COMMENT ON TABLE "public"."goal_plan_tasks" IS '목표관리 학습 계획 과제 — 주간 계획표(WeeklyPlan.jsx)와 대시보드 "오늘 학습 계획" 레일(StudyPlanRail.jsx)이 공유하는 단일 테이블. 원본 외부 앱(target)에 대응 테이블 없음(신규 기능). 쓰기는 service_role(api/goal/plan-tasks.js)만. sql/75_goal_plan_tasks.sql 참고.';



COMMENT ON COLUMN "public"."goal_plan_tasks"."profile_id" IS 'goal_students.profile_id(≡auth.users.id). 소유자 판정은 언제나 세션 토큰에서 얻은 profileId로만 한다(api/_lib/goalRepo.js openGoalSession 관례) — 클라이언트가 보낸 어떤 id도 신뢰하지 않는다.';



COMMENT ON COLUMN "public"."goal_plan_tasks"."plan_date" IS '과제가 배정된 실제 달력 날짜(YYYY-MM-DD). goal_daily_records.record_date(가상 날짜)와 무관한 별개 개념이다.';



COMMENT ON COLUMN "public"."goal_plan_tasks"."title" IS '과제 내용(자유 입력). 길이 제약은 AddTaskModal 폼에 명시적 max가 없어 방어적으로 100자로 둔다.';



COMMENT ON COLUMN "public"."goal_plan_tasks"."subject" IS '과목 코드 5종. 한글 라벨(국어/수학/영어/탐구/기타)과의 매핑은 api/_lib/goalRepo.js SUBJECT_CODE_TO_LABEL/SUBJECT_LABEL_TO_CODE가 담당한다 — DB에는 코드값만 저장한다.';



COMMENT ON COLUMN "public"."goal_plan_tasks"."duration_minutes" IS '예상 소요 시간(분). AddTaskModal "예상 소요 시간" 셀렉트 라벨(예: "1시간 30분")을 분으로 환산한 값 — 라벨 자체는 저장하지 않는다.';



COMMENT ON COLUMN "public"."goal_plan_tasks"."done" IS '완료 여부(하위 호환 파생 컬럼, QA 행305 이전). 단일 원본은 status — 쓰기 경로가 항상 done = (status=''done'')로 함께 갱신한다. 신규 소비처는 status를 직접 읽어야 한다.';



COMMENT ON COLUMN "public"."goal_plan_tasks"."sort_order" IS '같은 plan_date 안에서의 표시 순서. 이번 범위는 항상 0(재정렬 UI 없음) — 컬럼만 선점해 둔다.';



COMMENT ON COLUMN "public"."goal_plan_tasks"."created_at" IS '행 생성 시각.';



COMMENT ON COLUMN "public"."goal_plan_tasks"."updated_at" IS '마지막 갱신 시각. 트리거 trg_goal_plan_tasks_updated_at이 공용 public.set_updated_at()(00_base_schema.sql:1432)으로 채운다.';



COMMENT ON COLUMN "public"."goal_plan_tasks"."status" IS '과제 상태 3종(pending/done/fail) — 단일 원본. 대시보드 체크(✓)는 done↔pending, ✕는 fail↔pending을 토글한다(api/goal/plan-tasks.ts). done boolean 컬럼은 하위 호환용 파생값으로 계속 함께 갱신된다.';



COMMENT ON COLUMN "public"."goal_plan_tasks"."workbook_id" IS '연결된 문제집(goal_workbooks.id), 선택. 문제집이 삭제되면 NULL로 풀린다(과제 자체는 남음). api/goal/plan-tasks.ts가 같은 profile 소유인지 검증한다.';



COMMENT ON COLUMN "public"."goal_plan_tasks"."page_from" IS '연결된 문제집 안에서 이 과제가 다루는 시작 페이지, 선택. workbook_id 없이 단독으로는 의미 없다(검증은 API 담당, DB는 순서 관계만 CHECK).';



COMMENT ON COLUMN "public"."goal_plan_tasks"."page_to" IS '연결된 문제집 안에서 이 과제가 다루는 끝 페이지, 선택. status가 done으로 바뀌고 이 값이 있으면 api/goal/plan-tasks.ts가 goal_workbooks.current_page를 max(current_page, page_to)로 전진시킨다(상한은 total_pages, 자동 완독/책장 이동은 하지 않음).';



ALTER TABLE "public"."goal_plan_tasks" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."goal_plan_tasks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."goal_probability_logs" (
    "id" bigint NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "ideal_susi" numeric(8,4) NOT NULL,
    "ideal_jungsi" numeric(8,4),
    "min_susi" numeric(8,4) NOT NULL,
    "min_jungsi" numeric(8,4),
    "reason" "text" NOT NULL,
    "source_record_id" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "goal_probability_logs_reason_check" CHECK (("reason" = ANY (ARRAY['intake'::"text", 'daily_record'::"text", 'score_update'::"text"])))
);


ALTER TABLE "public"."goal_probability_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."goal_probability_logs" IS '확률 추이 차트용 append-only 스냅샷. 원본 target/api/student.mjs 의 student_logs 테이블 대응(insert: student.mjs:1031-1038). 원본 이름은 무엇을 담는지 알 수 없어 개명했다 — 실제 내용은 확률 4종뿐이다. 원본과 달리 값이 실제로 바뀐 경우에만 기록한다. sql/55_goal_management.sql 참고.';



COMMENT ON COLUMN "public"."goal_probability_logs"."id" IS '대리 키. append-only 라 정렬·페이지네이션 보조로만 쓴다.';



COMMENT ON COLUMN "public"."goal_probability_logs"."profile_id" IS 'goal_students.profile_id. 원본은 student_logs.code 로 조인했다(student.mjs:1033).';



COMMENT ON COLUMN "public"."goal_probability_logs"."ideal_susi" IS '스냅샷 시점의 이상 목표 수시 현재확률(%). 원본 student_logs.ideal_susi(student.mjs:1034) — 원본도 여기서 min(100,max(0, base + Σbonus)) 로 **합계에 클램프**를 건다. 이 파일이 현재확률을 캐시 컬럼으로 두지 않는 근거다.';



COMMENT ON COLUMN "public"."goal_probability_logs"."ideal_jungsi" IS '이상 목표 정시 현재확률. 원본 student_logs.ideal_jungsi(student.mjs:1035).';



COMMENT ON COLUMN "public"."goal_probability_logs"."min_susi" IS '최소 목표 수시 현재확률. 원본 student_logs.min_susi(student.mjs:1036).';



COMMENT ON COLUMN "public"."goal_probability_logs"."min_jungsi" IS '최소 목표 정시 현재확률. 원본 student_logs.min_jungsi(student.mjs:1037).';



COMMENT ON COLUMN "public"."goal_probability_logs"."reason" IS '스냅샷을 만든 원인. 원본에 없는 신설 컬럼 — 원본은 호출 지점 3곳(student.mjs:2601 온보딩·:2699 일별기록·:3079 성적수정)을 사후에 구분할 방법이 없었다.';



COMMENT ON COLUMN "public"."goal_probability_logs"."source_record_id" IS '이 스냅샷을 만든 goal_daily_records 행. reason 이 daily_record 가 아니면 null. 신설 컬럼.';



COMMENT ON COLUMN "public"."goal_probability_logs"."created_at" IS '스냅샷 시각 = 확률 추이 차트의 x축. append-only 테이블이라 updated_at 은 두지 않는다.';



ALTER TABLE "public"."goal_probability_logs" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."goal_probability_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."goal_schedules" (
    "id" bigint NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "category" "text" NOT NULL,
    "due_date" "date" NOT NULL,
    "memo" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "goal_schedules_category_check" CHECK (("category" = ANY (ARRAY['performance'::"text", 'exam'::"text", 'deadline'::"text", 'etc'::"text"]))),
    CONSTRAINT "goal_schedules_title_check" CHECK ((("char_length"("btrim"("title")) >= 1) AND ("char_length"("btrim"("title")) <= 100)))
);


ALTER TABLE "public"."goal_schedules" OWNER TO "postgres";


COMMENT ON TABLE "public"."goal_schedules" IS '목표관리 중요일정(수행평가/시험/제출마감/기타). 학생당 다건. 쓰기는 service_role(api/goal/schedules.js)만, 읽기는 본인과 어드민. sql/74_goal_schedules.sql 참고.';



COMMENT ON COLUMN "public"."goal_schedules"."profile_id" IS 'goal_students.profile_id. 학생 탈퇴(auth.users 삭제 → goal_students cascade) 시 함께 삭제된다.';



COMMENT ON COLUMN "public"."goal_schedules"."title" IS '일정 이름. 트림 1~100자(goal_schedules_title_check).';



COMMENT ON COLUMN "public"."goal_schedules"."category" IS '일정 종류. 값 4종 고정 — 화면 라벨은 서버(api/goal/schedules.js)가 매핑한다(performance→수행평가 등).';



COMMENT ON COLUMN "public"."goal_schedules"."due_date" IS '마감일(실제 캘린더 날짜). D-day 표시는 클라이언트가 오늘(KST) 기준으로 매번 계산한다 — 이 컬럼에는 저장하지 않는다.';



COMMENT ON COLUMN "public"."goal_schedules"."memo" IS '자유 메모(선택). 빈 문자열 허용.';



COMMENT ON COLUMN "public"."goal_schedules"."updated_at" IS '마지막 갱신 시각. 트리거 trg_goal_schedules_updated_at 이 공용 public.set_updated_at()(00_base_schema.sql:1432)으로 채운다.';



ALTER TABLE "public"."goal_schedules" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."goal_schedules_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."goal_students" (
    "profile_id" "uuid" NOT NULL,
    "school_type" "text" NOT NULL,
    "grade" "text" NOT NULL,
    "ideal_university" "text" DEFAULT ''::"text" NOT NULL,
    "ideal_department" "text" DEFAULT ''::"text" NOT NULL,
    "min_university" "text" DEFAULT ''::"text" NOT NULL,
    "min_department" "text" DEFAULT ''::"text" NOT NULL,
    "ideal_naesin_cut" numeric(4,2),
    "ideal_jungsi_cut" numeric(5,2),
    "min_naesin_cut" numeric(4,2),
    "min_jungsi_cut" numeric(5,2),
    "current_score" numeric(4,1),
    "converted_grade" numeric(6,4),
    "current_mogo" numeric(6,2),
    "remain_naesin" smallint DEFAULT 0 NOT NULL,
    "remain_mogo" smallint DEFAULT 0 NOT NULL,
    "last_naesin_exam" "text" DEFAULT ''::"text" NOT NULL,
    "last_mogo_exam" "text" DEFAULT ''::"text" NOT NULL,
    "naesin_scores" "jsonb",
    "mock_exam_scores" "jsonb",
    "base_ideal_susi" numeric(4,1),
    "base_ideal_jungsi" numeric(4,1),
    "base_min_susi" numeric(4,1),
    "base_min_jungsi" numeric(4,1),
    "rate_ideal_susi" numeric(8,4),
    "rate_ideal_jungsi" numeric(8,4),
    "rate_min_susi" numeric(8,4),
    "rate_min_jungsi" numeric(8,4),
    "study_schedule" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "week_ideal" numeric(5,1) DEFAULT 0 NOT NULL,
    "week_min" numeric(5,1) DEFAULT 0 NOT NULL,
    "actual_start_date" "date",
    "onboarded_at" timestamp with time zone,
    "status" "text" DEFAULT 'awaiting_cuts'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "week_schedule_input" "jsonb",
    CONSTRAINT "goal_students_school_type_check" CHECK (("school_type" = ANY (ARRAY['일반고'::"text", '특목고'::"text", '특목,자사,영재고'::"text", '중학교'::"text", '초등학교'::"text"]))),
    CONSTRAINT "goal_students_status_check" CHECK (("status" = ANY (ARRAY['awaiting_cuts'::"text", 'active'::"text", 'paused'::"text"]))),
    CONSTRAINT "goal_students_study_schedule_check" CHECK (("jsonb_typeof"("study_schedule") = 'object'::"text"))
);


ALTER TABLE "public"."goal_students" OWNER TO "postgres";


COMMENT ON TABLE "public"."goal_students" IS '목표관리 학생 마스터(사용자당 1행). 원본 target/api/student.mjs 의 student 테이블 대응(upsert row: student.mjs:2482-2529). 쓰기는 service_role(api/goal/*.js)만, 읽기는 본인과 어드민. sql/55_goal_management.sql 참고.';



COMMENT ON COLUMN "public"."goal_students"."profile_id" IS 'auth.users.id. 원본 student.code(text UNIQUE, student.mjs:2483·2533 onConflict)와 student.main_id 를 둘 다 대체한다. code 는 무인증 IDOR 의 근원이라 폐기했고, main_id 는 auth.getUser(token).user.id 로 매번 얻는다(api/check-service-access.js:52).';



COMMENT ON COLUMN "public"."goal_students"."school_type" IS '학교 유형 한글 리터럴. 원본 student.school_type(student.mjs:2486). getSchoolCutType(primitives.js:43-47)이 "특목,자사,영재고"/"특목고" 두 리터럴만 special 로 판정하므로 온보딩 코드값(general/special)을 저장하면 안 된다.';



COMMENT ON COLUMN "public"."goal_students"."grade" IS '학년 한글 리터럴(고1/고2/고3 등). 원본 student.grade(student.mjs:2487). calcStudentBonusRates 의 학년 오프셋 사슬이 "고1"/"고2" 리터럴 비교다(bonus.js:112-122).';



COMMENT ON COLUMN "public"."goal_students"."ideal_university" IS '이상 목표 대학명. 원본 student.ideal_univ(student.mjs:2489). 원본은 이 값의 공백 여부로 온보딩 완료를 판정했으나(student.mjs:1959-1962) 우리는 onboarded_at 을 쓴다.';



COMMENT ON COLUMN "public"."goal_students"."ideal_department" IS '이상 목표 학과명. 원본 student.ideal_dept(student.mjs:2490). getStudyMultiplier 입력이자 goal_university_cuts 조회 키.';



COMMENT ON COLUMN "public"."goal_students"."min_university" IS '최소 목표 대학명. 원본 student.min_univ(student.mjs:2494).';



COMMENT ON COLUMN "public"."goal_students"."min_department" IS '최소 목표 학과명. 원본 student.min_dept(student.mjs:2495).';



COMMENT ON COLUMN "public"."goal_students"."ideal_naesin_cut" IS '이상 목표 수시 내신 컷(등급 1~9, 작을수록 우세). 원본 student.ideal_naesin_cut(student.mjs:2499), 출처는 getUnivCut(schoolCutType, ...)(student.mjs:984-998, 호출 2442). 온보딩 시점 스냅샷이라 goal_university_cuts 가 갱신돼도 따라 바뀌지 않는다.';



COMMENT ON COLUMN "public"."goal_students"."ideal_jungsi_cut" IS '이상 목표 정시 백분위 컷(0~100, 클수록 우세). 원본 student.ideal_jungsi_cut(student.mjs:2500), 출처는 getUnivCut("jungsi", ...)(student.mjs:2443).';



COMMENT ON COLUMN "public"."goal_students"."min_naesin_cut" IS '최소 목표 수시 내신 컷. 원본 student.min_naesin_cut(student.mjs:2501, 호출 2444).';



COMMENT ON COLUMN "public"."goal_students"."min_jungsi_cut" IS '최소 목표 정시 백분위 컷. 원본 student.min_jungsi_cut(student.mjs:2502, 호출 2445).';



COMMENT ON COLUMN "public"."goal_students"."current_score" IS '내신 평균 등급 1~9. 원본 student.current_score(student.mjs:2504)에는 등급/5등급제 원점수/0~100 평균점수 3종이 섞였으나(student.mjs:646-651) 우리 온보딩 Step4Naesin.jsx:8-11 은 등급만 받는다. 이 단일 스케일 덕에 grade_conversions 변환표 없이 convertedGrade = currentScore 주입으로 고1~고3 전 학년이 동작한다.';



COMMENT ON COLUMN "public"."goal_students"."converted_grade" IS '환산 등급. 원본 student.converted_grade(student.mjs:2506). applyPreHighGradePenalty(primitives.js:150-177) 결과이며 고교생에겐 clamp(1,9) 항등이다.';



COMMENT ON COLUMN "public"."goal_students"."current_mogo" IS '모의고사 종합 백분위. 원본 student.current_mogo(student.mjs:2505). calcJeongsiCompositeFE(jeongsi.js:195-212) 결과이며 영어 감점(최대 -16) 때문에 음수가 될 수 있다. 0 이하이면 정시 확률 2종이 0 이 된다(pipeline.js:226-228) — 이 상태와 "정시 컷 데이터 없음"은 jungsiAvailable 플래그로만 구분된다.';



COMMENT ON COLUMN "public"."goal_students"."remain_naesin" IS '남은 내신 시험 회차 수(총 10회 기준). getRemainingNaesin(primitives.js:58-72) 파생값.';



COMMENT ON COLUMN "public"."goal_students"."remain_mogo" IS '남은 모의고사 회차 수(총 14회 기준). getRemainingMogo(primitives.js:88-102) 파생값. ⚠ 우리 온보딩 MOCK_EXAM_ROUNDS 는 3/6/9/10월 4회차뿐이라 고3 전용 "5모"/"7모"를 고를 수 없고, 그만큼 고3 remain_mogo 가 최대 2 크게 나와 확률이 낙관 편향된다(미결 Q9).';



COMMENT ON COLUMN "public"."goal_students"."last_naesin_exam" IS '마지막으로 응시한 내신 회차 라벨("1학기 중간" 등). getRemainingNaesin 표 키(primitives.js:58-72)와 정확히 일치해야 한다.';



COMMENT ON COLUMN "public"."goal_students"."last_mogo_exam" IS '마지막으로 응시한 모의고사 회차 라벨("3모"/"6모"/"9모"/"10모"). getRemainingMogo 표 키(primitives.js:88-102).';



COMMENT ON COLUMN "public"."goal_students"."naesin_scores" IS '내신 성적 입력 원본(jsonb). 원본 student.naesin_subject_scores(student.mjs:2516). 회차·과목 구성이 흔들려 정규화하지 않는다.';



COMMENT ON COLUMN "public"."goal_students"."mock_exam_scores" IS '모의고사 성적 입력 원본(jsonb). 원본 student.jungsi_subject_scores(student.mjs:2517). ⚠ 서버가 currentMogo 로 환산할 때 none=true 회차는 객체에서 제외해야 한다 — 포함하면 평균 0 이 3분할에 들어가 종합 백분위가 크게 낮아진다(jeongsi.js:207-209).';



COMMENT ON COLUMN "public"."goal_students"."base_ideal_susi" IS '온보딩 시 1회 산출된 기준확률(이상 목표 수시). 원본 student.ideal_susi(student.mjs:2491). 이후 절대 갱신하지 않는다 — 현재확률은 base + Σdelta 로 매번 재계산한다(뷰 public.goal_student_state). null 이면 목표 대학 컷 미확보(status=awaiting_cuts)이며 "확률 0%"가 아니라 "미산출"이다.';



COMMENT ON COLUMN "public"."goal_students"."base_ideal_jungsi" IS '온보딩 기준확률(이상 목표 정시). 원본 student.ideal_jungsi(student.mjs:2492).';



COMMENT ON COLUMN "public"."goal_students"."base_min_susi" IS '온보딩 기준확률(최소 목표 수시). 원본 student.min_susi(student.mjs:2496).';



COMMENT ON COLUMN "public"."goal_students"."base_min_jungsi" IS '온보딩 기준확률(최소 목표 정시). 원본 student.min_jungsi(student.mjs:2497).';



COMMENT ON COLUMN "public"."goal_students"."rate_ideal_susi" IS '하루 최대 증분율(%/일) = (100 - base) / D-day. calcStudentBonusRates(bonus.js:81-135)가 온보딩 시 1회 계산한다. 원본 student.ideal_susi_bonus(student.mjs:2508) — 원본은 study_records.ideal_susi_bonus(그날 증분, student.mjs:2664)와 이름이 같아 혼동을 일으켰다. 여기서는 rate_* / delta_* 로 갈랐다.';



COMMENT ON COLUMN "public"."goal_students"."rate_ideal_jungsi" IS '하루 최대 증분율(이상 목표 정시). 원본 student.ideal_jungsi_bonus(student.mjs:2509).';



COMMENT ON COLUMN "public"."goal_students"."rate_min_susi" IS '하루 최대 증분율(최소 목표 수시). 원본 student.min_susi_bonus(student.mjs:2510).';



COMMENT ON COLUMN "public"."goal_students"."rate_min_jungsi" IS '하루 최대 증분율(최소 목표 정시). 원본 student.min_jungsi_bonus(student.mjs:2511).';



COMMENT ON COLUMN "public"."goal_students"."study_schedule" IS '요일별 학습 목표 시간(jsonb, 요일 7키). 원본 student.study_schedule(student.mjs:2520). sumWeeklySchedule(schedule.js:97-111)과 applyDailyRecord(pipeline.js)가 객체를 통째로 읽으므로 자식 테이블로 쪼개지 않는다. 우리는 calculateWeekSchedule 대신 calcAvailableHoursApprox + getStudyMultiplier 로 서버가 완성해 넣는다(온보딩이 요일별 시각이 아니라 공통 스테퍼 4개만 받기 때문).';



COMMENT ON COLUMN "public"."goal_students"."week_ideal" IS '주간 이상 목표 시간 합계(월~토, 일요일 제외). 원본 student.week_ideal(student.mjs:2513). sumWeeklySchedule(schedule.js:97-111) 파생값이지만 대시보드가 직접 표시·정렬하므로 정규 컬럼으로 둔다.';



COMMENT ON COLUMN "public"."goal_students"."week_min" IS '주간 최소 목표 시간 합계(월~토). 원본 student.week_min(student.mjs:2514).';



COMMENT ON COLUMN "public"."goal_students"."actual_start_date" IS '가상 날짜의 원점(KST). 원본 student.actual_start_date 는 첫 기록 저장 시 채웠으나(student.mjs:2635-2644) 우리는 온보딩 시 확정한다 — rate 가 온보딩 시점 D-day 기준이라(bonus.js:97-105) 원점도 같은 시점이어야 어긋나지 않는다. record_date = getRecordDateFromActualStart(이 값, record_index)(virtualDate.js:54-66).';



COMMENT ON COLUMN "public"."goal_students"."onboarded_at" IS '온보딩 완료 시각. null 이면 미완료. 원본은 ideal_univ 공백 여부로 판정했고(student.mjs:1959-1962) intake jsonb 컬럼(student.mjs:2519)을 따로 저장했는데, 전자는 목표 대학명이 비는 경우와 구분되지 않고 후자는 응답의 master.intake(boolean, student.mjs:2303)와 타입이 달라 함정이었다. 둘 다 이 컬럼으로 대체했다.';



COMMENT ON COLUMN "public"."goal_students"."status" IS 'awaiting_cuts = 목표 대학 컷을 찾지 못해 base_* 가 아직 null. active = 정상. paused = 운영 보류. 원본에 없는 신설 컬럼 — calcNaesinProb 이 컷 누락을 확률 0 으로 접기 때문에(primitives.js:119) 파이프라인만으로는 0%와 미산출을 구분할 수 없다.';



COMMENT ON COLUMN "public"."goal_students"."created_at" IS '행 생성 시각. 원본 student 테이블에 대응 컬럼이 없다(원본은 upsert 만 하고 생성 시각을 남기지 않았다).';



COMMENT ON COLUMN "public"."goal_students"."updated_at" IS '마지막 갱신 시각. 트리거 trg_goal_students_updated_at 이 공용 public.set_updated_at()(00_base_schema.sql:1432)으로 채운다.';



COMMENT ON COLUMN "public"."goal_students"."week_schedule_input" IS '온보딩 Step7(하루 일정) 요일별 원본 입력 — {mon..sun: {wake, sleep, hasSchool, schoolStart?, schoolEnd?, academies:[{start,end}]}}. study_schedule(파생 요일별 목표)와 달리 재계산·재편집의 근거가 되는 원본 입력이다. api/goal/intake.ts validateIntakeBody가 검증한 값을 그대로 저장한다.';



CREATE OR REPLACE VIEW "public"."goal_student_state" WITH ("security_invoker"='true') AS
 SELECT "s"."profile_id",
    "s"."status",
    "s"."onboarded_at",
    "s"."base_ideal_susi",
    "s"."base_ideal_jungsi",
    "s"."base_min_susi",
    "s"."base_min_jungsi",
    COALESCE("d"."sum_ideal_susi", (0)::numeric) AS "cum_ideal_susi",
    COALESCE("d"."sum_ideal_jungsi", (0)::numeric) AS "cum_ideal_jungsi",
    COALESCE("d"."sum_min_susi", (0)::numeric) AS "cum_min_susi",
    COALESCE("d"."sum_min_jungsi", (0)::numeric) AS "cum_min_jungsi",
        CASE
            WHEN ("s"."base_ideal_susi" IS NULL) THEN NULL::numeric
            ELSE LEAST((100)::numeric, GREATEST((0)::numeric, ("s"."base_ideal_susi" + COALESCE("d"."sum_ideal_susi", (0)::numeric))))
        END AS "ideal_susi",
        CASE
            WHEN ("s"."base_ideal_jungsi" IS NULL) THEN NULL::numeric
            ELSE LEAST((100)::numeric, GREATEST((0)::numeric, ("s"."base_ideal_jungsi" + COALESCE("d"."sum_ideal_jungsi", (0)::numeric))))
        END AS "ideal_jungsi",
        CASE
            WHEN ("s"."base_min_susi" IS NULL) THEN NULL::numeric
            ELSE LEAST((100)::numeric, GREATEST((0)::numeric, ("s"."base_min_susi" + COALESCE("d"."sum_min_susi", (0)::numeric))))
        END AS "min_susi",
        CASE
            WHEN ("s"."base_min_jungsi" IS NULL) THEN NULL::numeric
            ELSE LEAST((100)::numeric, GREATEST((0)::numeric, ("s"."base_min_jungsi" + COALESCE("d"."sum_min_jungsi", (0)::numeric))))
        END AS "min_jungsi",
    COALESCE("d"."record_count", (0)::bigint) AS "record_count",
    "d"."last_record_date"
   FROM ("public"."goal_students" "s"
     LEFT JOIN LATERAL ( SELECT "sum"("r"."delta_ideal_susi") AS "sum_ideal_susi",
            "sum"("r"."delta_ideal_jungsi") AS "sum_ideal_jungsi",
            "sum"("r"."delta_min_susi") AS "sum_min_susi",
            "sum"("r"."delta_min_jungsi") AS "sum_min_jungsi",
            "count"(*) AS "record_count",
            "max"("r"."record_date") AS "last_record_date"
           FROM "public"."goal_daily_records" "r"
          WHERE ("r"."profile_id" = "s"."profile_id")) "d" ON (true));


ALTER VIEW "public"."goal_student_state" OWNER TO "postgres";


COMMENT ON VIEW "public"."goal_student_state" IS '목표관리 현재확률 = clamp(0,100, base + Σdelta). 저장하지 않고 매번 재계산한다 — 원본이 클램프를 "합계"에 걸기 때문에(target/api/student.mjs:1034-1037) 캐시 컬럼에 증분을 누적하면 값이 갈린다(base 95, +10, -10 → 재계산 95 vs 캐시 90). base_* 가 null 인 awaiting_cuts 학생은 확률도 null(미산출)이며 0% 와 구분된다. security_invoker = true 로 기반 테이블 RLS 를 상속한다.';



CREATE TABLE IF NOT EXISTS "public"."goal_subject_targets" (
    "profile_id" "uuid" NOT NULL,
    "subject" "text" NOT NULL,
    "target_hours" numeric(4,1) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "goal_subject_targets_subject_check" CHECK (("subject" = ANY (ARRAY['korean'::"text", 'math'::"text", 'english'::"text", 'science'::"text", 'social'::"text", 'history'::"text", 'second_lang'::"text", 'etc'::"text"]))),
    CONSTRAINT "goal_subject_targets_target_hours_check" CHECK ((("target_hours" >= (0)::numeric) AND ("target_hours" <= (24)::numeric)))
);


ALTER TABLE "public"."goal_subject_targets" OWNER TO "postgres";


COMMENT ON TABLE "public"."goal_subject_targets" IS '목표관리 열공 타이머(#25) 과목별 목표 학습 시간. 학생이 타이머 페이지에서 자율 설정(원본 외부 앱(target)에 대응 스키마 없음, 신규 기능). 미설정 과목의 기본값(요일 목표 총합÷과목 수)은 이 테이블에 저장하지 않고 API 응답 시점에 프론트가 파생한다. 쓰기는 service_role(api/goal/timer.js)만. sql/78_goal_subject_targets.sql 참고.';



COMMENT ON COLUMN "public"."goal_subject_targets"."profile_id" IS 'goal_students.profile_id(≡auth.users.id). 소유자 판정은 언제나 세션 토큰에서 얻은 profileId로만 한다(api/_lib/goalRepo.js openGoalSession 관례) — 클라이언트가 보낸 어떤 id도 신뢰하지 않는다.';



COMMENT ON COLUMN "public"."goal_subject_targets"."subject" IS '과목 코드 8종(korean/math/english/science/social/history/second_lang/etc). 한글 라벨(국어/수학/영어/탐구/사회/한국사/제2외국어/기타)과의 매핑은 api/_lib/goalRepo.ts SUBJECT_CODE_TO_LABEL/SUBJECT_LABEL_TO_CODE가 담당한다 — DB에는 코드값만 저장한다.';



COMMENT ON COLUMN "public"."goal_subject_targets"."target_hours" IS '목표 학습 시간(시간, 0~24, 0.1시간 단위 저장 가능하나 UI는 통상 0.5시간 스텝을 쓴다). 0은 "미설정"이 아니라 사용자가 저장한 값 0이다.';



COMMENT ON COLUMN "public"."goal_subject_targets"."created_at" IS '행 생성 시각.';



COMMENT ON COLUMN "public"."goal_subject_targets"."updated_at" IS '마지막 갱신 시각. 트리거 trg_goal_subject_targets_updated_at이 공용 public.set_updated_at()(00_base_schema.sql:1432)으로 채운다.';



CREATE TABLE IF NOT EXISTS "public"."goal_timer_sessions" (
    "id" bigint NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "subject" "text" NOT NULL,
    "session_date" "date" NOT NULL,
    "started_at" timestamp with time zone NOT NULL,
    "ended_at" timestamp with time zone,
    "last_heartbeat_at" timestamp with time zone,
    "duration_seconds" integer,
    "end_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "goal_timer_sessions_duration_seconds_check" CHECK ((("duration_seconds" IS NULL) OR (("duration_seconds" >= 0) AND ("duration_seconds" <= 43200)))),
    CONSTRAINT "goal_timer_sessions_end_reason_check" CHECK ((("end_reason" IS NULL) OR ("end_reason" = ANY (ARRAY['stop'::"text", 'switch'::"text", 'midnight'::"text", 'timeout'::"text"])))),
    CONSTRAINT "goal_timer_sessions_open_state_check" CHECK (((("ended_at" IS NULL) AND ("duration_seconds" IS NULL) AND ("end_reason" IS NULL)) OR (("ended_at" IS NOT NULL) AND ("duration_seconds" IS NOT NULL) AND ("end_reason" IS NOT NULL)))),
    CONSTRAINT "goal_timer_sessions_subject_check" CHECK (("subject" = ANY (ARRAY['korean'::"text", 'math'::"text", 'english'::"text", 'science'::"text", 'social'::"text", 'history'::"text", 'second_lang'::"text", 'etc'::"text"])))
);


ALTER TABLE "public"."goal_timer_sessions" OWNER TO "postgres";


COMMENT ON TABLE "public"."goal_timer_sessions" IS '목표관리 열공 타이머(#25) 과목별 학습 세션. 원본 외부 앱(target)에 대응 스키마 없음(신규 기능, 서버 시각 기반으로 새로 설계) — 클라이언트가 초를 계산해 보내던 원본 구조는 변조 가능해 이식하지 않았다. 쓰기는 service_role(api/goal/timer.js)만. sql/77_goal_timer_sessions.sql 참고.';



COMMENT ON COLUMN "public"."goal_timer_sessions"."profile_id" IS 'goal_students.profile_id(≡auth.users.id). 소유자 판정은 언제나 세션 토큰에서 얻은 profileId로만 한다(api/_lib/goalRepo.js openGoalSession 관례) — 클라이언트가 보낸 어떤 id도 신뢰하지 않는다.';



COMMENT ON COLUMN "public"."goal_timer_sessions"."subject" IS '과목 코드 8종(korean/math/english/science/social/history/second_lang/etc). 한글 라벨(국어/수학/영어/탐구/사회/한국사/제2외국어/기타)과의 매핑은 api/_lib/goalRepo.ts SUBJECT_CODE_TO_LABEL/SUBJECT_LABEL_TO_CODE가 담당한다 — DB에는 코드값만 저장한다.';



COMMENT ON COLUMN "public"."goal_timer_sessions"."session_date" IS '이 세션이 속한 KST 날짜. started_at으로부터 서버가 파생해 저장한다(파생값이지만 자정 분할 reconcile의 판정 기준이라 정규 컬럼으로 둔다).';



COMMENT ON COLUMN "public"."goal_timer_sessions"."started_at" IS '세션 시작 시각(서버 now()). 클라이언트가 보낸 시각은 어디서도 신뢰하지 않는다.';



COMMENT ON COLUMN "public"."goal_timer_sessions"."ended_at" IS '세션 종료 시각. null = 진행 중("열린 세션"). partial unique index(아래 (2))로 학생당 동시에 최대 1개만 존재하도록 강제한다.';



COMMENT ON COLUMN "public"."goal_timer_sessions"."last_heartbeat_at" IS '마지막 하트비트 시각. 프론트 60초 setInterval + pagehide(navigator.sendBeacon)가 touch한다. 스테일 스윕이 5분 초과 시 timeout 마감의 종료 시각으로 이 값(없으면 started_at)을 쓴다.';



COMMENT ON COLUMN "public"."goal_timer_sessions"."duration_seconds" IS '세션 길이(초). 진행 중이면 null, 마감되면 ended_at - started_at을 서버가 1회 계산해 채운다. 상한 43200(12시간)은 스테일 세션 방어 캡.';



COMMENT ON COLUMN "public"."goal_timer_sessions"."end_reason" IS '마감 사유. stop=사용자 직접 종료, switch=다른 과목 시작으로 자동 마감, midnight=자정 경계 서버 분할 마감(같은 과목으로 다음날 00:00 세션이 이어서 insert된다), timeout=하트비트 5분 초과 스테일 스윕.';



COMMENT ON COLUMN "public"."goal_timer_sessions"."created_at" IS '행 생성 시각.';



COMMENT ON COLUMN "public"."goal_timer_sessions"."updated_at" IS '마지막 갱신 시각(하트비트 touch 포함). 트리거 trg_goal_timer_sessions_updated_at이 공용 public.set_updated_at()(00_base_schema.sql:1432)으로 채운다.';



ALTER TABLE "public"."goal_timer_sessions" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."goal_timer_sessions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."goal_timer_subjects" (
    "profile_id" "uuid" NOT NULL,
    "subject" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "goal_timer_subjects_subject_check" CHECK (("subject" = ANY (ARRAY['korean'::"text", 'math'::"text", 'english'::"text", 'science'::"text", 'social'::"text", 'history'::"text", 'second_lang'::"text", 'etc'::"text"])))
);


ALTER TABLE "public"."goal_timer_subjects" OWNER TO "postgres";


COMMENT ON TABLE "public"."goal_timer_subjects" IS '목표관리 열공 타이머(#25) 화면에 노출 중인 과목 목록(학생별, QA B9 "+ 과목 추가"). 행이 없으면 기본 4과목(math/korean/english/science)이 노출된 것으로 간주한다 — 기존 학생 백필 불필요. 첫 "+ 과목 추가" 시 서버(addTimerSubject, api/_lib/goalRepo.ts)가 기본 4개를 sort_order 0..3으로 먼저 물질화한 뒤 요청 과목을 다음 sort_order로 추가한다. 쓰기는 service_role(api/goal/timer.ts POST action=addSubject)만.';



COMMENT ON COLUMN "public"."goal_timer_subjects"."profile_id" IS 'goal_students.profile_id(≡auth.users.id). 소유자 판정은 언제나 세션 토큰에서 얻은 profileId로만 한다(api/_lib/goalRepo.ts openGoalSession 관례) — 클라이언트가 보낸 어떤 id도 신뢰하지 않는다.';



COMMENT ON COLUMN "public"."goal_timer_subjects"."subject" IS '과목 코드 8종 — goal_timer_sessions/goal_subject_targets/goal_plan_tasks와 동일 CHECK 도메인.';



COMMENT ON COLUMN "public"."goal_timer_subjects"."sort_order" IS '카드 표시 순서(오름차순). 기본 4과목은 0..3, 이후 추가한 과목은 뒤로 이어 붙는다.';



COMMENT ON COLUMN "public"."goal_timer_subjects"."created_at" IS '행 생성(카드 추가) 시각.';



CREATE TABLE IF NOT EXISTS "public"."goal_university_cuts" (
    "id" bigint NOT NULL,
    "cut_type" "text" NOT NULL,
    "university_key" "text" NOT NULL,
    "university_name" "text" NOT NULL,
    "department_key" "text" DEFAULT ''::"text" NOT NULL,
    "department_name" "text" DEFAULT ''::"text" NOT NULL,
    "avg_cut" numeric(6,2),
    "source" "text",
    "source_year" smallint,
    "is_active" boolean DEFAULT true NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "goal_university_cuts_avg_cut_check" CHECK ((("avg_cut" IS NULL) OR (("cut_type" = ANY (ARRAY['normal'::"text", 'special'::"text"])) AND (("avg_cut" >= (1)::numeric) AND ("avg_cut" <= (9)::numeric))) OR (("cut_type" = 'jungsi'::"text") AND (("avg_cut" >= (0)::numeric) AND ("avg_cut" <= (100)::numeric))))),
    CONSTRAINT "goal_university_cuts_cut_type_check" CHECK (("cut_type" = ANY (ARRAY['normal'::"text", 'special'::"text", 'jungsi'::"text"])))
);


ALTER TABLE "public"."goal_university_cuts" OWNER TO "postgres";


COMMENT ON TABLE "public"."goal_university_cuts" IS '목표관리 확률 계산용 대학·학과 컷 기준표. 원본 target/api/student.mjs 의 universities 테이블 대응(getUnivCut: student.mjs:984-998). avg_cut 단위가 cut_type 에 따라 다르다(normal/special=내신등급 1~9, jungsi=정시백분위 0~100). sql/55_goal_management.sql 참고.';



COMMENT ON COLUMN "public"."goal_university_cuts"."id" IS '대리 키. 논리 식별자는 (cut_type, university_key, department_key) 이고 UNIQUE 인덱스 goal_university_cuts_key 가 지킨다. 단 **실제 조회 경로는 표시명 3튜플**(goalRepo.js:146-151)이라 유일성의 실질 방어선은 goal_university_cuts_name_key(cut_type, university_name, department_name) where is_active 다 — 이게 없으면 표시명 중복 2행이 합법이 되어 maybeSingle 이 PGRST116 을 던지고 온보딩이 500 으로 죽는다.';



COMMENT ON COLUMN "public"."goal_university_cuts"."cut_type" IS '컷 종류. 원본 universities.school_type(student.mjs:991·2103 `.eq("school_type", schoolType)`)을 개명한 것이다 — 값이 normal/special/jungsi 라 학교 유형이 아니라 컷 종류이고, goal_students.school_type(한글 리터럴)과 이름이 겹치면 혼동한다. normal/special 판정은 getSchoolCutType(primitives.js:43-47), jungsi 는 호출부가 리터럴로 넘긴다(student.mjs:2443·2445).';



COMMENT ON COLUMN "public"."goal_university_cuts"."university_key" IS '대학 조회 키. 원본 universities.university(student.mjs:992 `.eq("university", university)`)에 대응하며, 우리는 표시명과 조회키를 분리했다. ⚠ 현재 API 는 이 컬럼을 읽지 않는다 — 온보딩 계약이 표시명만 보내기 때문이다(intake.js:147-148 validateTarget → goalRepo.js:148). 키 기준 조회로 전환하려면 온보딩 요청 계약부터 바꿔야 한다. 그때까지 조회 유일성은 goal_university_cuts_name_key 가 책임진다.';



COMMENT ON COLUMN "public"."goal_university_cuts"."university_name" IS '대학 표시명(온보딩 자동완성 노출값). **실제 컷 조회 키**다(goalRepo.js:148). goal_university_cuts_name_key 로 활성 행 유일성을 보장한다.';



COMMENT ON COLUMN "public"."goal_university_cuts"."department_key" IS '학과 조회 키. 대학 단위 컷은 **빈 문자열**이다 — 원본 조회가 `.eq("department", department || "")`(student.mjs:993)라 널이면 매칭되지 않는다.';



COMMENT ON COLUMN "public"."goal_university_cuts"."department_name" IS '학과 표시명. 대학 단위 컷은 빈 문자열.';



COMMENT ON COLUMN "public"."goal_university_cuts"."avg_cut" IS '컷 값. 원본 universities.avg_cut(student.mjs:990 select). ⚠ cut_type 에 따라 단위가 다르다 — normal/special 은 내신 등급 1~9(작을수록 우세, calcNaesinProb 이 currentGrade <= targetCut 을 우세로 판정, primitives.js:123), jungsi 는 정시 백분위 0~100(클수록 우세). null 이면 컷 미확보이고 API 가 422 cut_not_found 로 응답하며 학생 행은 status=awaiting_cuts 로 남는다.';



COMMENT ON COLUMN "public"."goal_university_cuts"."source" IS '유도 출처(admission_results|manual). 원본에 없는 신설 컬럼 — 어떤 입결 데이터로 유도했는지 근거를 남긴다.';



COMMENT ON COLUMN "public"."goal_university_cuts"."source_year" IS '유도에 쓴 입결 연도. 신설 컬럼.';



COMMENT ON COLUMN "public"."goal_university_cuts"."is_active" IS '공개 여부. public read 정책이 이 값으로 필터한다(43_admission_results.sql:161-165 패턴).';



COMMENT ON COLUMN "public"."goal_university_cuts"."note" IS '운영 메모(컷 산출 근거·예외 사항). 신설 컬럼.';



COMMENT ON COLUMN "public"."goal_university_cuts"."created_at" IS '행 생성 시각. 백필 스크립트가 언제 넣었는지 추적용.';



COMMENT ON COLUMN "public"."goal_university_cuts"."updated_at" IS '마지막 갱신 시각. 트리거 trg_goal_university_cuts_updated_at 이 채운다.';



ALTER TABLE "public"."goal_university_cuts" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."goal_university_cuts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE OR REPLACE VIEW "public"."goal_university_options" WITH ("security_invoker"='true') AS
 SELECT "university_key",
    "university_name",
    "department_key",
    "department_name",
    "bool_or"((("cut_type" = 'normal'::"text") AND ("avg_cut" IS NOT NULL))) AS "has_normal",
    "bool_or"((("cut_type" = 'special'::"text") AND ("avg_cut" IS NOT NULL))) AS "has_special",
    "bool_or"((("cut_type" = 'jungsi'::"text") AND ("avg_cut" IS NOT NULL))) AS "has_jungsi"
   FROM "public"."goal_university_cuts"
  WHERE "is_active"
  GROUP BY "university_key", "university_name", "department_key", "department_name";


ALTER VIEW "public"."goal_university_options" OWNER TO "postgres";


COMMENT ON VIEW "public"."goal_university_options" IS '목표관리 온보딩 대학·학과 선택지. goal_university_cuts 를 (대학, 학과) 단위로 접고 학교유형별 필요 컷 보유 여부를 플래그로 준다. 노출 필터는 has_normal(일반고) / has_special(특목·자사고) 둘뿐이다 — has_jungsi 는 노출 조건이 아니라 진단용이다(정시 컷이 없으면 정시 확률만 null 로 남고 온보딩은 통과한다, 명세 개정 3 Q1=(b)). security_invoker = true 로 기반 테이블 RLS 를 상속한다.';



CREATE TABLE IF NOT EXISTS "public"."goal_workbooks" (
    "id" bigint NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "subject" "text" NOT NULL,
    "title" "text" NOT NULL,
    "total_pages" integer NOT NULL,
    "current_page" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'reading'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "shelved_at" timestamp with time zone,
    CONSTRAINT "goal_workbooks_current_page_check" CHECK (("current_page" >= 0)),
    CONSTRAINT "goal_workbooks_status_check" CHECK (("status" = ANY (ARRAY['reading'::"text", 'done'::"text"]))),
    CONSTRAINT "goal_workbooks_subject_check" CHECK (("subject" = ANY (ARRAY['korean'::"text", 'math'::"text", 'english'::"text", 'science'::"text", 'etc'::"text"]))),
    CONSTRAINT "goal_workbooks_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 100))),
    CONSTRAINT "goal_workbooks_total_pages_check" CHECK (("total_pages" > 0))
);


ALTER TABLE "public"."goal_workbooks" OWNER TO "postgres";


COMMENT ON TABLE "public"."goal_workbooks" IS '목표관리 "나의 노력" 화면의 과목별 문제집(사용자당 다건). Efforts.jsx + EffortSubjectCard.jsx가 소비한다. 쓰기는 service_role(api/goal/workbooks.js)만, 읽기는 본인과 어드민. sql/76_goal_workbooks.sql 참고.';



COMMENT ON COLUMN "public"."goal_workbooks"."profile_id" IS 'goal_students.profile_id FK. auth.users를 직접 참조하지 않고 goal_students를 경유한다 — 학생 마스터가 삭제되면 문제집도 함께 정리된다(on delete cascade).';



COMMENT ON COLUMN "public"."goal_workbooks"."subject" IS '과목 id. src/components/goal/subjectTokens.js KNOWN_SUBJECT_IDS 5종과 정확히 일치해야 한다(korean/math/english/science/etc) — 한글 라벨이 아니다.';



COMMENT ON COLUMN "public"."goal_workbooks"."title" IS '문제집 이름(사용자 입력, 최대 100자). AddWorkbookModal.jsx "문제집 이름" 필드.';



COMMENT ON COLUMN "public"."goal_workbooks"."total_pages" IS '전체 페이지 수. 0보다 커야 한다 — 0이면 진도율(current/total)이 나눗셈 불능이 된다.';



COMMENT ON COLUMN "public"."goal_workbooks"."current_page" IS '현재 페이지 수. status 재계산의 입력값(current_page >= total_pages → done). 카드 진도율 표시는 보류 상태라 이 컬럼은 저장만 되고 UI에 퍼센트로는 아직 노출되지 않는다.';



COMMENT ON COLUMN "public"."goal_workbooks"."status" IS 'reading = 읽는 중(EffortSubjectCard "공부 중인 책" 영역에 노출). done = 완독(완독 스택에 누적, completed 카운트에 반영). API가 current_page/total_pages 비교로 매 쓰기마다 재계산해 저장한다 — 클라이언트가 이 값을 직접 보낼 수 없다.';



COMMENT ON COLUMN "public"."goal_workbooks"."created_at" IS '행 생성 시각.';



COMMENT ON COLUMN "public"."goal_workbooks"."updated_at" IS '마지막 갱신 시각. 트리거 trg_goal_workbooks_updated_at이 공용 public.set_updated_at()으로 채운다.';



COMMENT ON COLUMN "public"."goal_workbooks"."shelved_at" IS '"완독! 책장에 꽂기" 버튼을 눌러 BookStack으로 옮긴 시각(null이면 아직 책장에 안 꽂음). status=''done''인 행만 세팅 가능(api/goal/workbooks.ts PUT {shelve:true} 검증). status와 별개 원본 — status는 페이지 진도로 자동 계산되고, shelved_at은 사용자의 명시적 행동만으로 채워진다.';



ALTER TABLE "public"."goal_workbooks" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."goal_workbooks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."growth_plan_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "program" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "priority" "text" NOT NULL,
    "axis" "text",
    "category" "text",
    "period" "text" NOT NULL,
    "period_label" "text",
    "deadline" "date",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "done_source_program" "text",
    "done_ref_id" "uuid",
    "done_at" timestamp with time zone,
    "carried_from_report_id" "uuid",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "growth_plan_items_axis_check" CHECK (("axis" = ANY (ARRAY['A'::"text", 'B'::"text", 'C'::"text", 'D'::"text", 'E'::"text"]))),
    CONSTRAINT "growth_plan_items_done_source_program_check" CHECK (("done_source_program" = ANY (ARRAY['manual'::"text", 'self'::"text", 'deep'::"text"]))),
    CONSTRAINT "growth_plan_items_period_check" CHECK (("period" = ANY (ARRAY['course_selection'::"text", 'semester'::"text", 'vacation'::"text"]))),
    CONSTRAINT "growth_plan_items_priority_check" CHECK (("priority" = ANY (ARRAY['required'::"text", 'recommended'::"text"]))),
    CONSTRAINT "growth_plan_items_program_check" CHECK (("program" = ANY (ARRAY['school'::"text", 'self'::"text", 'deep'::"text"]))),
    CONSTRAINT "growth_plan_items_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'done'::"text"])))
);


ALTER TABLE "public"."growth_plan_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."growth_plan_items" IS '성장설계 실행 계획 항목. program: school(학교 활동)/self(자기평가서)/deep(심화탐구). 완료는 수동 체크(done_source_program=manual) 또는 해당 서비스 산출물 연결(self/deep, done_ref_id)로 기록한다. carried_from_report_id 는 이전 회차에서 이월된 항목의 원본 회차. 본인은 update(수동 체크)만 하고 insert/delete 는 service_role 만 한다.';



CREATE TABLE IF NOT EXISTS "public"."growth_profiles" (
    "profile_id" "uuid" NOT NULL,
    "track" "text",
    "survey_answers" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "survey_saved_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "growth_profiles_track_check" CHECK (("track" = ANY (ARRAY['고1'::"text", '고2'::"text", '고3'::"text", '졸업'::"text", 'N수'::"text"])))
);


ALTER TABLE "public"."growth_profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."growth_profiles" IS '성장설계 전용 학생 프로필(학생당 1행). 설문 응답 초안과 트랙을 둔다. 여섯 서비스 공용 값은 student_profiles 에 있다. 회차 시작 시 survey_answers 는 growth_reports.survey_answers 로 스냅샷된다.';



CREATE TABLE IF NOT EXISTS "public"."growth_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "current_step" smallint DEFAULT 0 NOT NULL,
    "track" "text",
    "survey_answers" "jsonb",
    "activity_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "grade_inputs" "jsonb",
    "narrative_theme" "text",
    "grade_subthemes" "jsonb",
    "stage" "text",
    "axis_scores" "jsonb",
    "consistency" "jsonb",
    "sections" "jsonb",
    "signals" "jsonb",
    "issued_at" timestamp with time zone,
    "ledger_id" "uuid",
    "ledger_reversed_at" timestamp with time zone,
    "model_attempt_count" integer DEFAULT 0 NOT NULL,
    "schema_version" integer DEFAULT 1 NOT NULL,
    "step_state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_activity_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "growth_reports_completed_has_issued_at" CHECK ((("status" <> 'completed'::"text") OR ("issued_at" IS NOT NULL))),
    CONSTRAINT "growth_reports_current_step_check" CHECK ((("current_step" >= 0) AND ("current_step" <= 8))),
    CONSTRAINT "growth_reports_reversed_needs_ledger" CHECK ((("ledger_reversed_at" IS NULL) OR ("ledger_id" IS NOT NULL))),
    CONSTRAINT "growth_reports_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'in_progress'::"text", 'completed'::"text", 'archived'::"text"]))),
    CONSTRAINT "growth_reports_track_check" CHECK (("track" = ANY (ARRAY['고1'::"text", '고2'::"text", '고3'::"text", '졸업'::"text", 'N수'::"text"])))
);


ALTER TABLE "public"."growth_reports" OWNER TO "postgres";


COMMENT ON TABLE "public"."growth_reports" IS '성장설계 회차. 활성 회차는 별도 플래그 없이 "issued_at 이 가장 늦은 completed 1건"이다(is_active 컬럼을 두지 않는다). 미완 회차(draft/in_progress)는 학생당 1개만 허용한다. survey_answers 는 회차 시작 시점 스냅샷. ledger_id 는 첫 모델 호출 단계 성공 시 차감한 performance_credit_ledger 행(consume_growth_credit), ledger_reversed_at 은 실패 되돌림 시각(reverse_growth_credit). 읽기는 본인/관리자만이고 쓰기는 service_role 만이다.';



COMMENT ON COLUMN "public"."growth_reports"."survey_answers" IS '회차 시작 시점의 설문 응답 스냅샷. 이후 growth_profiles 가 바뀌어도 이 회차는 변하지 않는다.';



COMMENT ON COLUMN "public"."growth_reports"."activity_ids" IS '분석 대상 활동 ID 고정(No.113 세션 누적). 활동이 나중에 바뀌어도 이 회차가 읽은 재료를 재현하기 위한 것. FK 무결성은 두지 않는다.';



COMMENT ON COLUMN "public"."growth_reports"."schema_version" IS 'sections 항목 스키마 버전. 섹션 구조가 바뀔 때 올려 과거 회차를 구분해 읽는다.';



COMMENT ON COLUMN "public"."growth_reports"."step_state" IS '성장설계 리포트 생성 단계 상태(api/_lib/growth/report/types.ts 의 StepState 와 같은 키). steps 는 키 "1"~"8" 에 {status(pending/running/ok/failed), attempts, startedAt, finishedAt, issues} 를 담는다. planDraft 는 7단계가 만든 실행계획 초안이고 8단계가 growth_plan_items 로 옮긴다. terminal 은 {reason, at, step} 형태의 종결 실패다. 재시도와 장애 추적용이며 결과 데이터는 각 결과 컬럼에 둔다.';



CREATE TABLE IF NOT EXISTS "public"."growth_uploads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "grade_label" "text",
    "semester" smallint,
    "file_name" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "byte_size" integer NOT NULL,
    "consent_at" timestamp with time zone NOT NULL,
    "extraction_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "extracted" "jsonb",
    "extraction_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "growth_uploads_byte_size_check" CHECK (("byte_size" >= 0)),
    CONSTRAINT "growth_uploads_extraction_status_check" CHECK (("extraction_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'ok'::"text", 'failed'::"text"]))),
    CONSTRAINT "growth_uploads_grade_label_check" CHECK (("grade_label" = ANY (ARRAY['고1'::"text", '고2'::"text", '고3'::"text"]))),
    CONSTRAINT "growth_uploads_semester_check" CHECK (("semester" = ANY (ARRAY[1, 2])))
);


ALTER TABLE "public"."growth_uploads" OWNER TO "postgres";


COMMENT ON TABLE "public"."growth_uploads" IS '성장설계 업로드 메타와 추출 결과. 원문은 보관하지 않는다(원문 미보관 원칙), 저장 경로 컬럼이 없고 파일명, 형식, 크기, 동의 시각과 추출 결과만 남긴다. extracted 는 주제, 개념, 결과, 한계 네 항목만 담는다. 추출 성공분은 activity_records(source_program=upload, source_ref_id=이 행 id)로 승격된다.';



COMMENT ON COLUMN "public"."growth_uploads"."extraction_status" IS 'pending 은 업로드 대기, processing 은 추출 선점 상태(동시 추출 방지), ok 는 추출 완료, failed 는 실패 또는 미처리 만료.';



CREATE TABLE IF NOT EXISTS "public"."home_acceptance_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_name" "text" NOT NULL,
    "result_title" "text" NOT NULL,
    "description" "text",
    "image_url" "text",
    "link_url" "text",
    "open_new_window" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."home_acceptance_cards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."home_mentor_strategies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mentor_name" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "link_url" "text",
    "open_new_window" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "badge" "text",
    "title_lines" "jsonb",
    "photo_url" "text",
    "photo_layout" "jsonb",
    "card_width" integer DEFAULT 210
);


ALTER TABLE "public"."home_mentor_strategies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."home_side_banners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "subtitle" "text",
    "link_url" "text",
    "open_new_window" boolean DEFAULT false NOT NULL,
    "image_url" "text",
    "mobile_image_url" "text",
    "start_date" "date",
    "end_date" "date",
    "sort_order" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "display_seconds" integer DEFAULT 5 NOT NULL,
    CONSTRAINT "home_side_banners_date_check" CHECK ((("end_date" IS NULL) OR ("start_date" IS NULL) OR ("end_date" >= "start_date"))),
    CONSTRAINT "home_side_banners_display_seconds_check" CHECK ((("display_seconds" >= 1) AND ("display_seconds" <= 600)))
);


ALTER TABLE "public"."home_side_banners" OWNER TO "postgres";


COMMENT ON COLUMN "public"."home_side_banners"."display_seconds" IS '랜딩 캐러셀에서 이 배너가 머무는 시간(초), QA A8/A9 2026-08-27';



CREATE TABLE IF NOT EXISTS "public"."identity_verifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "text" NOT NULL,
    "user_id" "uuid",
    "purpose" "text" DEFAULT 'signup'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "ci" "text",
    "di" "text",
    "name" "text",
    "birth_date" "date",
    "gender" "text",
    "nationality" "text",
    "mobile" "text",
    "carrier" "text",
    "auth_method" "text",
    "is_under14" boolean,
    "error_code" "text",
    "error_message" "text",
    "request_ip" "inet",
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "verified_at" timestamp with time zone,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "transaction_id" "text",
    "auth_ticket" "text",
    "auth_iterators" integer,
    "web_transaction_id" "text",
    "consumed_at" timestamp with time zone,
    CONSTRAINT "identity_verifications_purpose_check" CHECK (("purpose" = ANY (ARRAY['signup'::"text", 'under14_guardian'::"text", 'phone_change'::"text"]))),
    CONSTRAINT "identity_verifications_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'verified'::"text", 'failed'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."identity_verifications" OWNER TO "postgres";


COMMENT ON COLUMN "public"."identity_verifications"."request_id" IS 'NICE request_no(20~50자). 우리가 발급하고 return_url ?rid= 로 되돌려받는다.';



COMMENT ON COLUMN "public"."identity_verifications"."auth_ticket" IS '복호화 키 재료(비밀값). 절대 클라이언트에 노출 금지.';



COMMENT ON COLUMN "public"."identity_verifications"."consumed_at" IS '가입 완료에 실제로 사용된 시각. 재사용 방지(1회용 강제).';



CREATE TABLE IF NOT EXISTS "public"."inquiry_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "reliability" "text" NOT NULL,
    "position" smallint NOT NULL,
    "activity_record_id" "uuid",
    "interview_answers" "jsonb",
    "gaps" "text"[],
    "oneline_text" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inquiry_assets_interview_shape" CHECK ((("kind" <> 'interview'::"text") OR (("interview_answers" IS NOT NULL) AND ("reliability" = 'B'::"text") AND (COALESCE("cardinality"("gaps"), 0) >= 1)))),
    CONSTRAINT "inquiry_assets_kind_check" CHECK (("kind" = ANY (ARRAY['record'::"text", 'interview'::"text", 'oneline'::"text"]))),
    CONSTRAINT "inquiry_assets_oneline_shape" CHECK ((("kind" <> 'oneline'::"text") OR (("oneline_text" IS NOT NULL) AND ("reliability" = 'C'::"text")))),
    CONSTRAINT "inquiry_assets_record_shape" CHECK ((("kind" <> 'record'::"text") OR (("activity_record_id" IS NOT NULL) AND ("reliability" = 'A'::"text")))),
    CONSTRAINT "inquiry_assets_reliability_check" CHECK (("reliability" = ANY (ARRAY['A'::"text", 'B'::"text", 'C'::"text"])))
);


ALTER TABLE "public"."inquiry_assets" OWNER TO "postgres";


COMMENT ON TABLE "public"."inquiry_assets" IS '심화탐구 세션의 선택 자산. kind: record(기존 활동 기록, 신뢰도 A) / interview(회상 인터뷰, 신뢰도 B, 빈틈 1개 이상) / oneline(한 줄 주제, 신뢰도 C). 신뢰도는 kind 에서 서버가 정하며 제약으로도 고정한다. position 0 이 기본 출발 활동이다. 세션의 자산 집합은 통째로 교체되므로 행은 세션 단위로 지우고 다시 넣는다.';



CREATE TABLE IF NOT EXISTS "public"."inquiry_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "report_type" "text" NOT NULL,
    "topic_id" "uuid",
    "submission_id" "uuid",
    "sections" "jsonb" NOT NULL,
    "score" numeric(4,1),
    "label" "text",
    "model" "text",
    "prompt_version" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inquiry_reports_label_check" CHECK (("label" = ANY (ARRAY['ready_with_minor_edits'::"text", 'revision_needed'::"text", 'major_revision_needed'::"text", 'not_evaluable'::"text"]))),
    CONSTRAINT "inquiry_reports_report_type_check" CHECK (("report_type" = ANY (ARRAY['design'::"text", 'evaluation'::"text", 'final'::"text"])))
);


ALTER TABLE "public"."inquiry_reports" OWNER TO "postgres";


COMMENT ON TABLE "public"."inquiry_reports" IS '심화탐구 리포트. report_type: design(설계 리포트, 세션당 1건) / evaluation(평가 리포트, 재평가마다 새 행, submission_id 로 작성본 연결) / final(확정 때 적립한 7항목 사본, 세션당 1건). score 와 label 은 evaluation 행에만 채운다. model, prompt_version 은 모델 호출로 만든 행의 재현용 기록이다.';



CREATE TABLE IF NOT EXISTS "public"."inquiry_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "current_step" smallint DEFAULT 1 NOT NULL,
    "grade_label" "text",
    "semester" smallint,
    "career" "text",
    "subject" "text",
    "growth_report_id" "uuid",
    "plan_item_id" "uuid",
    "reply_pending" boolean DEFAULT false NOT NULL,
    "selected_topic_id" "uuid",
    "design_report_id" "uuid",
    "latest_evaluation_id" "uuid",
    "final_report_id" "uuid",
    "generation_state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "topic_round_count" integer DEFAULT 0 NOT NULL,
    "evaluation_count" integer DEFAULT 0 NOT NULL,
    "ledger_id" "uuid",
    "ledger_reversed_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "last_activity_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "area" "text" DEFAULT 'subject'::"text" NOT NULL,
    "activity_name" "text",
    CONSTRAINT "inquiry_sessions_area_check" CHECK (("area" = ANY (ARRAY['subject'::"text", 'autonomy'::"text", 'club'::"text", 'career'::"text"]))),
    CONSTRAINT "inquiry_sessions_completed_has_completed_at" CHECK ((("status" <> 'completed'::"text") OR ("completed_at" IS NOT NULL))),
    CONSTRAINT "inquiry_sessions_current_step_check" CHECK ((("current_step" >= 1) AND ("current_step" <= 6))),
    CONSTRAINT "inquiry_sessions_grade_label_check" CHECK (("grade_label" = ANY (ARRAY['고1'::"text", '고2'::"text", '고3'::"text"]))),
    CONSTRAINT "inquiry_sessions_reversed_needs_ledger" CHECK ((("ledger_reversed_at" IS NULL) OR ("ledger_id" IS NOT NULL))),
    CONSTRAINT "inquiry_sessions_semester_check" CHECK (("semester" = ANY (ARRAY[1, 2]))),
    CONSTRAINT "inquiry_sessions_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'in_progress'::"text", 'completed'::"text", 'archived'::"text"]))),
    CONSTRAINT "inquiry_sessions_subject_required_for_subject_area" CHECK (((("area" = 'subject'::"text") AND ("subject" IS NOT NULL)) OR ("area" <> 'subject'::"text")))
);


ALTER TABLE "public"."inquiry_sessions" OWNER TO "postgres";


COMMENT ON TABLE "public"."inquiry_sessions" IS '심화탐구 세션. status: draft(생성 뒤 첫 추천 성공 전, 미차감) / in_progress(첫 추천 성공으로 차감한 뒤) / completed(확정, 활동 기록 적립 완료) / archived(만료 또는 종결). 미완 세션(draft, in_progress)은 학생당 1개만 허용한다. current_step 은 화면 단계 1~6. grade_label, semester, career, subject 는 세션 생성 시점 값의 복사본이라 student_profiles 가 바뀌어도 변하지 않는다(No.124). ledger_id 는 첫 추천 성공 시 차감한 performance_credit_ledger 행(consume_inquiry_credit), ledger_reversed_at 은 종결 되돌림 시각(reverse_inquiry_credit). reply_pending 은 성장설계 과제 완료 회신이 실패해 다시 보내야 한다는 표시다. 읽기는 본인과 관리자만이고 쓰기는 service_role 만이다.';



COMMENT ON COLUMN "public"."inquiry_sessions"."subject" IS '교과 영역(area=subject)일 때의 과목명. 그 외 영역은 null 이다. 교과인데 null 이면 check 제약이 막는다.';



COMMENT ON COLUMN "public"."inquiry_sessions"."generation_state" IS '생성 모드별 운영 상태. {"modes": {"<mode>": {status(pending/running/ok/failed), attempts, startedAt, finishedAt, issues}}, "terminal": {reason, at, mode}}. mode 는 topic_recommendation, design_report, evaluation_report 3개다. 재시도와 장애 추적용이며 결과 데이터는 담지 않는다. 결과는 inquiry_topics 와 inquiry_reports 에 둔다.';



COMMENT ON COLUMN "public"."inquiry_sessions"."topic_round_count" IS '지금까지 성공한 주제 추천 라운드 수. 재추천 상한 판정에 쓴다(최초 1 + 재추천 3).';



COMMENT ON COLUMN "public"."inquiry_sessions"."evaluation_count" IS '지금까지 성공한 평가 횟수. 재평가 상한(3) 판정에 쓴다.';



COMMENT ON COLUMN "public"."inquiry_sessions"."area" IS '제출 영역. subject(교과, 과목명 필수) / autonomy(자율활동) / club(동아리활동) / career(진로활동). 기본값 subject 라 기존 세션은 교과로 남는다.';



COMMENT ON COLUMN "public"."inquiry_sessions"."activity_name" IS '교과가 아닌 영역(area<>subject)의 활동명. 선택 입력이라 비어 있을 수 있고 교과 영역에서는 null 이다.';



CREATE TABLE IF NOT EXISTS "public"."inquiry_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "revision" integer NOT NULL,
    "sections" "jsonb" NOT NULL,
    "char_counts" "jsonb" NOT NULL,
    "is_draft" boolean DEFAULT true NOT NULL,
    "is_final" boolean DEFAULT false NOT NULL,
    "submitted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inquiry_submissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."inquiry_submissions" IS '보고서 8절 작성본. is_draft 행은 세션당 1개이고 자동 저장과 수동 저장이 덮어쓴다. 평가를 요청하면 그 초안이 is_draft false 로 확정되고(submitted_at 기록) 평가 뒤 수정이 시작될 때 다음 revision 의 새 초안이 생긴다. is_final 은 확정 화면까지 간 작성본 표시다. char_counts 는 서버가 다시 센 값이다.';



CREATE TABLE IF NOT EXISTS "public"."inquiry_topics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "round" smallint NOT NULL,
    "idx" smallint NOT NULL,
    "link_kind" "text" NOT NULL,
    "linkage_type" "text" NOT NULL,
    "fit" "text" NOT NULL,
    "detail" "jsonb" NOT NULL,
    "selected" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inquiry_topics_fit_check" CHECK (("fit" = ANY (ARRAY['match'::"text", 'neutral'::"text", 'off'::"text"]))),
    CONSTRAINT "inquiry_topics_idx_check" CHECK ((("idx" >= 1) AND ("idx" <= 3))),
    CONSTRAINT "inquiry_topics_link_kind_check" CHECK (("link_kind" = ANY (ARRAY['followup'::"text", 'transfer'::"text", 'critique'::"text", 'extension'::"text"]))),
    CONSTRAINT "inquiry_topics_linkage_type_check" CHECK (("linkage_type" = ANY (ARRAY['direct'::"text", 'interest_based_provisional'::"text"])))
);


ALTER TABLE "public"."inquiry_topics" OWNER TO "postgres";


COMMENT ON TABLE "public"."inquiry_topics" IS '심화탐구 주제 후보. 추천 라운드(round)마다 3개(idx 1~3)를 저장한다. detail 은 12항목과 경로 도식, 적합도 사유, 예비 주제 확인 질문을 담은 TopicDetail 이다. link_kind, linkage_type, fit 은 모델 응답이 아니라 서버 계산값이다(No.124). selected 는 설계 리포트로 확정한 주제 표시다.';



CREATE TABLE IF NOT EXISTS "public"."knowledge_eval_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "knowledge_type" "text" NOT NULL,
    "mode" "text" NOT NULL,
    "params" "jsonb" NOT NULL,
    "query_count" integer NOT NULL,
    "metrics" "jsonb" NOT NULL,
    "per_query" "jsonb" NOT NULL,
    "note" "text",
    CONSTRAINT "knowledge_eval_runs_knowledge_type_check" CHECK (("knowledge_type" = ANY (ARRAY['topic_pattern'::"text", 'verified_resource'::"text"]))),
    CONSTRAINT "knowledge_eval_runs_mode_check" CHECK (("mode" = ANY (ARRAY['vector'::"text", 'hybrid'::"text"])))
);


ALTER TABLE "public"."knowledge_eval_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."knowledge_golden_queries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "knowledge_type" "text" NOT NULL,
    "grade" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "career" "text",
    "selected_topic" "text",
    "assessment_info" "text",
    "expected_resource_ids" "uuid"[] NOT NULL,
    "note" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "knowledge_golden_queries_expected_resource_ids_check" CHECK (("array_length"("expected_resource_ids", 1) >= 1)),
    CONSTRAINT "knowledge_golden_queries_knowledge_type_check" CHECK (("knowledge_type" = ANY (ARRAY['topic_pattern'::"text", 'verified_resource'::"text"])))
);


ALTER TABLE "public"."knowledge_golden_queries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learning_diagnosis_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question_key" "text",
    "option_text" "text" NOT NULL,
    "program_keys" "text" DEFAULT ''::"text",
    "sort_order" integer DEFAULT 1,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "question_id" "uuid",
    "label" "text" DEFAULT ''::"text",
    "program_ids" "text"[] DEFAULT '{}'::"text"[]
);


ALTER TABLE "public"."learning_diagnosis_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learning_diagnosis_programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_key" "text",
    "title" "text" NOT NULL,
    "badge" "text" DEFAULT '추천 서비스'::"text",
    "description" "text" DEFAULT ''::"text",
    "service_link" "text" DEFAULT ''::"text",
    "service_button_text" "text" DEFAULT '서비스 확인하기'::"text",
    "payment_link" "text" DEFAULT ''::"text",
    "payment_button_text" "text" DEFAULT '자세히 보기'::"text",
    "icon" "text" DEFAULT 'default'::"text",
    "sort_order" integer DEFAULT 1,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "primary_button_text" "text" DEFAULT '서비스 확인하기'::"text",
    "primary_button_link" "text" DEFAULT ''::"text",
    "secondary_button_text" "text" DEFAULT ''::"text",
    "secondary_button_link" "text" DEFAULT ''::"text"
);


ALTER TABLE "public"."learning_diagnosis_programs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learning_diagnosis_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question_key" "text",
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text",
    "input_type" "text" DEFAULT 'single'::"text" NOT NULL,
    "is_required" boolean DEFAULT true,
    "sort_order" integer DEFAULT 1,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "learning_diagnosis_questions_input_type_check" CHECK (("input_type" = ANY (ARRAY['single'::"text", 'multiple'::"text"])))
);


ALTER TABLE "public"."learning_diagnosis_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learning_diagnosis_v2_survey_copy" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "copy_key" "text" NOT NULL,
    "copy_value" "text" DEFAULT ''::"text" NOT NULL,
    "label" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."learning_diagnosis_v2_survey_copy" OWNER TO "postgres";


COMMENT ON TABLE "public"."learning_diagnosis_v2_survey_copy" IS '학습진단(ver2) 설문 문항의 표시 문구(제목/안내문구/선택지 라벨/리커트 문장) 키-값 저장소. scoringId·optionCodes 등 채점 구조 필드는 포함하지 않는다 — 그건 renewalSurveyQuestions.js 가 정본이고 어드민화 대상이 아니다. 공개 읽기 전체 허용, 쓰기는 어드민만. sql/72_learning_diagnosis_v2_survey_copy.sql 참고. 테이블이 없거나 특정 키가 없으면 프론트는 renewalSurveyQuestions.js 해당 필드로 폴백한다.';



CREATE TABLE IF NOT EXISTS "public"."link_code_lookups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "found" boolean NOT NULL,
    "request_ip" "inet",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."link_code_lookups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mentor_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "status" "text" DEFAULT 'submitted'::"text" NOT NULL,
    "name" "text" NOT NULL,
    "birth_date" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "email" "text" NOT NULL,
    "residence_region" "text" NOT NULL,
    "university" "text" NOT NULL,
    "major" "text" NOT NULL,
    "admission_year" integer NOT NULL,
    "enrollment_status" "text" NOT NULL,
    "admission_history" "text" NOT NULL,
    "final_admission_track" "text" NOT NULL,
    "exam_results" "text" NOT NULL,
    "highschool_region" "text" NOT NULL,
    "highschool_name" "text" NOT NULL,
    "highschool_type" "text" NOT NULL,
    "gpa_average" numeric(4,2),
    "csat_summary" "text",
    "consult_fields" "text"[] NOT NULL,
    "strongest_field_reason" "text" NOT NULL,
    "consult_grades" "text"[] NOT NULL,
    "weekly_capacity" "text" NOT NULL,
    "available_timeslot" "text" NOT NULL,
    "motivation" "text" NOT NULL,
    "strengths" "text" NOT NULL,
    "ineffective_method" "text" NOT NULL,
    "situation_answer" "text" NOT NULL,
    "tutoring_experience" "text",
    "proof_file_path" "text" NOT NULL,
    "proof_file_name" "text",
    "phone_verified_at" timestamp with time zone,
    "request_ip" "inet",
    "agree_terms" boolean DEFAULT false NOT NULL,
    "agree_privacy" boolean DEFAULT false NOT NULL,
    "agree_identity" boolean DEFAULT false NOT NULL,
    "agree_marketing" boolean DEFAULT false NOT NULL,
    "agree_ad" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "gender" "text",
    CONSTRAINT "mentor_applications_available_timeslot_check" CHECK (("available_timeslot" = ANY (ARRAY['평일 오후'::"text", '평일 저녁'::"text", '주말 오전'::"text", '주말 오후'::"text", '주말 저녁'::"text"]))),
    CONSTRAINT "mentor_applications_enrollment_status_check" CHECK (("enrollment_status" = ANY (ARRAY['재학'::"text", '휴학'::"text", '졸업'::"text"]))),
    CONSTRAINT "mentor_applications_gender_check" CHECK ((("gender" IS NULL) OR ("gender" = ANY (ARRAY['남'::"text", '여'::"text"])))),
    CONSTRAINT "mentor_applications_weekly_capacity_check" CHECK (("weekly_capacity" = ANY (ARRAY['1~2회'::"text", '3~5회'::"text", '6~9회'::"text", '10회 이상'::"text"])))
);


ALTER TABLE "public"."mentor_applications" OWNER TO "postgres";


COMMENT ON TABLE "public"."mentor_applications" IS '콜멘토 대학생 멘토 지원서(비회원 제출). 쓰기는 service_role(api/mentor-apply.js)만, 읽기는 어드민만. sql/52_mentor_applications.sql 참고.';



COMMENT ON COLUMN "public"."mentor_applications"."user_id" IS '비회원 제출이라 현재는 항상 null. 추후 회원 연동 대비 컬럼만 확보(인덱스 없음).';



COMMENT ON COLUMN "public"."mentor_applications"."proof_file_path" IS '비공개 버킷 mentor-applications의 object path. 열람은 createSignedUrl(path, TTL) — getPublicUrl 불가.';



COMMENT ON COLUMN "public"."mentor_applications"."proof_file_name" IS '클라이언트가 올린 원본 파일명(기록용, 경로에는 쓰이지 않음). 사용자 입력이므로 화면에 표시할 때 반드시 이스케이프할 것(XSS 방지).';



COMMENT ON COLUMN "public"."mentor_applications"."request_ip" IS '제출 요청 IP. api/mentor-apply.js의 checkSubmitLimits()가 이 컬럼으로 IP 기준 rate limit을 조회한다.';



COMMENT ON COLUMN "public"."mentor_applications"."gender" IS '지원자 성별 — 남/여 단일 선택(QA 시트 2026-08-21 추가). 과거 제출분엔 값이 없어 nullable.';



CREATE TABLE IF NOT EXISTS "public"."mentor_apply_copy" (
    "copy_key" "text" NOT NULL,
    "copy_value" "text" DEFAULT ''::"text" NOT NULL,
    "label" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL
);


ALTER TABLE "public"."mentor_apply_copy" OWNER TO "postgres";


COMMENT ON TABLE "public"."mentor_apply_copy" IS '멘토신청(/mentor-apply)의 반복되지 않는 단문 카피 키-값 저장소. 현재는 §7 FAQ 헤더 3키만 시드. PK는 id uuid(어드민 제네릭 CRUD 전제), copy_key는 UNIQUE. 공개 읽기 전체 허용, 쓰기는 어드민만. sql/53_mentor_apply_faq_admin.sql 참고. 테이블이 없거나 특정 키가 없으면 프론트는 src/data/mentorApply.js의 FAQ_SECTION 해당 키로 폴백한다.';



CREATE TABLE IF NOT EXISTS "public"."mentor_apply_faqs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question" "text" NOT NULL,
    "answer" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_notice" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."mentor_apply_faqs" OWNER TO "postgres";


COMMENT ON TABLE "public"."mentor_apply_faqs" IS '멘토신청(/mentor-apply) §7 FAQ 문항. 공개 읽기는 is_active=true만, 쓰기는 어드민만. sql/53_mentor_apply_faq_admin.sql 참고. 테이블이 없거나 0행이면 프론트는 src/data/mentorApply.js의 MENTOR_FAQ로 폴백한다.';



COMMENT ON COLUMN "public"."mentor_apply_faqs"."is_notice" IS '공지 FAQ 표식 — 공개 페이지에서 일반 FAQ보다 항상 위에 노출, QA C8 2026-08-27';



CREATE TABLE IF NOT EXISTS "public"."notices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "content" "text" DEFAULT ''::"text",
    "is_pinned" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "image_url" "text" DEFAULT ''::"text",
    "file_url" "text" DEFAULT ''::"text",
    "file_name" "text" DEFAULT ''::"text",
    "image_urls" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "attachments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "category" "text",
    "view_count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."notices" OWNER TO "postgres";


ALTER TABLE "public"."order_items" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."order_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."page_contents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "menu_group" "text" DEFAULT ''::"text" NOT NULL,
    "menu_label" "text" DEFAULT ''::"text" NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "subtitle" "text" DEFAULT ''::"text",
    "body" "text" DEFAULT ''::"text",
    "image_url" "text" DEFAULT ''::"text",
    "button_text" "text" DEFAULT ''::"text",
    "button_link" "text" DEFAULT ''::"text",
    "sort_order" integer DEFAULT 1,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "menu_group_order" integer DEFAULT 1,
    "image_urls" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."page_contents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parent_child_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "link_code_id" "uuid",
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responded_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "revoked_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "parent_child_links_not_self" CHECK (("parent_id" <> "student_id")),
    CONSTRAINT "parent_child_links_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."parent_child_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "payment_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "id" "uuid" NOT NULL,
    "program_key" "text" NOT NULL,
    "order_id" "text",
    "payment_provider" "text",
    "provider_payment_id" "text",
    "amount" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "paid_at" timestamp with time zone,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "payments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'failed'::"text", 'refunded'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."performance_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "storage_path" "text",
    "mime_type" "text",
    "byte_size" integer,
    "ocr_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "ocr_text" "text",
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cleanup_attempts" integer DEFAULT 0 NOT NULL,
    "cleanup_last_error_at" timestamp with time zone,
    CONSTRAINT "performance_attachments_ocr_status_check" CHECK (("ocr_status" = ANY (ARRAY['pending'::"text", 'done'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."performance_attachments" OWNER TO "postgres";


COMMENT ON TABLE "public"."performance_attachments" IS '안내문 이미지 첨부. 분석 API는 storage_path가 아니라 이 행의 id만 받는다(IDOR 차단, 명세서 §8.8).';



COMMENT ON COLUMN "public"."performance_attachments"."deleted_at" IS 'Storage 원본 실제 삭제 시각. 90일 보관 cron(api/performance/cleanup-attachments.js)과 24시간 pending 스윕이 채운다.';



COMMENT ON COLUMN "public"."performance_attachments"."cleanup_attempts" IS 'cleanup 잡(api/performance/cleanup-attachments.js)이 Storage 원본 삭제/장부 마감에 실패한 누적 횟수. 임계(5)를 넘으면 배치 대상에서 제외되고 응답의 stuck 카운트로만 보고된다.';



COMMENT ON COLUMN "public"."performance_attachments"."cleanup_last_error_at" IS 'cleanup 잡이 마지막으로 이 행 처리에 실패한 시각. 조사용이며 조회 조건에는 쓰지 않는다.';



CREATE TABLE IF NOT EXISTS "public"."performance_credit_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid",
    "profile_id" "uuid" NOT NULL,
    "delta" smallint DEFAULT '-1'::integer NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "grant_id" "uuid" NOT NULL,
    "reversal_of" "uuid",
    "source_kind" "text" DEFAULT 'performance_session'::"text" NOT NULL,
    CONSTRAINT "performance_credit_ledger_reversal_sign_check" CHECK (((("reversal_of" IS NULL) AND ("delta" < 0)) OR (("reversal_of" IS NOT NULL) AND ("delta" > 0)))),
    CONSTRAINT "performance_credit_ledger_session_id_shape_check" CHECK (((("reversal_of" IS NULL) AND ("source_kind" = 'performance_session'::"text") AND ("session_id" IS NOT NULL)) OR (("reversal_of" IS NULL) AND ("source_kind" <> 'performance_session'::"text") AND ("session_id" IS NULL)) OR (("reversal_of" IS NOT NULL) AND ("session_id" IS NULL)))),
    CONSTRAINT "performance_credit_ledger_source_kind_check" CHECK (("source_kind" = ANY ('{performance_session,mentor_call_booking,diagnosis_attempt,growth_report,selfeval_session,inquiry_session}'::"text"[])))
);


ALTER TABLE "public"."performance_credit_ledger" OWNER TO "postgres";


COMMENT ON TABLE "public"."performance_credit_ledger" IS '회차 차감 원장. session_id UNIQUE가 멱등 가드다(세션당 최대 1회 차감). 클라이언트 write 정책 없음 — 차감은 consume_performance_credit RPC(service_role)만 한다.';



COMMENT ON COLUMN "public"."performance_credit_ledger"."grant_id" IS '이 소비가 차감된 부여(program_access_grants.id). 회차 잔여는 이제 이 컬럼으로 부여별로 계산한다 — (사용자, program_key) 1행 집계가 아니다(결함 A/B/C, sql/65). program_key 컬럼을 원장에 따로 두지 않는다 — grant_id → grants.program_key 파생값이고, 파생 컬럼을 심는 것이 애초에 고치는 병이다.';



COMMENT ON COLUMN "public"."performance_credit_ledger"."reversal_of" IS '이 행이 되돌리는 원본 소비 행(self-FK, 같은 테이블). NULL = 원본 차감. 정책: 콜멘토 등 "예약 확정 시 차감 → 멘토 사정으로 취소·변경 시 그 차감 1건만 되돌림"(사용자 확정, sql/66) — 부여 전체를 닫는 환불(program_access_grants.revoked_at)과는 다른 사건이다. 되돌림 행의 session_id 는 항상 NULL 이다(아래 4절 CHECK, 원본 세션은 reversal_of 조인으로 구한다). performance_credit_ledger_reversal_of_uniq 로 같은 원본의 이중 되돌림을 막는다.';



COMMENT ON COLUMN "public"."performance_credit_ledger"."source_kind" IS '이 소비 행이 무엇을 차감한 것인지. performance_session(기본값, 배포된 consume_performance_credit 이 이 값으로 남긴다) / mentor_call_booking(콜멘토, 소비 함수 미구현 — 위 헤더 "향후 콜멘토 소비 함수 모양" 참고, sql/66). 새 종류가 생기면 CHECK 목록에 추가한다.';



COMMENT ON CONSTRAINT "performance_credit_ledger_reversal_sign_check" ON "public"."performance_credit_ledger" IS '원본 소비 행(reversal_of is null)은 delta<0, 되돌림 행(reversal_of is not null)은 delta>0. quota_used 집계가 sum(-delta) 라 이 부호만으로 되돌림이 자동으로 잔여를 회복시킨다(sql/65 §2/§6, count(*) 아님 — sql/66 조사 b).';



COMMENT ON CONSTRAINT "performance_credit_ledger_session_id_shape_check" ON "public"."performance_credit_ledger" IS 'session_id 는 source_kind=performance_session 인 원본 차감 행에만 필수다. 콜멘토 등 다른 소비원의 원본 행과 모든 되돌림 행(reversal_of not null)은 session_id 를 항상 NULL 로 둔다 — 원본 세션이 필요하면 reversal_of → 원본 행 → session_id 로 조인해서 구한다(sql/66, "되돌림 표현 설계" 절).';



CREATE TABLE IF NOT EXISTS "public"."performance_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "seq" integer NOT NULL,
    "role" "text" NOT NULL,
    "kind" "text" DEFAULT 'text'::"text" NOT NULL,
    "body" "text",
    "payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "performance_messages_kind_check" CHECK (("kind" = ANY (ARRAY['text'::"text", 'loading'::"text", 'card'::"text"]))),
    CONSTRAINT "performance_messages_role_check" CHECK (("role" = ANY (ARRAY['ai'::"text", 'user'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."performance_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."performance_messages" IS '수행평가 채팅 타임라인. 서버(service_role)만 write한다.';



CREATE TABLE IF NOT EXISTS "public"."performance_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "report_type" "text" NOT NULL,
    "sections" "jsonb" NOT NULL,
    "score" smallint,
    "summary" "text",
    "model" "text",
    "prompt_version" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "topic_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submission_id" "uuid",
    CONSTRAINT "performance_reports_report_type_check" CHECK (("report_type" = ANY (ARRAY['design'::"text", 'evaluation'::"text", 'final_submission'::"text"]))),
    CONSTRAINT "performance_reports_score_check" CHECK ((("score" IS NULL) OR (("score" >= 0) AND ("score" <= 100))))
);


ALTER TABLE "public"."performance_reports" OWNER TO "postgres";


COMMENT ON TABLE "public"."performance_reports" IS '설계/평가/최종 리포트 3종. 외부 앱의 draft 리포트 행은 이식하지 않는다(중간저장은 performance_submissions.is_draft).';



COMMENT ON COLUMN "public"."performance_reports"."topic_id" IS '설계 리포트가 만들어진 대상 주제(performance_topics). evaluation/final_submission은 null. 주제 행이 지워져도 리포트는 남기므로 on delete set null이다.';



COMMENT ON COLUMN "public"."performance_reports"."updated_at" IS '마지막 갱신 시각. 설계 리포트는 세션당 1행을 덮어쓰며 재생성하므로(부분 UNIQUE) created_at만으로는 재생성 시점을 알 수 없다.';



COMMENT ON COLUMN "public"."performance_reports"."submission_id" IS '평가/최종 리포트가 대상으로 삼은 제출본(performance_submissions). design은 null. 제출 행이 지워져도 리포트는 스냅샷으로 남기므로 on delete set null이다.';



CREATE TABLE IF NOT EXISTS "public"."performance_session_vectors" (
    "session_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "grade_label" "text",
    "subject_group" "text",
    "subject" "text",
    "career_goal" "text",
    "topic_title" "text",
    "summary_text" "text",
    "search_text" "text",
    "embedding" "extensions"."vector"(768),
    "embedding_model" "text",
    "embedding_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "embedding_error" "text",
    "embedded_at" timestamp with time zone,
    "rag_use" boolean DEFAULT false NOT NULL,
    "content_hash" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "performance_session_vectors_embedding_status_check" CHECK (("embedding_status" = ANY (ARRAY['pending'::"text", 'done'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."performance_session_vectors" OWNER TO "postgres";


COMMENT ON TABLE "public"."performance_session_vectors" IS '학생 과거 수행 RAG 벡터(임베딩 단위 = 세션 1건). rag_use는 평가 리포트 생성/최종 확정 시에만 true로 승격한다.';



COMMENT ON COLUMN "public"."performance_session_vectors"."search_text" IS '임베딩 입력. 외부 앱 조립에서 학생코드·학생명 2줄을 제거하고 이식했다(PII 배제 + 동명이인 유사도 오염 방지).';



CREATE TABLE IF NOT EXISTS "public"."performance_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "current_step" smallint DEFAULT 1 NOT NULL,
    "completed_steps" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
    "grade_label" "text",
    "semester" "text",
    "school_type" "text",
    "subject_group" "text",
    "subject" "text",
    "previous_topic" "text",
    "career_goal" "text",
    "guide_input_mode" "text",
    "guide_freetext" "text",
    "guide_json" "jsonb",
    "submission_format" "text",
    "submission_schema" "jsonb",
    "selected_topic_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "guide_analysis_count" integer DEFAULT 0 NOT NULL,
    "topic_attempt_count" integer DEFAULT 0 NOT NULL,
    "design_generation_count" integer DEFAULT 0 NOT NULL,
    "design_attempt_count" integer DEFAULT 0 NOT NULL,
    "evaluation_count" integer DEFAULT 0 NOT NULL,
    "evaluation_attempt_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "performance_sessions_career_goal_required_check" CHECK ((("status" = 'draft'::"text") OR ("career_goal" IS NOT NULL))),
    CONSTRAINT "performance_sessions_current_step_check" CHECK ((("current_step" >= 1) AND ("current_step" <= 5))),
    CONSTRAINT "performance_sessions_guide_input_mode_check" CHECK ((("guide_input_mode" IS NULL) OR ("guide_input_mode" = ANY (ARRAY['upload'::"text", 'manual'::"text"])))),
    CONSTRAINT "performance_sessions_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'in_progress'::"text", 'completed'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."performance_sessions" OWNER TO "postgres";


COMMENT ON TABLE "public"."performance_sessions" IS '수행평가 세션 1건(회원당 N건). 외부 앱 api_sessions + conversations 통합 대체. id는 리소스 ID일 뿐 인증 수단이 아니다.';



COMMENT ON COLUMN "public"."performance_sessions"."school_type" IS 'profiles.school_type의 세션 시점 스냅샷. 값이 없으면 null — 리터럴 기본값(''일반고'') 금지(외부 앱 api/login.js:65 하드코딩 이식 금지).';



COMMENT ON COLUMN "public"."performance_sessions"."selected_topic_id" IS '확정 주제. 외부 앱의 selected_topic = ''주제|||상세'' 결합 문자열과 오타 컬럼 selected_topic_detai를 대체한다.';



COMMENT ON COLUMN "public"."performance_sessions"."guide_analysis_count" IS '안내문 vision 분석(api/performance/analyze-guide.js)을 실제로 호출한 누적 횟수. 무차감 엔드포인트(§9.2)라 회차 대신 이 값으로 세션당 상한을 건다. 멱등 단축 반환은 올리지 않는다.';



COMMENT ON COLUMN "public"."performance_sessions"."topic_attempt_count" IS '주제 추천(api/performance/recommend-topics.js)이 실제로 모델을 호출한 누적 시도 횟수(성공·실패 모두 포함). 구조 실패는 무차감 + performance_topics 무기록이라 라운드 상한이 오르지 않으므로, 남용 상한을 이 값으로 따로 건다(§9.2 — 회차를 더 깎아 막지 않는다). 저장분 멱등 재생은 올리지 않는다.';



COMMENT ON COLUMN "public"."performance_sessions"."design_generation_count" IS '설계 리포트를 실제로 생성·재생성한 누적 횟수(성공만). 상한 3(최초 1 + 재생성 2, §9.3) 초과 시 429 RATE_LIMITED. commit_performance_design_report가 리포트 저장과 같은 트랜잭션에서 올린다.';



COMMENT ON COLUMN "public"."performance_sessions"."design_attempt_count" IS '설계 리포트(api/performance/design-report.js)가 실제로 모델을 호출한 누적 시도 횟수(성공·실패 모두 포함). 구조 실패는 무차감 + 리포트 무기록이라 생성 상한이 오르지 않으므로, 남용 상한을 이 값으로 따로 건다(§9.2 — 회차를 더 깎아 막지 않는다). 멱등 재생은 올리지 않는다.';



COMMENT ON COLUMN "public"."performance_sessions"."evaluation_count" IS '평가 리포트를 실제로 생성한 누적 횟수(성공만). 상한 3(최초 1 + 재평가 2, §9.2) 초과 시 409 REEVALUATION_LIMIT. commit_performance_evaluation_report가 리포트 저장과 같은 트랜잭션에서 올린다.';



COMMENT ON COLUMN "public"."performance_sessions"."evaluation_attempt_count" IS '평가(api/performance/evaluate.js)가 실제로 모델을 호출한 누적 시도 횟수(성공·실패 모두 포함). 모델 실패는 리포트 무기록이라 생성 상한이 오르지 않으므로 남용 상한을 이 값으로 따로 건다(§9.2 — 회차를 더 깎아 막지 않는다). 멱등 재생은 올리지 않는다.';



CREATE TABLE IF NOT EXISTS "public"."performance_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "revision" smallint DEFAULT 1 NOT NULL,
    "fields" "jsonb" NOT NULL,
    "char_counts" "jsonb",
    "is_draft" boolean DEFAULT true NOT NULL,
    "is_final" boolean DEFAULT false NOT NULL,
    "finalized_at" timestamp with time zone,
    "finalize_reason" "text",
    "submitted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "performance_submissions_finalize_reason_check" CHECK ((("finalize_reason" IS NULL) OR ("finalize_reason" = ANY (ARRAY['confirm'::"text", 'new_assessment'::"text"])))),
    CONSTRAINT "performance_submissions_revision_check" CHECK (("revision" >= 1))
);


ALTER TABLE "public"."performance_submissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."performance_submissions" IS '학생 작성물. fields는 자유 키 jsonb(문항형 최대 20필드). 세션당 is_final 행은 부분 UNIQUE 인덱스로 최대 1건.';



CREATE TABLE IF NOT EXISTS "public"."performance_topics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "round" smallint DEFAULT 1 NOT NULL,
    "idx" smallint NOT NULL,
    "title" "text",
    "subtitle" "text",
    "tags" "text"[],
    "detail" "jsonb",
    "selected" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "performance_topics_idx_check" CHECK ((("idx" >= 1) AND ("idx" <= 3))),
    CONSTRAINT "performance_topics_round_check" CHECK (("round" >= 1))
);


ALTER TABLE "public"."performance_topics" OWNER TO "postgres";


COMMENT ON TABLE "public"."performance_topics" IS '추천 주제 후보(라운드당 3장). detail은 6요소 고정 배열 [{id,label,text}×6].';



CREATE TABLE IF NOT EXISTS "public"."phone_verifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phone" "text" NOT NULL,
    "code_hash" "text" NOT NULL,
    "purpose" "text" DEFAULT 'signup'::"text" NOT NULL,
    "user_id" "uuid",
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "verified_at" timestamp with time zone,
    "consumed_at" timestamp with time zone,
    "expires_at" timestamp with time zone NOT NULL,
    "request_ip" "inet",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "phone_verifications_attempt_range" CHECK (("attempt_count" >= 0)),
    CONSTRAINT "phone_verifications_phone_format" CHECK (("phone" ~ '^[0-9]{9,11}$'::"text")),
    CONSTRAINT "phone_verifications_purpose_check" CHECK (("purpose" = ANY (ARRAY['signup'::"text", 'parent_signup'::"text", 'phone_change'::"text", 'mentor_apply'::"text", 'find_account'::"text", 'reset_password'::"text", 'guardian_signup'::"text", 'guardian_change'::"text"])))
);


ALTER TABLE "public"."phone_verifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."popups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "content" "text" DEFAULT ''::"text",
    "url" "text" DEFAULT ''::"text",
    "image_url" "text" DEFAULT ''::"text",
    "start_date" "date",
    "end_date" "date",
    "open_new_window" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "mobile_image_url" "text" DEFAULT ''::"text"
);


ALTER TABLE "public"."popups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."premium_book_pages" (
    "id" bigint NOT NULL,
    "sort_order" integer DEFAULT 1 NOT NULL,
    "image_url" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."premium_book_pages" OWNER TO "postgres";


ALTER TABLE "public"."premium_book_pages" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."premium_book_pages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."premium_consult_requests" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "email" "text" DEFAULT ''::"text" NOT NULL,
    "service" "text" DEFAULT ''::"text" NOT NULL,
    "message" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "admin_note" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "premium_consult_requests_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'contacted'::"text", 'done'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."premium_consult_requests" OWNER TO "postgres";


ALTER TABLE "public"."premium_consult_requests" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."premium_consult_requests_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."program_access" (
    "id" "uuid" NOT NULL,
    "program_key" "text" NOT NULL,
    "payment_status" "text" DEFAULT 'unpaid'::"text" NOT NULL,
    "access_status" "text" DEFAULT 'inactive'::"text" NOT NULL,
    "paid_amount" integer DEFAULT 0,
    "paid_at" timestamp with time zone,
    "access_started_at" timestamp with time zone,
    "access_expires_at" timestamp with time zone,
    "memo" "text",
    "meta" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "profile_id" "uuid",
    "user_id" "uuid",
    "starts_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    CONSTRAINT "program_access_access_status_check" CHECK (("access_status" = ANY (ARRAY['inactive'::"text", 'active'::"text", 'expired'::"text", 'suspended'::"text"]))),
    CONSTRAINT "program_access_identity_equality_check" CHECK (((("profile_id" IS NULL) OR ("profile_id" = "id")) AND (("user_id" IS NULL) OR ("user_id" = "id")))),
    CONSTRAINT "program_access_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['unpaid'::"text", 'pending'::"text", 'paid'::"text", 'refunded'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."program_access" OWNER TO "postgres";


COMMENT ON COLUMN "public"."program_access"."access_expires_at" IS '정본 아님 — 표시·호환 전용. fn_sync_program_access_cache(sql/64 §7, sql/65 4절)가 부여 원장에서 파생해 채우는 미러값이다. 판정 근거는 program_access_grants(부여 원장)이고, 이 컬럼을 읽는 게이트는 이 저장소에 없다(sql/65 결함 B/정정 2).';



COMMENT ON COLUMN "public"."program_access"."expires_at" IS '정본 아님 — 표시·호환 전용. access_expires_at 과 같은 값을 미러링한다(sql/64 (가)절 — 배포된 소비 함수가 coalesce(access_expires_at, expires_at) 로 읽으므로 두 컬럼을 함께 쓴다). 판정 근거는 program_access_grants(부여 원장)이다.';



COMMENT ON CONSTRAINT "program_access_identity_equality_check" ON "public"."program_access" IS 'id(정본, FK → profiles) / profile_id / user_id 는 같은 uuid 여야 한다. 이 등호가 없으면 3컬럼 OR 판정과 id 단일 회수가 서로 다른 행을 봐서 회수 후에도 권한이 남는다(M15, 2026-08-12).';



CREATE TABLE IF NOT EXISTS "public"."program_access_grants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "program_key" "text" NOT NULL,
    "order_id" "text",
    "order_item_id" bigint,
    "product_id" "uuid",
    "product_slug" "text",
    "granted_by" "text" NOT NULL,
    "granted_by_actor" "uuid",
    "granted_months" integer,
    "granted_sessions" integer,
    "paid_amount" integer DEFAULT 0 NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "expires_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "revoke_reason" "text",
    "memo" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "first_accessed_at" timestamp with time zone,
    "validity_days" integer,
    CONSTRAINT "pag_admin_actor_check" CHECK ((("granted_by" <> 'admin'::"text") OR ("granted_by_actor" IS NOT NULL))),
    CONSTRAINT "pag_entitlement_shape_check" CHECK ((NOT (("granted_months" IS NULL) AND ("granted_sessions" IS NULL)))),
    CONSTRAINT "pag_expiry_derivation_check" CHECK (((("granted_months" IS NULL) AND ("validity_days" IS NULL)) = ("expires_at" IS NULL))),
    CONSTRAINT "pag_payment_item_pairing_check" CHECK ((("granted_by" = 'payment'::"text") = ("order_item_id" IS NOT NULL))),
    CONSTRAINT "pag_payment_order_pairing_check" CHECK ((("granted_by" = 'payment'::"text") = ("order_id" IS NOT NULL))),
    CONSTRAINT "pag_period_order_check" CHECK ((("expires_at" IS NULL) OR ("expires_at" > "starts_at"))),
    CONSTRAINT "pag_revoke_pairing_check" CHECK ((("revoked_at" IS NULL) = ("revoke_reason" IS NULL))),
    CONSTRAINT "pag_validity_days_positive_check" CHECK ((("validity_days" IS NULL) OR ("validity_days" > 0))),
    CONSTRAINT "program_access_grants_granted_by_check" CHECK (("granted_by" = ANY (ARRAY['payment'::"text", 'admin'::"text", 'promotion'::"text", 'qa'::"text"]))),
    CONSTRAINT "program_access_grants_granted_months_check" CHECK ((("granted_months" IS NULL) OR ("granted_months" > 0))),
    CONSTRAINT "program_access_grants_granted_sessions_check" CHECK ((("granted_sessions" IS NULL) OR ("granted_sessions" > 0))),
    CONSTRAINT "program_access_grants_paid_amount_check" CHECK (("paid_amount" >= 0))
);


ALTER TABLE "public"."program_access_grants" OWNER TO "postgres";


COMMENT ON TABLE "public"."program_access_grants" IS '이용 권한 부여 원장(M6). 부여 1건 = 1행이며 DELETE 하지 않는다(회수는 revoked_at/revoke_reason). program_access 는 이 원장에서 파생된 캐시다 — 기간·회차·금액은 살아있는(revoked_at is null) 행에서 매번 재계산된다(sql/64 (마)).';



COMMENT ON COLUMN "public"."program_access_grants"."granted_by" IS '부여 출처. payment=결제(order_id·order_item_id 필수) / admin=관리자 수동(granted_by_actor 필수) / promotion / qa. 이 컬럼이 없던 시절에는 결제 부여와 수동 부여를 데이터로 구별할 수 없었다(M6).';



COMMENT ON COLUMN "public"."program_access_grants"."granted_by_actor" IS '수동 부여를 실행한 관리자 profiles.id 스냅샷. **FK 없음** — 행위자 삭제가 감사 이력을 지우거나 계정 삭제를 막지 않도록 의도적으로 스냅샷이다(테이블 정의 주석 참고).';



COMMENT ON COLUMN "public"."program_access_grants"."granted_months" IS '부여 시점 products.duration_months 스냅샷. 상품 정의가 나중에 바뀌어도 이미 판 기간은 바뀌지 않는다.';



COMMENT ON COLUMN "public"."program_access_grants"."granted_sessions" IS '부여 시점 products.session_quota 스냅샷. NULL = 무제한.';



COMMENT ON COLUMN "public"."program_access_grants"."paid_amount" IS '이 부여 라인의 결제 금액(order_items.price * quantity 스냅샷). ⚠ 정산 정본이 아니다 — 쿠폰 할인은 주문 레벨(orders.discount_amount)에만 있고 order_items 에 할인 컬럼이 없어 라인 단위 실수령액을 계산할 근거가 없다(기존 결함 승계, sql/64 제외 목록).';



COMMENT ON COLUMN "public"."program_access_grants"."expires_at" IS '이용 기간의 **배타 상한**. NULL = 무기한. now() < expires_at 이 "만료일 24시까지"를 정확히 표현한다. 화면 표시용 만료일은 이 값 - 1일의 KST 날짜부다(sql/64 (다)).';



COMMENT ON COLUMN "public"."program_access_grants"."first_accessed_at" IS '이 부여로 프로그램에 최초 진입한 시각. NULL = 미진입(=미소비). fn_request_refund(5-b절) 의 소비 게이트(WC032)가 기간권 축 판정에 이 컬럼을 쓴다. fn_mark_program_entry 가 최초 1회만 채우고 이후 UPDATE 는 없다 — 이 컬럼을 쓰는 호출자(목표관리 앱)가 아직 배선되지 않아(goal-app-api 브랜치 미머지) 1차 운영에서는 항상 NULL 이다(sql/68 5-j절).';



COMMENT ON COLUMN "public"."program_access_grants"."validity_days" IS '부여 시점 products.validity_days 스냅샷(1회권 30일, 제33조의1 ⑤). 이 컬럼이 생기기 전(20260901)에 부여된 1회권은 NULL = 무기한 그대로다 — 불리 변경 비소급(§2-7).';



COMMENT ON CONSTRAINT "pag_expiry_derivation_check" ON "public"."program_access_grants" IS '만료는 기간(granted_months) 또는 유효기간(validity_days)에서만 파생된다. 둘 다 NULL 이면 무기한(expires_at NULL) — 20260901 에 validity_days 축을 더해 완화(§2-7). 이 완화 전에 부여된 1회권(둘 다 NULL·만료 NULL)은 그대로 유효하다.';



CREATE TABLE IF NOT EXISTS "public"."program_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text",
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "link" "text" DEFAULT '/services'::"text",
    "icon" "text" DEFAULT 'default'::"text",
    "icon_image_url" "text",
    "is_premium" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."program_categories" OWNER TO "postgres";


COMMENT ON COLUMN "public"."program_categories"."is_premium" IS '랜딩 핵심 서비스 카드에 PREMIUM 배지를 표시할지 여부. 프리미엄 서비스(컨설팅/국제·해외 등) 카드만 true.';



CREATE TABLE IF NOT EXISTS "public"."programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "app_url" "text",
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."programs" OWNER TO "postgres";


ALTER TABLE "public"."refund_requests" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."refund_requests_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."refunds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payment_id" "uuid",
    "payer_name" "text" DEFAULT ''::"text",
    "program_name" "text" DEFAULT ''::"text",
    "class_name" "text" DEFAULT ''::"text",
    "paid_amount" integer DEFAULT 0,
    "refund_amount" integer DEFAULT 0,
    "reason" "text" DEFAULT ''::"text",
    "status" "text" DEFAULT '취소요청'::"text",
    "requested_at" timestamp with time zone DEFAULT "now"(),
    "memo" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."refunds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" bigint NOT NULL,
    "student_name" "text",
    "school_result" "text",
    "content" "text" NOT NULL,
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


ALTER TABLE "public"."reviews" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."reviews_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."selfeval_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "report_type" "text" NOT NULL,
    "revision" integer NOT NULL,
    "sections" "jsonb" NOT NULL,
    "char_count" "jsonb",
    "score" integer,
    "mandatory_fixes" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "selfeval_reports_report_type_check" CHECK (("report_type" = ANY (ARRAY['generation'::"text", 'edited'::"text", 'verification'::"text", 'final'::"text"]))),
    CONSTRAINT "selfeval_reports_revision_check" CHECK (("revision" >= 1)),
    CONSTRAINT "selfeval_reports_score_check" CHECK ((("score" IS NULL) OR (("score" >= 0) AND ("score" <= 100))))
);


ALTER TABLE "public"."selfeval_reports" OWNER TO "postgres";


COMMENT ON TABLE "public"."selfeval_reports" IS '자기평가서 리포트 이력. 같은 report_type 은 revision 1부터 쌓이고 덮어쓰지 않는다(재생성, 재검증 이력 보존). generation, edited, final 의 sections 는 api/_lib/selfeval/types.ts 의 GenerationSections, verification 의 sections 는 VerificationSections 와 같은 키다. 수정하지 않는 이력 표라 updated_at 이 없다.';



COMMENT ON COLUMN "public"."selfeval_reports"."char_count" IS '글자 수. api/_lib/selfeval/types.ts 의 CharCount(withSpace, withoutSpace)와 같은 키.';



COMMENT ON COLUMN "public"."selfeval_reports"."mandatory_fixes" IS '제출 전 필수 수정 목록. api/_lib/selfeval/types.ts 의 MandatoryFix 배열. verification 리포트에서만 쓴다.';



CREATE TABLE IF NOT EXISTS "public"."selfeval_session_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "activity_record_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "fit_score" numeric(5,2),
    "fit_reasons" "jsonb",
    "analysis" "jsonb",
    "analysis_source" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "selfeval_session_activities_analysis_source_check" CHECK (("analysis_source" = ANY (ARRAY['model'::"text", 'student'::"text"]))),
    CONSTRAINT "selfeval_session_activities_role_check" CHECK (("role" = ANY (ARRAY['core'::"text", 'support'::"text"])))
);


ALTER TABLE "public"."selfeval_session_activities" OWNER TO "postgres";


COMMENT ON TABLE "public"."selfeval_session_activities" IS '자기평가서 세션이 쓰는 활동. role 은 core(핵심 1개) 또는 support(보조 최대 2개)이다. 활동이 쓰이는 동안 지워지지 않도록 activity_records 는 on delete restrict 로 참조한다(회원탈퇴 함수가 이 표를 먼저 지운다).';



COMMENT ON COLUMN "public"."selfeval_session_activities"."fit_score" IS '적합도 점수 0~100. 학생이 직접 입력한 활동은 계산 대상이 아니라 null 이다.';



COMMENT ON COLUMN "public"."selfeval_session_activities"."fit_reasons" IS '적합도 판정 결과. api/_lib/selfeval/types.ts 의 FitResult 와 같은 키(signals, reasons).';



COMMENT ON COLUMN "public"."selfeval_session_activities"."analysis" IS '활동별 11항목 분석. api/_lib/selfeval/types.ts 의 Analysis 와 같은 키(values, sources, conflicts).';



COMMENT ON COLUMN "public"."selfeval_session_activities"."analysis_source" IS 'analysis 의 출처. model 은 모델 분석, student 는 학생이 고친 값.';



CREATE TABLE IF NOT EXISTS "public"."selfeval_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "current_step" smallint DEFAULT 0 NOT NULL,
    "academic_year" integer,
    "grade_label" "text",
    "semester" smallint,
    "area" "text",
    "subject" "text",
    "activity_name" "text",
    "school_prompt" "text",
    "teacher_note" "text",
    "target_chars" integer,
    "target_chars_mode" "text" DEFAULT 'with_space'::"text" NOT NULL,
    "career" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "growth_report_id" "uuid",
    "growth_applied" boolean DEFAULT false NOT NULL,
    "growth_snapshot" "jsonb",
    "plan_item_id" "uuid",
    "reply_pending" "jsonb",
    "regenerate_count" integer DEFAULT 0 NOT NULL,
    "step_state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ledger_id" "uuid",
    "ledger_reversed_at" timestamp with time zone,
    "last_activity_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "selfeval_sessions_academic_year_check" CHECK ((("academic_year" >= 2000) AND ("academic_year" <= 2100))),
    CONSTRAINT "selfeval_sessions_area_check" CHECK (("area" = ANY (ARRAY['subject'::"text", 'autonomy'::"text", 'club'::"text", 'career'::"text"]))),
    CONSTRAINT "selfeval_sessions_completed_has_completed_at" CHECK ((("status" <> 'completed'::"text") OR ("completed_at" IS NOT NULL))),
    CONSTRAINT "selfeval_sessions_current_step_check" CHECK ((("current_step" >= 0) AND ("current_step" <= 6))),
    CONSTRAINT "selfeval_sessions_grade_label_check" CHECK (("grade_label" = ANY (ARRAY['고1'::"text", '고2'::"text", '고3'::"text"]))),
    CONSTRAINT "selfeval_sessions_regenerate_count_check" CHECK ((("regenerate_count" >= 0) AND ("regenerate_count" <= 3))),
    CONSTRAINT "selfeval_sessions_reversed_needs_ledger" CHECK ((("ledger_reversed_at" IS NULL) OR ("ledger_id" IS NOT NULL))),
    CONSTRAINT "selfeval_sessions_semester_check" CHECK (("semester" = ANY (ARRAY[1, 2]))),
    CONSTRAINT "selfeval_sessions_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'in_progress'::"text", 'completed'::"text", 'archived'::"text"]))),
    CONSTRAINT "selfeval_sessions_target_chars_check" CHECK ((("target_chars" IS NULL) OR (("target_chars" >= 100) AND ("target_chars" <= 3000)))),
    CONSTRAINT "selfeval_sessions_target_chars_mode_check" CHECK (("target_chars_mode" = ANY (ARRAY['with_space'::"text", 'without_space'::"text"])))
);


ALTER TABLE "public"."selfeval_sessions" OWNER TO "postgres";


COMMENT ON TABLE "public"."selfeval_sessions" IS '자기평가서 작성 세션. 미완 세션(draft/in_progress)은 학생당 1개만 허용한다(명세 No.15). current_step 은 0 생성됨, 1 기본 입력 저장, 2 활동 선택 확정, 3 분석 완료, 4 생성 성공, 5 검증 완료, 6 최종 저장이다. ledger_id 는 첫 모델 호출 단계(write) 성공 시 차감한 performance_credit_ledger 행(consume_selfeval_credit), ledger_reversed_at 은 되돌림 시각(reverse_selfeval_credit)이다. 읽기는 본인/관리자만이고 쓰기는 service_role 만이다.';



COMMENT ON COLUMN "public"."selfeval_sessions"."subject" IS '교과 영역(area=subject)일 때의 과목명.';



COMMENT ON COLUMN "public"."selfeval_sessions"."activity_name" IS '창의적 체험활동 영역(자율, 동아리, 진로)일 때의 활동명.';



COMMENT ON COLUMN "public"."selfeval_sessions"."career" IS '진로 정보. api/_lib/selfeval/types.ts 의 CareerInfo(career, department, universities)와 같은 키. 세션 생성 때 student_profiles 값으로 채우고 이후에는 이 세션 값이 정본이다.';



COMMENT ON COLUMN "public"."selfeval_sessions"."growth_snapshot" IS '세션 생성 시점에 고정한 성장설계 수신 8종. api/_lib/selfeval/types.ts 의 GrowthSnapshot 과 같은 키. 이후 성장설계가 다시 발급되어도 이 세션은 변하지 않는다.';



COMMENT ON COLUMN "public"."selfeval_sessions"."reply_pending" IS '성장설계 회신 실패 기록(명세 No.75). api/_lib/selfeval/types.ts 의 ReplyPending 과 같은 키. 다음 진입 때 서버가 다시 보낸다.';



COMMENT ON COLUMN "public"."selfeval_sessions"."step_state" IS '모델 호출 단계 운영 상태. api/_lib/selfeval/types.ts 의 StepState 와 같은 키. steps 는 analyze, write, verify 키에 {status(pending/running/ok/failed), attempts, startedAt, finishedAt, issues} 를 담고 terminal 은 {reason, at, step} 형태의 종결 사유다. 재시도와 장애 추적용이며 결과 데이터는 담지 않는다.';



CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" bigint NOT NULL,
    "title" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "icon" "text",
    "link" "text",
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."services" OWNER TO "postgres";


ALTER TABLE "public"."services" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."services_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."special_highschool_acceptance_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "year" integer NOT NULL,
    "rate" numeric(5,2) DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "special_highschool_acceptance_rates_rate_range" CHECK ((("rate" >= (0)::numeric) AND ("rate" <= (100)::numeric)))
);


ALTER TABLE "public"."special_highschool_acceptance_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."special_highschool_cases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_name" "text" NOT NULL,
    "school_type" "text" NOT NULL,
    "year" integer NOT NULL,
    "student_name" "text" NOT NULL,
    "result_label" "text" DEFAULT '합격자'::"text" NOT NULL,
    "middle_school" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "special_highschool_cases_school_type_check" CHECK (("school_type" = ANY (ARRAY['자사고'::"text", '외고'::"text", '국제고'::"text", '영재고'::"text", '과학고'::"text"]))),
    CONSTRAINT "special_highschool_cases_year_range" CHECK ((("year" >= 2000) AND ("year" <= 2100)))
);


ALTER TABLE "public"."special_highschool_cases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sso_tickets" (
    "ticket_id" "uuid" NOT NULL,
    "ticket_hash" "text" NOT NULL,
    "service_key" "text" NOT NULL,
    "winning_user_id" "uuid" NOT NULL,
    "user_name" "text",
    "issued_at" timestamp with time zone NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "used_by_service" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sso_tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_link_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deactivated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "student_link_codes_code_format" CHECK (("code" ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$'::"text"))
);


ALTER TABLE "public"."student_link_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_profiles" (
    "profile_id" "uuid" NOT NULL,
    "school_type" "text",
    "admission_year" integer,
    "grade" "text",
    "semester" smallint,
    "career" "text",
    "department" "text",
    "universities" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "student_profiles_admission_year_check" CHECK ((("admission_year" >= 2000) AND ("admission_year" <= 2100))),
    CONSTRAINT "student_profiles_grade_check" CHECK (("grade" = ANY (ARRAY['고1'::"text", '고2'::"text", '고3'::"text", '졸업'::"text", 'N수'::"text"]))),
    CONSTRAINT "student_profiles_school_type_check" CHECK (("school_type" = ANY (ARRAY['일반고'::"text", '특목고'::"text", '특목,자사,영재고'::"text"]))),
    CONSTRAINT "student_profiles_semester_check" CHECK (("semester" = ANY (ARRAY[1, 2]))),
    CONSTRAINT "student_profiles_universities_check" CHECK (("cardinality"("universities") <= 2))
);


ALTER TABLE "public"."student_profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."student_profiles" IS '학생 공용 프로필(학생당 1행). 정본은 이 테이블이다. goal_students 와 profiles 의 school_type, grade 는 초기값 소스일 뿐이며 역동기화하지 않는다. 여섯 서비스가 공유하는 학년, 학교유형, 진로, 희망 대학(최대 2개)만 둔다. 성장설계 전용 값(설문 응답, 트랙)은 growth_profiles 에 둔다. 읽기=본인/연결 학부모/관리자, 쓰기=본인, delete 정책 없음(탈퇴는 fn_delete_account).';



CREATE TABLE IF NOT EXISTS "public"."tenant_code_attempts" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "attempted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tenant_code_attempts" OWNER TO "postgres";


COMMENT ON TABLE "public"."tenant_code_attempts" IS '20260922 — 소속 코드 조회(fn_resolve_tenant_code) 실패 시도 기록. 1시간 10회 상한(WC068)의 재료. RLS enable + 정책 없음 + 전 role revoke로 이중 방어 — 이 테이블은 definer 함수를 통해서만 접근 가능하다.';



CREATE SEQUENCE IF NOT EXISTS "public"."tenant_code_attempts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."tenant_code_attempts_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tenant_code_attempts_id_seq" OWNED BY "public"."tenant_code_attempts"."id";



CREATE TABLE IF NOT EXISTS "public"."terms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "version" "text" NOT NULL,
    "audience" "text" DEFAULT 'common'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "route" "text",
    "content" "text",
    "is_required" boolean DEFAULT true NOT NULL,
    "profile_column" "text",
    "effective_from" "date" DEFAULT CURRENT_DATE NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "terms_audience_check" CHECK (("audience" = ANY (ARRAY['student'::"text", 'parent'::"text", 'mentor'::"text", 'common'::"text"])))
);


ALTER TABLE "public"."terms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trending_departments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "university_name" "text" NOT NULL,
    "department_name" "text" NOT NULL,
    "university_key" "text",
    "department_key" "text",
    "logo_url" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."trending_departments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."university_acceptances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "emblem_url" "text",
    "subtitle" "text",
    "count" integer,
    "track" "text" DEFAULT 'general'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "university_acceptances_track_check" CHECK (("track" = ANY (ARRAY['general'::"text", 'medical_special'::"text", 'graduate'::"text"])))
);


ALTER TABLE "public"."university_acceptances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usage_status" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "term_name" "text" DEFAULT ''::"text",
    "category_name" "text" DEFAULT ''::"text",
    "program_name" "text" DEFAULT ''::"text",
    "class_name" "text" DEFAULT ''::"text",
    "capacity" integer DEFAULT 0,
    "applicant_count" integer DEFAULT 0,
    "confirmed_count" integer DEFAULT 0,
    "remaining_count" integer DEFAULT 0,
    "status" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."usage_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_term_agreements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "term_id" "uuid" NOT NULL,
    "agreed" boolean NOT NULL,
    "agreed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_term_agreements" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_performance_saved_reports" WITH ("security_invoker"='true') AS
 SELECT "s"."id" AS "session_id",
    "t"."title" AS "topic_title",
    "s"."grade_label",
    "s"."subject_group",
    "s"."subject",
    "s"."career_goal",
    GREATEST("s"."updated_at", "rpt"."reports_updated_at", "sub"."submissions_updated_at") AS "updated_at",
    ("rpt"."design_report_id" IS NOT NULL) AS "has_design",
    ("rpt"."evaluation_report_id" IS NOT NULL) AS "has_evaluation",
    ("rpt"."final_report_id" IS NOT NULL) AS "has_final",
    "rpt"."design_report_id",
    "rpt"."evaluation_report_id",
    "rpt"."final_report_id"
   FROM ((("public"."performance_sessions" "s"
     LEFT JOIN "public"."performance_topics" "t" ON (("t"."id" = "s"."selected_topic_id")))
     LEFT JOIN LATERAL ( SELECT ("array_agg"("pr"."id") FILTER (WHERE ("pr"."report_type" = 'design'::"text")))[1] AS "design_report_id",
            ("array_agg"("pr"."id") FILTER (WHERE ("pr"."report_type" = 'evaluation'::"text")))[1] AS "evaluation_report_id",
            ("array_agg"("pr"."id") FILTER (WHERE ("pr"."report_type" = 'final_submission'::"text")))[1] AS "final_report_id",
            "max"("pr"."updated_at") AS "reports_updated_at"
           FROM "public"."performance_reports" "pr"
          WHERE ("pr"."session_id" = "s"."id")) "rpt" ON (true))
     LEFT JOIN LATERAL ( SELECT "max"("ps"."updated_at") AS "submissions_updated_at"
           FROM "public"."performance_submissions" "ps"
          WHERE ("ps"."session_id" = "s"."id")) "sub" ON (true));


ALTER VIEW "public"."v_performance_saved_reports" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_performance_saved_reports" IS '수행평가 저장 리포트 목록 집계(명세서 §8.6:1836). design/evaluation/final_report_id는 전부 performance_reports.id(세션당 종류별 최대 1행, sql/58 부분 UNIQUE) — final도 performance_submissions.id가 아니라 report_type=''final_submission'' 행을 가리켜야 SectionedReportView가 그대로 렌더할 수 있다. security_invoker=true로 기반 테이블 소유자 RLS를 상속한다.';



CREATE TABLE IF NOT EXISTS "public"."winning_assessment_knowledge_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "is_active" boolean DEFAULT true,
    "grade" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "knowledge_type" "text" NOT NULL,
    "career_field" "text",
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "source" "text",
    "memo" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "search_text" "text",
    "embedding" "extensions"."vector"(768),
    "embedding_model" "text" DEFAULT 'gemini-embedding-2'::"text",
    "embedding_status" "text" DEFAULT 'pending'::"text",
    "embedded_at" timestamp with time zone,
    "embedding_error" "text",
    "keywords" "text" DEFAULT ''::"text",
    "rag_use" boolean DEFAULT true,
    "source_link" "text",
    "last_reviewed_at" timestamp with time zone,
    CONSTRAINT "winning_assessment_knowledge_items_knowledge_type_check" CHECK (("knowledge_type" = ANY (ARRAY['topic_pattern'::"text", 'verified_resource'::"text", 'student_record_pattern'::"text"])))
);


ALTER TABLE "public"."winning_assessment_knowledge_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."winning_assessment_knowledge_items" IS '수행평가 RAG 지식베이스. RLS: 어드민(is_admin())만 직접 CRUD, 그 외 authenticated/anon 전면 거부. 서버 RAG 경로는 service_role(RLS 우회)로만 읽는다.';



COMMENT ON COLUMN "public"."winning_assessment_knowledge_items"."source_link" IS '출처 원문 링크(URL 단일 값). source 컬럼은 "저자·기관·출처 설명" 자유 텍스트이고, 링크는 이 컬럼으로 분리한다.';



COMMENT ON COLUMN "public"."winning_assessment_knowledge_items"."last_reviewed_at" IS '관리자가 이 카드를 마지막으로 검토 완료로 표시한 시각. 검토 기록이 없으면 null.';



CREATE TABLE IF NOT EXISTS "public"."winning_base_data" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "data_type" "text" DEFAULT ''::"text",
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "content" "text" DEFAULT ''::"text",
    "source" "text" DEFAULT ''::"text",
    "memo" "text" DEFAULT ''::"text",
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."winning_base_data" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."winning_db_inputs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "input_type" "text" DEFAULT ''::"text",
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "raw_data" "text" DEFAULT ''::"text",
    "parsed_data" "jsonb",
    "memo" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."winning_db_inputs" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admission_jungsi_results" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."admission_jungsi_results_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."admission_susi_results" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."admission_susi_results_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."tenant_code_attempts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."tenant_code_attempts_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."activity_records"
    ADD CONSTRAINT "activity_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_access_logs"
    ADD CONSTRAINT "admin_access_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_member_permissions"
    ADD CONSTRAINT "admin_member_permissions_pkey" PRIMARY KEY ("profile_id", "resource_key");



ALTER TABLE ONLY "public"."admin_members"
    ADD CONSTRAINT "admin_members_pkey" PRIMARY KEY ("profile_id");



ALTER TABLE ONLY "public"."admin_resources"
    ADD CONSTRAINT "admin_resources_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."admin_role_permissions"
    ADD CONSTRAINT "admin_role_permissions_pkey" PRIMARY KEY ("role_id", "resource_key");



ALTER TABLE ONLY "public"."admin_roles"
    ADD CONSTRAINT "admin_roles_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."admin_roles"
    ADD CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admission_acceptance_rates"
    ADD CONSTRAINT "admission_acceptance_rates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admission_acceptance_rates"
    ADD CONSTRAINT "admission_acceptance_rates_year_key" UNIQUE ("year");



ALTER TABLE ONLY "public"."admission_case_logos"
    ADD CONSTRAINT "admission_case_logos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admission_jungsi_results"
    ADD CONSTRAINT "admission_jungsi_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admission_posts"
    ADD CONSTRAINT "admission_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admission_results"
    ADD CONSTRAINT "admission_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admission_susi_results"
    ADD CONSTRAINT "admission_susi_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admission_universities"
    ADD CONSTRAINT "admission_universities_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."admission_universities"
    ADD CONSTRAINT "admission_universities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admission_university_resources"
    ADD CONSTRAINT "admission_university_resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admission_university_resources"
    ADD CONSTRAINT "admission_university_resources_unique" UNIQUE ("admission_year", "university_key");



ALTER TABLE ONLY "public"."ai_model_calls"
    ADD CONSTRAINT "ai_model_calls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_retrieval_events"
    ADD CONSTRAINT "ai_retrieval_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."alimtalk_send_logs"
    ADD CONSTRAINT "alimtalk_send_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."banners"
    ADD CONSTRAINT "banners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."board_views"
    ADD CONSTRAINT "board_views_pkey" PRIMARY KEY ("source", "post_id", "viewer_key", "viewed_on");



ALTER TABLE ONLY "public"."bundle_items"
    ADD CONSTRAINT "bundle_items_pkey" PRIMARY KEY ("product_id", "program_key");



ALTER TABLE ONLY "public"."company_news"
    ADD CONSTRAINT "company_news_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coupon_grants"
    ADD CONSTRAINT "coupon_grants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coupon_redemptions"
    ADD CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."daily_entries"
    ADD CONSTRAINT "daily_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_settlements"
    ADD CONSTRAINT "daily_settlements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."diagnosis_attempts"
    ADD CONSTRAINT "diagnosis_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."diagnosis_reports"
    ADD CONSTRAINT "diagnosis_reports_pkey" PRIMARY KEY ("attempt_id");



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."faqs"
    ADD CONSTRAINT "faqs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."galleries"
    ADD CONSTRAINT "galleries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."goal_advice_cache"
    ADD CONSTRAINT "goal_advice_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."goal_advice_cache"
    ADD CONSTRAINT "goal_advice_cache_profile_id_source_generated_for_key" UNIQUE ("profile_id", "source", "generated_for");



ALTER TABLE ONLY "public"."goal_daily_records"
    ADD CONSTRAINT "goal_daily_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."goal_direction_reports"
    ADD CONSTRAINT "goal_direction_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."goal_mentor_comments"
    ADD CONSTRAINT "goal_mentor_comments_period_key" UNIQUE ("profile_id", "period_type", "period_key");



ALTER TABLE ONLY "public"."goal_mentor_comments"
    ADD CONSTRAINT "goal_mentor_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."goal_plan_tasks"
    ADD CONSTRAINT "goal_plan_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."goal_probability_logs"
    ADD CONSTRAINT "goal_probability_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."goal_schedules"
    ADD CONSTRAINT "goal_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."goal_students"
    ADD CONSTRAINT "goal_students_pkey" PRIMARY KEY ("profile_id");



ALTER TABLE ONLY "public"."goal_subject_targets"
    ADD CONSTRAINT "goal_subject_targets_pkey" PRIMARY KEY ("profile_id", "subject");



ALTER TABLE ONLY "public"."goal_timer_sessions"
    ADD CONSTRAINT "goal_timer_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."goal_timer_subjects"
    ADD CONSTRAINT "goal_timer_subjects_pkey" PRIMARY KEY ("profile_id", "subject");



ALTER TABLE ONLY "public"."goal_university_cuts"
    ADD CONSTRAINT "goal_university_cuts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."goal_workbooks"
    ADD CONSTRAINT "goal_workbooks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."growth_plan_items"
    ADD CONSTRAINT "growth_plan_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."growth_profiles"
    ADD CONSTRAINT "growth_profiles_pkey" PRIMARY KEY ("profile_id");



ALTER TABLE ONLY "public"."growth_reports"
    ADD CONSTRAINT "growth_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."growth_uploads"
    ADD CONSTRAINT "growth_uploads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."home_acceptance_cards"
    ADD CONSTRAINT "home_acceptance_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."home_mentor_strategies"
    ADD CONSTRAINT "home_mentor_strategies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."home_side_banners"
    ADD CONSTRAINT "home_side_banners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."identity_verifications"
    ADD CONSTRAINT "identity_verifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inquiry_assets"
    ADD CONSTRAINT "inquiry_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inquiry_assets"
    ADD CONSTRAINT "inquiry_assets_session_position_uniq" UNIQUE ("session_id", "position");



ALTER TABLE ONLY "public"."inquiry_reports"
    ADD CONSTRAINT "inquiry_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inquiry_sessions"
    ADD CONSTRAINT "inquiry_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inquiry_submissions"
    ADD CONSTRAINT "inquiry_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inquiry_submissions"
    ADD CONSTRAINT "inquiry_submissions_session_revision_uniq" UNIQUE ("session_id", "revision");



ALTER TABLE ONLY "public"."inquiry_topics"
    ADD CONSTRAINT "inquiry_topics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inquiry_topics"
    ADD CONSTRAINT "inquiry_topics_session_round_idx_uniq" UNIQUE ("session_id", "round", "idx");



ALTER TABLE ONLY "public"."knowledge_eval_runs"
    ADD CONSTRAINT "knowledge_eval_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."knowledge_golden_queries"
    ADD CONSTRAINT "knowledge_golden_queries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_diagnosis_options"
    ADD CONSTRAINT "learning_diagnosis_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_diagnosis_programs"
    ADD CONSTRAINT "learning_diagnosis_programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_diagnosis_programs"
    ADD CONSTRAINT "learning_diagnosis_programs_program_key_key" UNIQUE ("program_key");



ALTER TABLE ONLY "public"."learning_diagnosis_questions"
    ADD CONSTRAINT "learning_diagnosis_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_diagnosis_questions"
    ADD CONSTRAINT "learning_diagnosis_questions_question_key_key" UNIQUE ("question_key");



ALTER TABLE ONLY "public"."learning_diagnosis_v2_survey_copy"
    ADD CONSTRAINT "learning_diagnosis_v2_survey_copy_copy_key_key" UNIQUE ("copy_key");



ALTER TABLE ONLY "public"."learning_diagnosis_v2_survey_copy"
    ADD CONSTRAINT "learning_diagnosis_v2_survey_copy_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."link_code_lookups"
    ADD CONSTRAINT "link_code_lookups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mentor_applications"
    ADD CONSTRAINT "mentor_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mentor_apply_copy"
    ADD CONSTRAINT "mentor_apply_copy_copy_key_key" UNIQUE ("copy_key");



ALTER TABLE ONLY "public"."mentor_apply_copy"
    ADD CONSTRAINT "mentor_apply_copy_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mentor_apply_faqs"
    ADD CONSTRAINT "mentor_apply_faqs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notices"
    ADD CONSTRAINT "notices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."page_contents"
    ADD CONSTRAINT "page_contents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."page_contents"
    ADD CONSTRAINT "page_contents_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."parent_child_links"
    ADD CONSTRAINT "parent_child_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_order_id_key" UNIQUE ("order_id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("payment_id");



ALTER TABLE ONLY "public"."performance_attachments"
    ADD CONSTRAINT "performance_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."performance_credit_ledger"
    ADD CONSTRAINT "performance_credit_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."performance_credit_ledger"
    ADD CONSTRAINT "performance_credit_ledger_session_id_key" UNIQUE ("session_id");



ALTER TABLE ONLY "public"."performance_messages"
    ADD CONSTRAINT "performance_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."performance_messages"
    ADD CONSTRAINT "performance_messages_session_seq_key" UNIQUE ("session_id", "seq");



ALTER TABLE ONLY "public"."performance_reports"
    ADD CONSTRAINT "performance_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."performance_session_vectors"
    ADD CONSTRAINT "performance_session_vectors_pkey" PRIMARY KEY ("session_id");



ALTER TABLE ONLY "public"."performance_sessions"
    ADD CONSTRAINT "performance_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."performance_submissions"
    ADD CONSTRAINT "performance_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."performance_submissions"
    ADD CONSTRAINT "performance_submissions_session_revision_key" UNIQUE ("session_id", "revision");



ALTER TABLE ONLY "public"."performance_topics"
    ADD CONSTRAINT "performance_topics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."performance_topics"
    ADD CONSTRAINT "performance_topics_session_round_idx_key" UNIQUE ("session_id", "round", "idx");



ALTER TABLE ONLY "public"."phone_verifications"
    ADD CONSTRAINT "phone_verifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."popups"
    ADD CONSTRAINT "popups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."premium_book_pages"
    ADD CONSTRAINT "premium_book_pages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."premium_consult_requests"
    ADD CONSTRAINT "premium_consult_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_access_grants"
    ADD CONSTRAINT "program_access_grants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_access"
    ADD CONSTRAINT "program_access_pkey" PRIMARY KEY ("id", "program_key");



ALTER TABLE ONLY "public"."program_categories"
    ADD CONSTRAINT "program_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_program_key_key" UNIQUE ("program_key");



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."selfeval_reports"
    ADD CONSTRAINT "selfeval_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."selfeval_reports"
    ADD CONSTRAINT "selfeval_reports_session_type_revision_uniq" UNIQUE ("session_id", "report_type", "revision");



ALTER TABLE ONLY "public"."selfeval_session_activities"
    ADD CONSTRAINT "selfeval_session_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."selfeval_session_activities"
    ADD CONSTRAINT "selfeval_session_activities_session_activity_uniq" UNIQUE ("session_id", "activity_record_id");



ALTER TABLE ONLY "public"."selfeval_sessions"
    ADD CONSTRAINT "selfeval_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."special_highschool_acceptance_rates"
    ADD CONSTRAINT "special_highschool_acceptance_rates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."special_highschool_acceptance_rates"
    ADD CONSTRAINT "special_highschool_acceptance_rates_year_key" UNIQUE ("year");



ALTER TABLE ONLY "public"."special_highschool_cases"
    ADD CONSTRAINT "special_highschool_cases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sso_tickets"
    ADD CONSTRAINT "sso_tickets_pkey" PRIMARY KEY ("ticket_id");



ALTER TABLE ONLY "public"."sso_tickets"
    ADD CONSTRAINT "sso_tickets_ticket_hash_key" UNIQUE ("ticket_hash");



ALTER TABLE ONLY "public"."student_link_codes"
    ADD CONSTRAINT "student_link_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_profiles"
    ADD CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("profile_id");



ALTER TABLE ONLY "public"."tenant_code_attempts"
    ADD CONSTRAINT "tenant_code_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."terms"
    ADD CONSTRAINT "terms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trending_departments"
    ADD CONSTRAINT "trending_departments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."university_acceptances"
    ADD CONSTRAINT "university_acceptances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usage_status"
    ADD CONSTRAINT "usage_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_term_agreements"
    ADD CONSTRAINT "user_term_agreements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."winning_assessment_knowledge_items"
    ADD CONSTRAINT "winning_assessment_knowledge_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."winning_base_data"
    ADD CONSTRAINT "winning_base_data_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."winning_db_inputs"
    ADD CONSTRAINT "winning_db_inputs_pkey" PRIMARY KEY ("id");



CREATE INDEX "activity_records_profile_grade_semester_idx" ON "public"."activity_records" USING "btree" ("profile_id", "grade_label", "semester");



CREATE UNIQUE INDEX "activity_records_source_uniq" ON "public"."activity_records" USING "btree" ("source_program", "source_ref_id") WHERE ("source_ref_id" IS NOT NULL);



CREATE INDEX "admin_access_logs_created_idx" ON "public"."admin_access_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "admin_access_logs_profile_idx" ON "public"."admin_access_logs" USING "btree" ("profile_id", "created_at" DESC);



CREATE INDEX "admin_members_role_idx" ON "public"."admin_members" USING "btree" ("role_id");



CREATE INDEX "admin_members_status_idx" ON "public"."admin_members" USING "btree" ("status");



CREATE UNIQUE INDEX "admin_roles_single_super_idx" ON "public"."admin_roles" USING "btree" ((true)) WHERE "is_super";



CREATE INDEX "admission_acceptance_rates_active_idx" ON "public"."admission_acceptance_rates" USING "btree" ("is_active");



CREATE INDEX "admission_acceptance_rates_sort_order_idx" ON "public"."admission_acceptance_rates" USING "btree" ("sort_order");



CREATE INDEX "admission_case_logos_active_idx" ON "public"."admission_case_logos" USING "btree" ("is_active");



CREATE INDEX "admission_case_logos_row_no_idx" ON "public"."admission_case_logos" USING "btree" ("row_no");



CREATE INDEX "admission_case_logos_sort_order_idx" ON "public"."admission_case_logos" USING "btree" ("sort_order");



CREATE INDEX "admission_posts_active_category_idx" ON "public"."admission_posts" USING "btree" ("is_active", "category");



CREATE INDEX "admission_posts_category_idx" ON "public"."admission_posts" USING "btree" ("category");



CREATE INDEX "admission_posts_order_idx" ON "public"."admission_posts" USING "btree" ("category", "is_pinned" DESC, "sort_order", "created_at" DESC);



CREATE INDEX "admission_results_admin_order_idx" ON "public"."admission_results" USING "btree" ("result_year" DESC, "id" DESC);



CREATE INDEX "admission_results_detail_idx" ON "public"."admission_results" USING "btree" ("university_key", "department_key", "result_year");



CREATE INDEX "admission_results_search_trgm_idx" ON "public"."admission_results" USING "gin" (((((("university_name" || ' '::"text") || "department_name") || ' '::"text") || "admission_track")) "extensions"."gin_trgm_ops");



CREATE UNIQUE INDEX "admission_results_unique_key_idx" ON "public"."admission_results" USING "btree" ("result_year", "university_key", "department_key", COALESCE("main_track", ''::"text"), COALESCE("screening_category", ''::"text"), "admission_track", COALESCE("subject_reflection", ''::"text"), "variant_seq");



CREATE INDEX "admission_universities_active_idx" ON "public"."admission_universities" USING "btree" ("is_active");



CREATE INDEX "admission_universities_sort_order_idx" ON "public"."admission_universities" USING "btree" ("sort_order");



CREATE INDEX "admission_university_resources_active_idx" ON "public"."admission_university_resources" USING "btree" ("is_active");



CREATE INDEX "admission_university_resources_name_idx" ON "public"."admission_university_resources" USING "btree" ("university_name");



CREATE INDEX "admission_university_resources_region_idx" ON "public"."admission_university_resources" USING "btree" ("region");



CREATE UNIQUE INDEX "admission_university_resources_year_key_uidx" ON "public"."admission_university_resources" USING "btree" ("admission_year", "university_key");



CREATE INDEX "ai_model_calls_created_at_idx" ON "public"."ai_model_calls" USING "btree" ("created_at" DESC);



CREATE INDEX "ai_model_calls_profile_created_at_idx" ON "public"."ai_model_calls" USING "btree" ("profile_id", "created_at" DESC);



CREATE INDEX "ai_model_calls_service_created_at_idx" ON "public"."ai_model_calls" USING "btree" ("service", "created_at" DESC);



CREATE INDEX "ai_model_calls_trace_id_idx" ON "public"."ai_model_calls" USING "btree" ("trace_id");



CREATE INDEX "ai_retrieval_events_created_at_idx" ON "public"."ai_retrieval_events" USING "btree" ("created_at" DESC);



CREATE INDEX "ai_retrieval_events_service_created_at_idx" ON "public"."ai_retrieval_events" USING "btree" ("service", "created_at" DESC);



CREATE INDEX "ai_retrieval_events_trace_id_idx" ON "public"."ai_retrieval_events" USING "btree" ("trace_id");



CREATE UNIQUE INDEX "alimtalk_send_logs_dedupe_idx" ON "public"."alimtalk_send_logs" USING "btree" ("dedupe_key") WHERE ("dedupe_key" IS NOT NULL);



CREATE INDEX "alimtalk_send_logs_profile_idx" ON "public"."alimtalk_send_logs" USING "btree" ("profile_id", "sent_at" DESC);



CREATE INDEX "alimtalk_send_logs_template_idx" ON "public"."alimtalk_send_logs" USING "btree" ("template_key", "sent_at" DESC);



CREATE INDEX "board_views_viewed_on_idx" ON "public"."board_views" USING "btree" ("viewed_on");



CREATE INDEX "company_news_display_idx" ON "public"."company_news" USING "btree" ("is_active", "is_pinned" DESC, "sort_order", "created_at" DESC);



CREATE INDEX "coupon_grants_coupon_idx" ON "public"."coupon_grants" USING "btree" ("coupon_id");



CREATE UNIQUE INDEX "coupon_grants_live_uidx" ON "public"."coupon_grants" USING "btree" ("coupon_id", "user_id") WHERE ("revoked_at" IS NULL);



CREATE INDEX "coupon_redemptions_coupon_user_idx" ON "public"."coupon_redemptions" USING "btree" ("coupon_id", "user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "coupon_redemptions_order_idx" ON "public"."coupon_redemptions" USING "btree" ("order_id");



CREATE UNIQUE INDEX "coupon_redemptions_single_use_uidx" ON "public"."coupon_redemptions" USING "btree" ("coupon_id", "user_id") WHERE (("user_id" IS NOT NULL) AND ("voided_at" IS NULL));



COMMENT ON INDEX "public"."coupon_redemptions_single_use_uidx" IS 'granted 쿠폰 1인당 정확히 1회 소진을 DB 층에서(service_role RLS 우회 경로 포함) 강제하는 백스톱 — fn_redeem_coupons 안 advisory lock·5-d절 재검증(WC031)이 지키는 규칙을 모든 경로에 대해 다시 강제한다. auto(user_id NULL)는 대상이 아니다(C절 — 개인별 소진 개념 자체가 없음). voided_at 이 아닌 행만 대상 — 관리자가 명시적으로 되돌린 사용(voided_at NOT NULL)은 다시 셈에서 빠져 재적용을 막지 않는다. N>1 지원 시 coupons_granted_cap_is_one_check 와 함께 재설계할 것(sql/68 5-d-3절 "해제 절차").';



CREATE INDEX "coupons_tenant_id_idx" ON "public"."coupons" USING "btree" ("tenant_id");



CREATE UNIQUE INDEX "diagnosis_attempts_free_once" ON "public"."diagnosis_attempts" USING "btree" ("profile_id") WHERE ("kind" = 'free'::"text");



CREATE INDEX "diagnosis_attempts_profile_idx" ON "public"."diagnosis_attempts" USING "btree" ("profile_id");



CREATE INDEX "diagnosis_reports_profile_diagnosed_idx" ON "public"."diagnosis_reports" USING "btree" ("profile_id", "diagnosed_at" DESC);



CREATE INDEX "enrollments_order_idx" ON "public"."enrollments" USING "btree" ("order_id") WHERE ("order_id" IS NOT NULL);



CREATE INDEX "faqs_active_sort_created_idx" ON "public"."faqs" USING "btree" ("is_active", "sort_order", "created_at" DESC);



CREATE INDEX "goal_advice_cache_profile_idx" ON "public"."goal_advice_cache" USING "btree" ("profile_id", "generated_for" DESC);



CREATE UNIQUE INDEX "goal_daily_records_date_key" ON "public"."goal_daily_records" USING "btree" ("profile_id", "record_date");



CREATE INDEX "goal_daily_records_profile_created_idx" ON "public"."goal_daily_records" USING "btree" ("profile_id", "created_at" DESC);



CREATE INDEX "goal_daily_records_sunday_idx" ON "public"."goal_daily_records" USING "btree" ("profile_id", "record_date") WHERE ("virtual_day_index" = 6);



CREATE UNIQUE INDEX "goal_direction_reports_identity_key" ON "public"."goal_direction_reports" USING "btree" ("profile_id", "kind", "source_type", "source_label");



CREATE INDEX "goal_direction_reports_profile_kind_created_idx" ON "public"."goal_direction_reports" USING "btree" ("profile_id", "kind", "created_at" DESC);



CREATE INDEX "goal_plan_tasks_profile_date_idx" ON "public"."goal_plan_tasks" USING "btree" ("profile_id", "plan_date");



CREATE INDEX "goal_plan_tasks_workbook_id_idx" ON "public"."goal_plan_tasks" USING "btree" ("workbook_id");



CREATE INDEX "goal_probability_logs_profile_created_idx" ON "public"."goal_probability_logs" USING "btree" ("profile_id", "created_at");



CREATE INDEX "goal_schedules_profile_due_idx" ON "public"."goal_schedules" USING "btree" ("profile_id", "due_date");



CREATE INDEX "goal_students_created_at_idx" ON "public"."goal_students" USING "btree" ("created_at" DESC);



CREATE INDEX "goal_students_ideal_target_idx" ON "public"."goal_students" USING "btree" ("ideal_university", "ideal_department") WHERE ("status" = 'active'::"text");



CREATE INDEX "goal_students_onboarded_idx" ON "public"."goal_students" USING "btree" ("onboarded_at" DESC) WHERE ("onboarded_at" IS NOT NULL);



CREATE INDEX "goal_students_status_idx" ON "public"."goal_students" USING "btree" ("status");



CREATE UNIQUE INDEX "goal_timer_sessions_open_unique" ON "public"."goal_timer_sessions" USING "btree" ("profile_id") WHERE ("ended_at" IS NULL);



CREATE INDEX "goal_timer_sessions_profile_date_idx" ON "public"."goal_timer_sessions" USING "btree" ("profile_id", "session_date");



CREATE UNIQUE INDEX "goal_university_cuts_key" ON "public"."goal_university_cuts" USING "btree" ("cut_type", "university_key", "department_key");



CREATE UNIQUE INDEX "goal_university_cuts_name_key" ON "public"."goal_university_cuts" USING "btree" ("cut_type", "university_name", "department_name") WHERE "is_active";



CREATE INDEX "goal_workbooks_profile_subject_idx" ON "public"."goal_workbooks" USING "btree" ("profile_id", "subject");



CREATE INDEX "growth_plan_items_carried_from_idx" ON "public"."growth_plan_items" USING "btree" ("carried_from_report_id") WHERE ("carried_from_report_id" IS NOT NULL);



CREATE INDEX "growth_plan_items_profile_status_idx" ON "public"."growth_plan_items" USING "btree" ("profile_id", "status");



CREATE INDEX "growth_plan_items_report_idx" ON "public"."growth_plan_items" USING "btree" ("report_id");



CREATE INDEX "growth_reports_ledger_idx" ON "public"."growth_reports" USING "btree" ("ledger_id") WHERE ("ledger_id" IS NOT NULL);



CREATE UNIQUE INDEX "growth_reports_one_open_per_profile" ON "public"."growth_reports" USING "btree" ("profile_id") WHERE ("status" = ANY (ARRAY['draft'::"text", 'in_progress'::"text"]));



CREATE INDEX "growth_reports_profile_status_issued_idx" ON "public"."growth_reports" USING "btree" ("profile_id", "status", "issued_at" DESC);



CREATE INDEX "growth_uploads_profile_grade_semester_idx" ON "public"."growth_uploads" USING "btree" ("profile_id", "grade_label", "semester");



CREATE INDEX "home_acceptance_cards_display_idx" ON "public"."home_acceptance_cards" USING "btree" ("is_active", "sort_order", "created_at" DESC);



CREATE INDEX "home_mentor_strategies_display_idx" ON "public"."home_mentor_strategies" USING "btree" ("is_active", "sort_order", "created_at" DESC);



CREATE INDEX "home_side_banners_display_idx" ON "public"."home_side_banners" USING "btree" ("is_active", "sort_order", "created_at" DESC);



CREATE INDEX "identity_verifications_consumable_idx" ON "public"."identity_verifications" USING "btree" ("request_id") WHERE (("status" = 'verified'::"text") AND ("consumed_at" IS NULL));



CREATE INDEX "identity_verifications_di_idx" ON "public"."identity_verifications" USING "btree" ("di") WHERE ("di" IS NOT NULL);



CREATE INDEX "identity_verifications_pending_idx" ON "public"."identity_verifications" USING "btree" ("expires_at") WHERE ("status" = 'pending'::"text");



CREATE UNIQUE INDEX "identity_verifications_request_id_key" ON "public"."identity_verifications" USING "btree" ("request_id");



CREATE INDEX "identity_verifications_unconsumed_idx" ON "public"."identity_verifications" USING "btree" ("request_id") WHERE (("status" = 'verified'::"text") AND ("consumed_at" IS NULL));



CREATE INDEX "identity_verifications_user_idx" ON "public"."identity_verifications" USING "btree" ("user_id", "verified_at" DESC) WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_galleries_active_published" ON "public"."galleries" USING "btree" ("is_active", "published_at" DESC);



CREATE INDEX "idx_galleries_category" ON "public"."galleries" USING "btree" ("category") WHERE ("category" IS NOT NULL);



CREATE INDEX "idx_galleries_featured" ON "public"."galleries" USING "btree" ("is_featured") WHERE "is_featured";



CREATE INDEX "idx_learning_diagnosis_options_question_order" ON "public"."learning_diagnosis_options" USING "btree" ("question_key", "is_active", "sort_order");



CREATE INDEX "idx_learning_diagnosis_programs_active_order" ON "public"."learning_diagnosis_programs" USING "btree" ("is_active", "sort_order");



CREATE INDEX "idx_learning_diagnosis_questions_active_order" ON "public"."learning_diagnosis_questions" USING "btree" ("is_active", "sort_order");



CREATE INDEX "idx_notices_events_visible" ON "public"."notices" USING "btree" ("is_active", "is_pinned", "sort_order", "created_at");



CREATE INDEX "idx_payments_id_program_created" ON "public"."payments" USING "btree" ("id", "program_key", "created_at" DESC);



CREATE INDEX "idx_popups_home_visible" ON "public"."popups" USING "btree" ("is_active", "sort_order", "start_date", "end_date");



CREATE INDEX "idx_program_access_id_program" ON "public"."program_access" USING "btree" ("id", "program_key");



CREATE INDEX "idx_program_access_user_program" ON "public"."program_access" USING "btree" ("user_id", "program_key") WHERE (("user_id" IS NOT NULL) AND ("program_key" IS NOT NULL));



CREATE INDEX "idx_sso_tickets_unused" ON "public"."sso_tickets" USING "btree" ("service_key", "expires_at") WHERE ("used_at" IS NULL);



CREATE INDEX "idx_sso_tickets_user_service" ON "public"."sso_tickets" USING "btree" ("winning_user_id", "service_key", "created_at" DESC);



CREATE INDEX "idx_winning_assessment_knowledge_career" ON "public"."winning_assessment_knowledge_items" USING "btree" ("career_field");



CREATE INDEX "idx_winning_assessment_knowledge_created" ON "public"."winning_assessment_knowledge_items" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_winning_assessment_knowledge_lookup" ON "public"."winning_assessment_knowledge_items" USING "btree" ("is_active", "grade", "subject", "knowledge_type");



CREATE INDEX "idx_winning_assessment_knowledge_type_created" ON "public"."winning_assessment_knowledge_items" USING "btree" ("knowledge_type", "created_at" DESC);



CREATE INDEX "inquiry_assets_activity_record_idx" ON "public"."inquiry_assets" USING "btree" ("activity_record_id") WHERE ("activity_record_id" IS NOT NULL);



CREATE INDEX "inquiry_assets_profile_idx" ON "public"."inquiry_assets" USING "btree" ("profile_id");



CREATE UNIQUE INDEX "inquiry_reports_one_design_per_session" ON "public"."inquiry_reports" USING "btree" ("session_id") WHERE ("report_type" = 'design'::"text");



CREATE UNIQUE INDEX "inquiry_reports_one_final_per_session" ON "public"."inquiry_reports" USING "btree" ("session_id") WHERE ("report_type" = 'final'::"text");



CREATE INDEX "inquiry_reports_profile_idx" ON "public"."inquiry_reports" USING "btree" ("profile_id");



CREATE INDEX "inquiry_reports_session_type_created_idx" ON "public"."inquiry_reports" USING "btree" ("session_id", "report_type", "created_at" DESC);



CREATE UNIQUE INDEX "inquiry_sessions_ledger_uniq" ON "public"."inquiry_sessions" USING "btree" ("ledger_id") WHERE ("ledger_id" IS NOT NULL);



CREATE UNIQUE INDEX "inquiry_sessions_one_open_per_profile" ON "public"."inquiry_sessions" USING "btree" ("profile_id") WHERE ("status" = ANY (ARRAY['draft'::"text", 'in_progress'::"text"]));



CREATE INDEX "inquiry_sessions_profile_status_completed_idx" ON "public"."inquiry_sessions" USING "btree" ("profile_id", "status", "completed_at" DESC);



CREATE UNIQUE INDEX "inquiry_submissions_one_draft_per_session" ON "public"."inquiry_submissions" USING "btree" ("session_id") WHERE "is_draft";



CREATE INDEX "inquiry_submissions_profile_idx" ON "public"."inquiry_submissions" USING "btree" ("profile_id");



CREATE INDEX "inquiry_topics_profile_idx" ON "public"."inquiry_topics" USING "btree" ("profile_id");



CREATE INDEX "knowledge_eval_runs_type_created_idx" ON "public"."knowledge_eval_runs" USING "btree" ("knowledge_type", "created_at" DESC);



CREATE INDEX "knowledge_golden_queries_type_active_idx" ON "public"."knowledge_golden_queries" USING "btree" ("knowledge_type", "is_active", "created_at");



CREATE INDEX "learning_diagnosis_options_question_sort_idx" ON "public"."learning_diagnosis_options" USING "btree" ("question_id", "is_active", "sort_order", "created_at");



CREATE INDEX "learning_diagnosis_programs_sort_idx" ON "public"."learning_diagnosis_programs" USING "btree" ("is_active", "sort_order", "created_at");



CREATE INDEX "learning_diagnosis_questions_sort_idx" ON "public"."learning_diagnosis_questions" USING "btree" ("is_active", "sort_order", "created_at");



CREATE INDEX "link_code_lookups_actor_idx" ON "public"."link_code_lookups" USING "btree" ("actor_id", "created_at" DESC);



CREATE INDEX "link_code_lookups_failed_idx" ON "public"."link_code_lookups" USING "btree" ("actor_id", "created_at" DESC) WHERE (NOT "found");



CREATE INDEX "link_code_lookups_ip_idx" ON "public"."link_code_lookups" USING "btree" ("request_ip", "created_at" DESC) WHERE ("request_ip" IS NOT NULL);



CREATE INDEX "mentor_applications_created_at_idx" ON "public"."mentor_applications" USING "btree" ("created_at" DESC);



CREATE INDEX "mentor_applications_ip_idx" ON "public"."mentor_applications" USING "btree" ("request_ip", "created_at" DESC) WHERE ("request_ip" IS NOT NULL);



CREATE INDEX "mentor_applications_status_idx" ON "public"."mentor_applications" USING "btree" ("status");



CREATE INDEX "mentor_apply_faqs_display_idx" ON "public"."mentor_apply_faqs" USING "btree" ("is_active", "sort_order", "created_at");



CREATE INDEX "notices_display_idx" ON "public"."notices" USING "btree" ("is_active", "is_pinned" DESC, "sort_order", "created_at" DESC);



CREATE INDEX "order_items_order_idx" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "order_items_product_id_idx" ON "public"."order_items" USING "btree" ("product_id");



CREATE INDEX "orders_parent_idx" ON "public"."orders" USING "btree" ("parent_profile_id", "created_at" DESC);



CREATE INDEX "orders_status_idx" ON "public"."orders" USING "btree" ("status");



CREATE INDEX "orders_student_idx" ON "public"."orders" USING "btree" ("student_profile_id", "created_at" DESC);



CREATE INDEX "orders_user_idx" ON "public"."orders" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "parent_child_links_approved_student_key" ON "public"."parent_child_links" USING "btree" ("student_id") WHERE ("status" = 'approved'::"text");



CREATE UNIQUE INDEX "parent_child_links_open_pair_key" ON "public"."parent_child_links" USING "btree" ("parent_id", "student_id") WHERE ("status" = ANY (ARRAY['pending'::"text", 'approved'::"text"]));



CREATE INDEX "parent_child_links_parent_idx" ON "public"."parent_child_links" USING "btree" ("parent_id", "status", "requested_at" DESC);



CREATE INDEX "parent_child_links_student_idx" ON "public"."parent_child_links" USING "btree" ("student_id", "status", "requested_at" DESC);



CREATE INDEX "performance_attachments_pending_sweep_idx" ON "public"."performance_attachments" USING "btree" ("ocr_status", "created_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "performance_attachments_retention_idx" ON "public"."performance_attachments" USING "btree" ("created_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "performance_attachments_session_idx" ON "public"."performance_attachments" USING "btree" ("session_id");



CREATE INDEX "performance_credit_ledger_grant_idx" ON "public"."performance_credit_ledger" USING "btree" ("grant_id");



CREATE INDEX "performance_credit_ledger_profile_idx" ON "public"."performance_credit_ledger" USING "btree" ("profile_id", "created_at" DESC);



CREATE UNIQUE INDEX "performance_credit_ledger_reversal_of_uniq" ON "public"."performance_credit_ledger" USING "btree" ("reversal_of") WHERE ("reversal_of" IS NOT NULL);



CREATE UNIQUE INDEX "performance_reports_one_design_per_session_idx" ON "public"."performance_reports" USING "btree" ("session_id") WHERE ("report_type" = 'design'::"text");



CREATE UNIQUE INDEX "performance_reports_one_evaluation_per_session_idx" ON "public"."performance_reports" USING "btree" ("session_id") WHERE ("report_type" = 'evaluation'::"text");



CREATE UNIQUE INDEX "performance_reports_one_final_per_session_idx" ON "public"."performance_reports" USING "btree" ("session_id") WHERE ("report_type" = 'final_submission'::"text");



CREATE INDEX "performance_reports_session_type_idx" ON "public"."performance_reports" USING "btree" ("session_id", "report_type", "created_at" DESC);



CREATE INDEX "performance_session_vectors_embedding_hnsw_idx" ON "public"."performance_session_vectors" USING "hnsw" ("embedding" "extensions"."vector_cosine_ops") WHERE ("embedding" IS NOT NULL);



CREATE INDEX "performance_session_vectors_profile_rag_idx" ON "public"."performance_session_vectors" USING "btree" ("profile_id", "rag_use");



CREATE INDEX "performance_sessions_profile_status_idx" ON "public"."performance_sessions" USING "btree" ("profile_id", "status");



CREATE INDEX "performance_sessions_profile_updated_idx" ON "public"."performance_sessions" USING "btree" ("profile_id", "updated_at" DESC);



CREATE UNIQUE INDEX "performance_submissions_one_final_per_session_idx" ON "public"."performance_submissions" USING "btree" ("session_id") WHERE ("is_final" = true);



CREATE INDEX "phone_verifications_expires_idx" ON "public"."phone_verifications" USING "btree" ("expires_at");



CREATE INDEX "phone_verifications_ip_idx" ON "public"."phone_verifications" USING "btree" ("request_ip", "created_at" DESC) WHERE ("request_ip" IS NOT NULL);



CREATE INDEX "phone_verifications_phone_idx" ON "public"."phone_verifications" USING "btree" ("phone", "created_at" DESC);



CREATE INDEX "premium_book_pages_sort_order_idx" ON "public"."premium_book_pages" USING "btree" ("sort_order");



CREATE INDEX "premium_consult_requests_created_at_idx" ON "public"."premium_consult_requests" USING "btree" ("created_at" DESC);



CREATE INDEX "products_active_idx" ON "public"."products" USING "btree" ("is_active", "service_sort_order", "sort_order");



CREATE INDEX "products_program_key_idx" ON "public"."products" USING "btree" ("program_key");



CREATE INDEX "products_tenant_id_idx" ON "public"."products" USING "btree" ("tenant_id");



CREATE UNIQUE INDEX "profiles_email_unique_idx" ON "public"."profiles" USING "btree" ("lower"(TRIM(BOTH FROM "email"))) WHERE (("email" IS NOT NULL) AND (TRIM(BOTH FROM "email") <> ''::"text"));



CREATE UNIQUE INDEX "profiles_phone_unique_idx" ON "public"."profiles" USING "btree" ("regexp_replace"("phone", '[^0-9]'::"text", ''::"text", 'g'::"text")) WHERE (("member_type" IS NOT NULL) AND ("phone" IS NOT NULL) AND ("regexp_replace"("phone", '[^0-9]'::"text", ''::"text", 'g'::"text") <> ''::"text"));



CREATE INDEX "profiles_tenant_id_idx" ON "public"."profiles" USING "btree" ("tenant_id");



CREATE UNIQUE INDEX "profiles_username_unique_idx" ON "public"."profiles" USING "btree" ("lower"(TRIM(BOTH FROM "username"))) WHERE (("username" IS NOT NULL) AND (TRIM(BOTH FROM "username") <> ''::"text"));



CREATE UNIQUE INDEX "program_access_grants_live_item_uniq" ON "public"."program_access_grants" USING "btree" ("order_item_id", "program_key") WHERE (("order_item_id" IS NOT NULL) AND ("revoked_at" IS NULL));



CREATE INDEX "program_access_grants_live_profile_program_idx" ON "public"."program_access_grants" USING "btree" ("profile_id", "program_key") WHERE ("revoked_at" IS NULL);



CREATE INDEX "program_access_grants_order_idx" ON "public"."program_access_grants" USING "btree" ("order_id");



CREATE INDEX "program_access_program_profile_idx" ON "public"."program_access" USING "btree" ("program_key", "profile_id");



CREATE INDEX "program_access_program_user_idx" ON "public"."program_access" USING "btree" ("program_key", "user_id");



CREATE UNIQUE INDEX "program_categories_name_unique_idx" ON "public"."program_categories" USING "btree" ("lower"(TRIM(BOTH FROM "name"))) WHERE (("name" IS NOT NULL) AND (TRIM(BOTH FROM "name") <> ''::"text"));



CREATE INDEX "refund_requests_completed_idx" ON "public"."refund_requests" USING "btree" ("completed_at" DESC) WHERE ("completed_at" IS NOT NULL);



CREATE UNIQUE INDEX "refund_requests_open_order_uniq" ON "public"."refund_requests" USING "btree" ("order_id", "order_item_id") NULLS NOT DISTINCT WHERE (("status" = ANY (ARRAY['requested'::"text", 'processing'::"text"])) AND ("approval_status" <> 'rejected'::"text") AND ("order_item_ids" IS NULL));



COMMENT ON INDEX "public"."refund_requests_open_order_uniq" IS '주문 전체(order_item_ids IS NULL) 열린 신청은 주문당 1건. 부분해지 신청 간 항목 겹침은 fn_request_refund(WC061)가 advisory lock 아래에서 검사한다 — 배열 겹침은 btree 유니크로 표현할 수 없어 인덱스 축과 함수 축을 나눴다(20260901 Ver10, §2-10).';



CREATE INDEX "refund_requests_parent_idx" ON "public"."refund_requests" USING "btree" ("parent_profile_id", "created_at" DESC);



CREATE INDEX "refund_requests_student_idx" ON "public"."refund_requests" USING "btree" ("student_profile_id", "created_at" DESC);



CREATE INDEX "refund_requests_user_idx" ON "public"."refund_requests" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "selfeval_reports_profile_idx" ON "public"."selfeval_reports" USING "btree" ("profile_id");



CREATE INDEX "selfeval_reports_session_created_idx" ON "public"."selfeval_reports" USING "btree" ("session_id", "created_at" DESC);



CREATE UNIQUE INDEX "selfeval_session_activities_core_uniq" ON "public"."selfeval_session_activities" USING "btree" ("session_id") WHERE ("role" = 'core'::"text");



CREATE INDEX "selfeval_session_activities_profile_idx" ON "public"."selfeval_session_activities" USING "btree" ("profile_id");



CREATE INDEX "selfeval_session_activities_record_idx" ON "public"."selfeval_session_activities" USING "btree" ("activity_record_id");



CREATE INDEX "selfeval_sessions_ledger_idx" ON "public"."selfeval_sessions" USING "btree" ("ledger_id") WHERE ("ledger_id" IS NOT NULL);



CREATE UNIQUE INDEX "selfeval_sessions_open_uniq" ON "public"."selfeval_sessions" USING "btree" ("profile_id") WHERE ("status" = ANY (ARRAY['draft'::"text", 'in_progress'::"text"]));



CREATE INDEX "selfeval_sessions_profile_created_idx" ON "public"."selfeval_sessions" USING "btree" ("profile_id", "created_at" DESC);



CREATE INDEX "selfeval_sessions_status_activity_idx" ON "public"."selfeval_sessions" USING "btree" ("status", "last_activity_at");



CREATE INDEX "special_highschool_acceptance_rates_active_idx" ON "public"."special_highschool_acceptance_rates" USING "btree" ("is_active");



CREATE INDEX "special_highschool_acceptance_rates_sort_order_idx" ON "public"."special_highschool_acceptance_rates" USING "btree" ("sort_order");



CREATE INDEX "special_highschool_cases_active_type_idx" ON "public"."special_highschool_cases" USING "btree" ("is_active", "school_type");



CREATE INDEX "special_highschool_cases_sort_order_idx" ON "public"."special_highschool_cases" USING "btree" ("sort_order");



CREATE INDEX "special_highschool_cases_year_idx" ON "public"."special_highschool_cases" USING "btree" ("year" DESC);



CREATE UNIQUE INDEX "student_link_codes_active_code_key" ON "public"."student_link_codes" USING "btree" ("code") WHERE "is_active";



CREATE UNIQUE INDEX "student_link_codes_active_student_key" ON "public"."student_link_codes" USING "btree" ("student_id") WHERE "is_active";



CREATE INDEX "student_link_codes_student_idx" ON "public"."student_link_codes" USING "btree" ("student_id", "issued_at" DESC);



CREATE INDEX "tenant_code_attempts_user_id_attempted_at_idx" ON "public"."tenant_code_attempts" USING "btree" ("user_id", "attempted_at");



CREATE INDEX "tenants_region_idx" ON "public"."tenants" USING "btree" ("region");



CREATE UNIQUE INDEX "terms_active_code_key" ON "public"."terms" USING "btree" ("code") WHERE "is_active";



CREATE INDEX "terms_audience_idx" ON "public"."terms" USING "btree" ("audience", "sort_order") WHERE "is_active";



CREATE UNIQUE INDEX "terms_code_version_key" ON "public"."terms" USING "btree" ("code", "version");



CREATE INDEX "trending_departments_active_sort_idx" ON "public"."trending_departments" USING "btree" ("is_active", "sort_order");



CREATE UNIQUE INDEX "uniq_program_access_id_program_key" ON "public"."program_access" USING "btree" ("id", "program_key");



CREATE UNIQUE INDEX "uq_program_access_profile_program" ON "public"."program_access" USING "btree" ("profile_id", "program_key") WHERE (("profile_id" IS NOT NULL) AND ("program_key" IS NOT NULL));



CREATE INDEX "user_term_agreements_term_idx" ON "public"."user_term_agreements" USING "btree" ("term_id");



CREATE UNIQUE INDEX "user_term_agreements_user_term_key" ON "public"."user_term_agreements" USING "btree" ("user_id", "term_id");



CREATE INDEX "winning_suhaeng_embedding_hnsw_idx" ON "public"."winning_assessment_knowledge_items" USING "hnsw" ("embedding" "extensions"."vector_cosine_ops") WHERE ("embedding" IS NOT NULL);



CREATE INDEX "winning_suhaeng_filter_idx" ON "public"."winning_assessment_knowledge_items" USING "btree" ("knowledge_type", "grade", "is_active", "rag_use");



CREATE INDEX "winning_suhaeng_search_text_pgroonga_idx" ON "public"."winning_assessment_knowledge_items" USING "pgroonga" ("search_text") WITH ("tokenizer"='TokenBigramIgnoreBlankSplitSymbolAlphaDigit', "normalizer"='NormalizerNFKC150');



CREATE OR REPLACE TRIGGER "admin_members_guard_last_super" BEFORE DELETE OR UPDATE ON "public"."admin_members" FOR EACH ROW EXECUTE FUNCTION "public"."fn_guard_last_super_admin"();



CREATE OR REPLACE TRIGGER "admin_members_sync_role" AFTER INSERT OR DELETE OR UPDATE ON "public"."admin_members" FOR EACH ROW EXECUTE FUNCTION "public"."fn_sync_admin_member_role"();



CREATE OR REPLACE TRIGGER "growth_plan_items_guard_student_update" BEFORE UPDATE ON "public"."growth_plan_items" FOR EACH ROW EXECUTE FUNCTION "public"."fn_growth_plan_items_guard_student_update"();



CREATE OR REPLACE TRIGGER "orders_guard_refunded_immutable_trg" BEFORE UPDATE OF "status" ON "public"."orders" FOR EACH ROW WHEN ((("old"."status" = 'refunded'::"text") AND ("new"."status" IS DISTINCT FROM 'refunded'::"text"))) EXECUTE FUNCTION "public"."orders_guard_refunded_immutable"();



CREATE OR REPLACE TRIGGER "orders_void_coupons_on_terminal_status_trg" AFTER UPDATE OF "status" ON "public"."orders" FOR EACH ROW WHEN ((("old"."status" IS DISTINCT FROM "new"."status") AND ("new"."status" = ANY (ARRAY['canceled'::"text", 'failed'::"text"])))) EXECUTE FUNCTION "public"."orders_void_coupons_on_terminal_status"();



CREATE OR REPLACE TRIGGER "performance_credit_ledger_validate_reversal_trg" BEFORE INSERT ON "public"."performance_credit_ledger" FOR EACH ROW EXECUTE FUNCTION "public"."performance_credit_ledger_validate_reversal"();



CREATE OR REPLACE TRIGGER "refund_requests_guard_direct_completion_trg" BEFORE UPDATE ON "public"."refund_requests" FOR EACH ROW EXECUTE FUNCTION "public"."refund_requests_guard_direct_completion"();



CREATE OR REPLACE TRIGGER "set_company_news_updated_at" BEFORE UPDATE ON "public"."company_news" FOR EACH ROW EXECUTE FUNCTION "public"."set_homepage_content_updated_at"();



CREATE OR REPLACE TRIGGER "set_home_acceptance_cards_updated_at" BEFORE UPDATE ON "public"."home_acceptance_cards" FOR EACH ROW EXECUTE FUNCTION "public"."set_homepage_content_updated_at"();



CREATE OR REPLACE TRIGGER "set_home_mentor_strategies_updated_at" BEFORE UPDATE ON "public"."home_mentor_strategies" FOR EACH ROW EXECUTE FUNCTION "public"."set_homepage_content_updated_at"();



CREATE OR REPLACE TRIGGER "set_home_side_banners_updated_at" BEFORE UPDATE ON "public"."home_side_banners" FOR EACH ROW EXECUTE FUNCTION "public"."set_homepage_content_updated_at"();



CREATE OR REPLACE TRIGGER "set_learning_diagnosis_options_updated_at" BEFORE UPDATE ON "public"."learning_diagnosis_options" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_learning_diagnosis_programs_updated_at" BEFORE UPDATE ON "public"."learning_diagnosis_programs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_learning_diagnosis_questions_updated_at" BEFORE UPDATE ON "public"."learning_diagnosis_questions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_performance_session_vectors_updated_at" BEFORE UPDATE ON "public"."performance_session_vectors" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_performance_sessions_updated_at" BEFORE UPDATE ON "public"."performance_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_performance_submissions_updated_at" BEFORE UPDATE ON "public"."performance_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_premium_book_pages_updated_at" BEFORE UPDATE ON "public"."premium_book_pages" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_premium_consult_requests_updated_at" BEFORE UPDATE ON "public"."premium_consult_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_activity_records_updated_at" BEFORE UPDATE ON "public"."activity_records" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_admission_results_updated_at" BEFORE UPDATE ON "public"."admission_results" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_banners_updated_at" BEFORE UPDATE ON "public"."banners" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_daily_entries_updated_at" BEFORE UPDATE ON "public"."daily_entries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_daily_settlements_updated_at" BEFORE UPDATE ON "public"."daily_settlements" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_enrollments_updated_at" BEFORE UPDATE ON "public"."enrollments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_faqs_updated_at" BEFORE UPDATE ON "public"."faqs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_galleries_updated_at" BEFORE UPDATE ON "public"."galleries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_goal_daily_records_updated_at" BEFORE UPDATE ON "public"."goal_daily_records" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_goal_mentor_comments_updated_at" BEFORE UPDATE ON "public"."goal_mentor_comments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_goal_plan_tasks_updated_at" BEFORE UPDATE ON "public"."goal_plan_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_goal_schedules_updated_at" BEFORE UPDATE ON "public"."goal_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_goal_students_updated_at" BEFORE UPDATE ON "public"."goal_students" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_goal_subject_targets_updated_at" BEFORE UPDATE ON "public"."goal_subject_targets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_goal_timer_sessions_updated_at" BEFORE UPDATE ON "public"."goal_timer_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_goal_university_cuts_updated_at" BEFORE UPDATE ON "public"."goal_university_cuts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_goal_workbooks_updated_at" BEFORE UPDATE ON "public"."goal_workbooks" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_growth_plan_items_updated_at" BEFORE UPDATE ON "public"."growth_plan_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_growth_profiles_updated_at" BEFORE UPDATE ON "public"."growth_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_inquiry_sessions_updated_at" BEFORE UPDATE ON "public"."inquiry_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_inquiry_submissions_updated_at" BEFORE UPDATE ON "public"."inquiry_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_knowledge_golden_queries_updated_at" BEFORE UPDATE ON "public"."knowledge_golden_queries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_learning_diagnosis_v2_survey_copy_updated_at" BEFORE UPDATE ON "public"."learning_diagnosis_v2_survey_copy" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_mentor_applications_updated_at" BEFORE UPDATE ON "public"."mentor_applications" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_mentor_apply_copy_updated_at" BEFORE UPDATE ON "public"."mentor_apply_copy" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_mentor_apply_faqs_updated_at" BEFORE UPDATE ON "public"."mentor_apply_faqs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_notices_updated_at" BEFORE UPDATE ON "public"."notices" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_page_contents_updated_at" BEFORE UPDATE ON "public"."page_contents" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_popups_updated_at" BEFORE UPDATE ON "public"."popups" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_profiles_lock_identity_fields" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."fn_profiles_lock_identity_fields"();



CREATE OR REPLACE TRIGGER "trg_profiles_lock_tenant" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."fn_profiles_lock_tenant"();



CREATE OR REPLACE TRIGGER "trg_program_access_grants_updated_at" BEFORE UPDATE ON "public"."program_access_grants" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_program_categories_updated_at" BEFORE UPDATE ON "public"."program_categories" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_refunds_updated_at" BEFORE UPDATE ON "public"."refunds" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_selfeval_session_activities_updated_at" BEFORE UPDATE ON "public"."selfeval_session_activities" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_selfeval_sessions_updated_at" BEFORE UPDATE ON "public"."selfeval_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_student_profiles_stamp" BEFORE INSERT OR UPDATE ON "public"."student_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."fn_student_profiles_stamp"();



CREATE OR REPLACE TRIGGER "trg_tenants_lock_code" BEFORE UPDATE ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."fn_tenants_lock_code"();



CREATE OR REPLACE TRIGGER "trg_tenants_updated_at" BEFORE UPDATE ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_trending_departments_updated_at" BEFORE UPDATE ON "public"."trending_departments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_usage_status_updated_at" BEFORE UPDATE ON "public"."usage_status" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_winning_base_data_updated_at" BEFORE UPDATE ON "public"."winning_base_data" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_winning_db_inputs_updated_at" BEFORE UPDATE ON "public"."winning_db_inputs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "zz_company_news_keep_updated_at" BEFORE UPDATE ON "public"."company_news" FOR EACH ROW EXECUTE FUNCTION "public"."keep_updated_at_on_view_count_only"();



CREATE OR REPLACE TRIGGER "zz_notices_keep_updated_at" BEFORE UPDATE ON "public"."notices" FOR EACH ROW EXECUTE FUNCTION "public"."keep_updated_at_on_view_count_only"();



ALTER TABLE ONLY "public"."activity_records"
    ADD CONSTRAINT "activity_records_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_access_logs"
    ADD CONSTRAINT "admin_access_logs_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_member_permissions"
    ADD CONSTRAINT "admin_member_permissions_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_member_permissions"
    ADD CONSTRAINT "admin_member_permissions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."admin_members"("profile_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_member_permissions"
    ADD CONSTRAINT "admin_member_permissions_resource_key_fkey" FOREIGN KEY ("resource_key") REFERENCES "public"."admin_resources"("key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_members"
    ADD CONSTRAINT "admin_members_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_members"
    ADD CONSTRAINT "admin_members_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_members"
    ADD CONSTRAINT "admin_members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."admin_roles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."admin_role_permissions"
    ADD CONSTRAINT "admin_role_permissions_resource_key_fkey" FOREIGN KEY ("resource_key") REFERENCES "public"."admin_resources"("key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_role_permissions"
    ADD CONSTRAINT "admin_role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."admin_roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."alimtalk_send_logs"
    ADD CONSTRAINT "alimtalk_send_logs_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bundle_items"
    ADD CONSTRAINT "bundle_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bundle_items"
    ADD CONSTRAINT "bundle_items_program_key_fkey" FOREIGN KEY ("program_key") REFERENCES "public"."programs"("program_key");



ALTER TABLE ONLY "public"."coupon_grants"
    ADD CONSTRAINT "coupon_grants_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."coupon_grants"
    ADD CONSTRAINT "coupon_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coupon_redemptions"
    ADD CONSTRAINT "coupon_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."coupon_redemptions"
    ADD CONSTRAINT "coupon_redemptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."coupon_redemptions"
    ADD CONSTRAINT "coupon_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."diagnosis_attempts"
    ADD CONSTRAINT "diagnosis_attempts_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "public"."performance_credit_ledger"("id");



ALTER TABLE ONLY "public"."diagnosis_reports"
    ADD CONSTRAINT "diagnosis_reports_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "public"."diagnosis_attempts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."diagnosis_reports"
    ADD CONSTRAINT "diagnosis_reports_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."goal_advice_cache"
    ADD CONSTRAINT "goal_advice_cache_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."goal_students"("profile_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."goal_daily_records"
    ADD CONSTRAINT "goal_daily_records_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."goal_students"("profile_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."goal_direction_reports"
    ADD CONSTRAINT "goal_direction_reports_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."goal_students"("profile_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."goal_mentor_comments"
    ADD CONSTRAINT "goal_mentor_comments_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."goal_students"("profile_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."goal_plan_tasks"
    ADD CONSTRAINT "goal_plan_tasks_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."goal_students"("profile_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."goal_plan_tasks"
    ADD CONSTRAINT "goal_plan_tasks_workbook_id_fkey" FOREIGN KEY ("workbook_id") REFERENCES "public"."goal_workbooks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."goal_probability_logs"
    ADD CONSTRAINT "goal_probability_logs_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."goal_students"("profile_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."goal_probability_logs"
    ADD CONSTRAINT "goal_probability_logs_source_record_id_fkey" FOREIGN KEY ("source_record_id") REFERENCES "public"."goal_daily_records"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."goal_schedules"
    ADD CONSTRAINT "goal_schedules_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."goal_students"("profile_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."goal_students"
    ADD CONSTRAINT "goal_students_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."goal_subject_targets"
    ADD CONSTRAINT "goal_subject_targets_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."goal_students"("profile_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."goal_timer_sessions"
    ADD CONSTRAINT "goal_timer_sessions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."goal_students"("profile_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."goal_timer_subjects"
    ADD CONSTRAINT "goal_timer_subjects_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."goal_students"("profile_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."goal_workbooks"
    ADD CONSTRAINT "goal_workbooks_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."goal_students"("profile_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."growth_plan_items"
    ADD CONSTRAINT "growth_plan_items_carried_from_report_id_fkey" FOREIGN KEY ("carried_from_report_id") REFERENCES "public"."growth_reports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."growth_plan_items"
    ADD CONSTRAINT "growth_plan_items_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."growth_plan_items"
    ADD CONSTRAINT "growth_plan_items_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."growth_reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."growth_profiles"
    ADD CONSTRAINT "growth_profiles_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."growth_reports"
    ADD CONSTRAINT "growth_reports_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "public"."performance_credit_ledger"("id");



ALTER TABLE ONLY "public"."growth_reports"
    ADD CONSTRAINT "growth_reports_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."growth_uploads"
    ADD CONSTRAINT "growth_uploads_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."identity_verifications"
    ADD CONSTRAINT "identity_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inquiry_assets"
    ADD CONSTRAINT "inquiry_assets_activity_record_id_fkey" FOREIGN KEY ("activity_record_id") REFERENCES "public"."activity_records"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inquiry_assets"
    ADD CONSTRAINT "inquiry_assets_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inquiry_assets"
    ADD CONSTRAINT "inquiry_assets_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."inquiry_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inquiry_reports"
    ADD CONSTRAINT "inquiry_reports_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inquiry_reports"
    ADD CONSTRAINT "inquiry_reports_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."inquiry_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inquiry_reports"
    ADD CONSTRAINT "inquiry_reports_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."inquiry_submissions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inquiry_reports"
    ADD CONSTRAINT "inquiry_reports_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."inquiry_topics"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inquiry_sessions"
    ADD CONSTRAINT "inquiry_sessions_design_report_fk" FOREIGN KEY ("design_report_id") REFERENCES "public"."inquiry_reports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inquiry_sessions"
    ADD CONSTRAINT "inquiry_sessions_final_report_fk" FOREIGN KEY ("final_report_id") REFERENCES "public"."inquiry_reports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inquiry_sessions"
    ADD CONSTRAINT "inquiry_sessions_growth_report_id_fkey" FOREIGN KEY ("growth_report_id") REFERENCES "public"."growth_reports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inquiry_sessions"
    ADD CONSTRAINT "inquiry_sessions_latest_evaluation_fk" FOREIGN KEY ("latest_evaluation_id") REFERENCES "public"."inquiry_reports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inquiry_sessions"
    ADD CONSTRAINT "inquiry_sessions_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "public"."performance_credit_ledger"("id");



ALTER TABLE ONLY "public"."inquiry_sessions"
    ADD CONSTRAINT "inquiry_sessions_plan_item_id_fkey" FOREIGN KEY ("plan_item_id") REFERENCES "public"."growth_plan_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inquiry_sessions"
    ADD CONSTRAINT "inquiry_sessions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inquiry_sessions"
    ADD CONSTRAINT "inquiry_sessions_selected_topic_fk" FOREIGN KEY ("selected_topic_id") REFERENCES "public"."inquiry_topics"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inquiry_submissions"
    ADD CONSTRAINT "inquiry_submissions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inquiry_submissions"
    ADD CONSTRAINT "inquiry_submissions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."inquiry_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inquiry_topics"
    ADD CONSTRAINT "inquiry_topics_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inquiry_topics"
    ADD CONSTRAINT "inquiry_topics_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."inquiry_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_diagnosis_options"
    ADD CONSTRAINT "learning_diagnosis_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."learning_diagnosis_questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_diagnosis_options"
    ADD CONSTRAINT "learning_diagnosis_options_question_key_fkey" FOREIGN KEY ("question_key") REFERENCES "public"."learning_diagnosis_questions"("question_key") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."link_code_lookups"
    ADD CONSTRAINT "link_code_lookups_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mentor_applications"
    ADD CONSTRAINT "mentor_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_parent_profile_id_fkey" FOREIGN KEY ("parent_profile_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_student_profile_id_fkey" FOREIGN KEY ("student_profile_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_superseded_by_order_id_fkey" FOREIGN KEY ("superseded_by_order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



COMMENT ON CONSTRAINT "orders_user_id_fkey" ON "public"."orders" IS '비회원 결제 차단(M5, 2026-08-12)으로 user_id가 NOT NULL이 됐다. ON DELETE는 SET NULL에서 RESTRICT로 바꿨다 — SET NULL은 NOT NULL과 양립 불가(사용자 삭제 시 23502로 실패)이고, CASCADE는 주문 이력을 지워 정산·법적 보존 요건과 충돌한다. RESTRICT는 주문이 있는 사용자의 삭제 자체를 막아 orders 행을 원 소유자 연결 그대로 보존한다.';



ALTER TABLE ONLY "public"."parent_child_links"
    ADD CONSTRAINT "parent_child_links_link_code_id_fkey" FOREIGN KEY ("link_code_id") REFERENCES "public"."student_link_codes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."parent_child_links"
    ADD CONSTRAINT "parent_child_links_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_child_links"
    ADD CONSTRAINT "parent_child_links_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."parent_child_links"
    ADD CONSTRAINT "parent_child_links_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_program_key_fkey" FOREIGN KEY ("program_key") REFERENCES "public"."programs"("program_key");



ALTER TABLE ONLY "public"."performance_attachments"
    ADD CONSTRAINT "performance_attachments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."performance_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."performance_credit_ledger"
    ADD CONSTRAINT "performance_credit_ledger_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "public"."program_access_grants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."performance_credit_ledger"
    ADD CONSTRAINT "performance_credit_ledger_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."performance_credit_ledger"
    ADD CONSTRAINT "performance_credit_ledger_reversal_of_fkey" FOREIGN KEY ("reversal_of") REFERENCES "public"."performance_credit_ledger"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."performance_credit_ledger"
    ADD CONSTRAINT "performance_credit_ledger_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."performance_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."performance_messages"
    ADD CONSTRAINT "performance_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."performance_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."performance_reports"
    ADD CONSTRAINT "performance_reports_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."performance_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."performance_reports"
    ADD CONSTRAINT "performance_reports_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."performance_submissions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."performance_reports"
    ADD CONSTRAINT "performance_reports_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."performance_topics"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."performance_session_vectors"
    ADD CONSTRAINT "performance_session_vectors_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."performance_session_vectors"
    ADD CONSTRAINT "performance_session_vectors_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."performance_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."performance_sessions"
    ADD CONSTRAINT "performance_sessions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."performance_sessions"
    ADD CONSTRAINT "performance_sessions_selected_topic_id_fkey" FOREIGN KEY ("selected_topic_id") REFERENCES "public"."performance_topics"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."performance_submissions"
    ADD CONSTRAINT "performance_submissions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."performance_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."performance_topics"
    ADD CONSTRAINT "performance_topics_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."performance_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."phone_verifications"
    ADD CONSTRAINT "phone_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_program_key_fkey" FOREIGN KEY ("program_key") REFERENCES "public"."programs"("program_key") ON DELETE RESTRICT;



COMMENT ON CONSTRAINT "products_program_key_fkey" ON "public"."products" IS '상품이 부여하는 프로그램 권한. ON DELETE RESTRICT — 프로그램을 지우면 그 상품이 무엇을 주는지 알 수 없게 되므로 삭제 자체를 막는다(M3, 2026-08-11). program_access_program_key_fkey(programs 참조, CASCADE)와 의도가 다르다 — 그쪽은 권한 "이력", 이쪽은 상품 "정의"라 삭제 시 함께 지워지면 안 된다.';



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."program_access_grants"
    ADD CONSTRAINT "program_access_grants_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."program_access_grants"
    ADD CONSTRAINT "program_access_grants_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."program_access_grants"
    ADD CONSTRAINT "program_access_grants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_access_grants"
    ADD CONSTRAINT "program_access_grants_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_access_grants"
    ADD CONSTRAINT "program_access_grants_program_key_fkey" FOREIGN KEY ("program_key") REFERENCES "public"."programs"("program_key") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."program_access"
    ADD CONSTRAINT "program_access_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_access"
    ADD CONSTRAINT "program_access_program_key_fkey" FOREIGN KEY ("program_key") REFERENCES "public"."programs"("program_key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_parent_profile_id_fkey" FOREIGN KEY ("parent_profile_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_student_profile_id_fkey" FOREIGN KEY ("student_profile_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."selfeval_reports"
    ADD CONSTRAINT "selfeval_reports_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."selfeval_reports"
    ADD CONSTRAINT "selfeval_reports_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."selfeval_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."selfeval_session_activities"
    ADD CONSTRAINT "selfeval_session_activities_activity_record_id_fkey" FOREIGN KEY ("activity_record_id") REFERENCES "public"."activity_records"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."selfeval_session_activities"
    ADD CONSTRAINT "selfeval_session_activities_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."selfeval_session_activities"
    ADD CONSTRAINT "selfeval_session_activities_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."selfeval_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."selfeval_sessions"
    ADD CONSTRAINT "selfeval_sessions_growth_report_id_fkey" FOREIGN KEY ("growth_report_id") REFERENCES "public"."growth_reports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."selfeval_sessions"
    ADD CONSTRAINT "selfeval_sessions_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "public"."performance_credit_ledger"("id");



ALTER TABLE ONLY "public"."selfeval_sessions"
    ADD CONSTRAINT "selfeval_sessions_plan_item_id_fkey" FOREIGN KEY ("plan_item_id") REFERENCES "public"."growth_plan_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."selfeval_sessions"
    ADD CONSTRAINT "selfeval_sessions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_link_codes"
    ADD CONSTRAINT "student_link_codes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_profiles"
    ADD CONSTRAINT "student_profiles_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_profiles"
    ADD CONSTRAINT "student_profiles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_term_agreements"
    ADD CONSTRAINT "user_term_agreements_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."user_term_agreements"
    ADD CONSTRAINT "user_term_agreements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admin can manage banners" ON "public"."banners" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admin can manage reviews" ON "public"."reviews" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admin can manage services" ON "public"."services" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admin manage admission results" ON "public"."admission_results" TO "authenticated" USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "Admin manage trending departments" ON "public"."trending_departments" TO "authenticated" USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "Admins can delete admission posts" ON "public"."admission_posts" FOR DELETE USING ("public"."is_winning_admin"());



CREATE POLICY "Admins can delete galleries" ON "public"."galleries" FOR DELETE USING ("public"."is_winning_admin"());



CREATE POLICY "Admins can delete notices" ON "public"."notices" FOR DELETE USING ("public"."is_winning_admin"());



CREATE POLICY "Admins can delete page contents" ON "public"."page_contents" FOR DELETE USING ("public"."is_winning_admin"());



CREATE POLICY "Admins can insert admission posts" ON "public"."admission_posts" FOR INSERT WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "Admins can insert galleries" ON "public"."galleries" FOR INSERT WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "Admins can insert notices" ON "public"."notices" FOR INSERT WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "Admins can insert page contents" ON "public"."page_contents" FOR INSERT WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "Admins can read admission posts" ON "public"."admission_posts" FOR SELECT USING ("public"."is_winning_admin"());



CREATE POLICY "Admins can read galleries" ON "public"."galleries" FOR SELECT USING ("public"."is_winning_admin"());



CREATE POLICY "Admins can read notices" ON "public"."notices" FOR SELECT USING ("public"."is_winning_admin"());



CREATE POLICY "Admins can read page contents" ON "public"."page_contents" FOR SELECT USING ("public"."is_winning_admin"());



CREATE POLICY "Admins can update admission posts" ON "public"."admission_posts" FOR UPDATE USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "Admins can update galleries" ON "public"."galleries" FOR UPDATE USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "Admins can update notices" ON "public"."notices" FOR UPDATE USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "Admins can update page contents" ON "public"."page_contents" FOR UPDATE USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "Anyone can view active banners" ON "public"."banners" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



CREATE POLICY "Anyone can view active reviews" ON "public"."reviews" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



CREATE POLICY "Anyone can view active services" ON "public"."services" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



CREATE POLICY "Public can read active admission posts" ON "public"."admission_posts" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Public can read active galleries" ON "public"."galleries" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Public can read active notices" ON "public"."notices" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Public can read active page contents" ON "public"."page_contents" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Public read admission results" ON "public"."admission_results" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



CREATE POLICY "Public read jungsi results" ON "public"."admission_jungsi_results" FOR SELECT USING (true);



CREATE POLICY "Public read susi results" ON "public"."admission_susi_results" FOR SELECT USING (true);



CREATE POLICY "Public read trending departments" ON "public"."trending_departments" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



ALTER TABLE "public"."activity_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activity_records delete own manual" ON "public"."activity_records" FOR DELETE TO "authenticated" USING ((("profile_id" = "auth"."uid"()) AND ("source_program" = 'manual'::"text")));



CREATE POLICY "activity_records insert own manual" ON "public"."activity_records" FOR INSERT TO "authenticated" WITH CHECK ((("profile_id" = "auth"."uid"()) AND ("source_program" = 'manual'::"text")));



CREATE POLICY "activity_records select own linked admin" ON "public"."activity_records" FOR SELECT TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR "public"."fn_is_linked_pair"("auth"."uid"(), "profile_id") OR "public"."is_winning_admin"()));



CREATE POLICY "activity_records update own manual" ON "public"."activity_records" FOR UPDATE TO "authenticated" USING ((("profile_id" = "auth"."uid"()) AND ("source_program" = 'manual'::"text"))) WITH CHECK ((("profile_id" = "auth"."uid"()) AND ("source_program" = 'manual'::"text")));



CREATE POLICY "admin access log self insert" ON "public"."admin_access_logs" FOR INSERT TO "authenticated" WITH CHECK ((("profile_id" = "auth"."uid"()) AND "public"."is_winning_admin"()));



CREATE POLICY "admin access log super read" ON "public"."admin_access_logs" FOR SELECT TO "authenticated" USING ("public"."fn_is_super_admin"());



ALTER TABLE "public"."admin_access_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_member_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_member_permissions_read" ON "public"."admin_member_permissions" FOR SELECT TO "authenticated" USING ("public"."fn_is_active_admin"());



CREATE POLICY "admin_member_permissions_super_all" ON "public"."admin_member_permissions" TO "authenticated" USING ("public"."fn_is_super_admin"()) WITH CHECK ("public"."fn_is_super_admin"());



ALTER TABLE "public"."admin_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_members_read" ON "public"."admin_members" FOR SELECT TO "authenticated" USING ("public"."fn_is_active_admin"());



CREATE POLICY "admin_members_super_all" ON "public"."admin_members" TO "authenticated" USING ("public"."fn_is_super_admin"()) WITH CHECK ("public"."fn_is_super_admin"());



ALTER TABLE "public"."admin_resources" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_resources_read" ON "public"."admin_resources" FOR SELECT TO "authenticated" USING ("public"."fn_is_active_admin"());



CREATE POLICY "admin_resources_super_all" ON "public"."admin_resources" TO "authenticated" USING ("public"."fn_is_super_admin"()) WITH CHECK ("public"."fn_is_super_admin"());



ALTER TABLE "public"."admin_role_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_role_permissions_read" ON "public"."admin_role_permissions" FOR SELECT TO "authenticated" USING ("public"."fn_is_active_admin"());



CREATE POLICY "admin_role_permissions_super_all" ON "public"."admin_role_permissions" TO "authenticated" USING ("public"."fn_is_super_admin"()) WITH CHECK ("public"."fn_is_super_admin"());



ALTER TABLE "public"."admin_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_roles_read" ON "public"."admin_roles" FOR SELECT TO "authenticated" USING ("public"."fn_is_active_admin"());



CREATE POLICY "admin_roles_super_all" ON "public"."admin_roles" TO "authenticated" USING ("public"."fn_is_super_admin"()) WITH CHECK ("public"."fn_is_super_admin"());



ALTER TABLE "public"."admission_acceptance_rates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admission_acceptance_rates_admin_all" ON "public"."admission_acceptance_rates" USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "admission_acceptance_rates_public_read" ON "public"."admission_acceptance_rates" FOR SELECT TO "authenticated", "anon" USING ((("is_active" = true) OR "public"."is_winning_admin"()));



ALTER TABLE "public"."admission_case_logos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admission_case_logos_admin_all" ON "public"."admission_case_logos" USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "admission_case_logos_public_read" ON "public"."admission_case_logos" FOR SELECT TO "authenticated", "anon" USING ((("is_active" = true) OR "public"."is_winning_admin"()));



ALTER TABLE "public"."admission_jungsi_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admission_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admission_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admission_susi_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admission_universities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admission_universities_admin_all" ON "public"."admission_universities" USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "admission_universities_public_read" ON "public"."admission_universities" FOR SELECT TO "authenticated", "anon" USING ((("is_active" = true) OR "public"."is_winning_admin"()));



ALTER TABLE "public"."admission_university_resources" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admission_university_resources_admin_all" ON "public"."admission_university_resources" USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "admission_university_resources_public_read" ON "public"."admission_university_resources" FOR SELECT TO "authenticated", "anon" USING ((("is_active" = true) OR "public"."is_winning_admin"()));



ALTER TABLE "public"."ai_model_calls" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_model_calls_admin_select" ON "public"."ai_model_calls" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



ALTER TABLE "public"."ai_retrieval_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_retrieval_events_admin_select" ON "public"."ai_retrieval_events" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



ALTER TABLE "public"."alimtalk_send_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "alimtalk_send_logs admin select" ON "public"."alimtalk_send_logs" FOR SELECT TO "authenticated" USING ("public"."fn_admin_can"('members'::"text", 'view'::"text"));



ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_settings_admin_write" ON "public"."app_settings" TO "authenticated" USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "app_settings_public_read" ON "public"."app_settings" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."banners" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "banners_admin_all" ON "public"."banners" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "banners_public_read" ON "public"."banners" FOR SELECT TO "authenticated", "anon" USING ((("is_active" = true) OR "public"."is_admin"()));



CREATE POLICY "banners_public_select_active" ON "public"."banners" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



ALTER TABLE "public"."board_views" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bundle_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bundle_items_select_all" ON "public"."bundle_items" FOR SELECT TO "authenticated", "anon" USING (true);



COMMENT ON POLICY "bundle_items_select_all" ON "public"."bundle_items" IS 'products 와 동일한 공개 수준 — 카탈로그 조회는 누구나. 쓰기 정책은 없다(어드민 화면 없음, seed/수기 UPDATE 전용 — products 와 동일 운영 방식).';



ALTER TABLE "public"."company_news" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_news_admin_delete" ON "public"."company_news" FOR DELETE TO "authenticated" USING ("public"."is_winning_admin"());



CREATE POLICY "company_news_admin_insert" ON "public"."company_news" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "company_news_admin_update" ON "public"."company_news" FOR UPDATE TO "authenticated" USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "company_news_public_read" ON "public"."company_news" FOR SELECT USING ((("is_active" = true) OR "public"."is_winning_admin"()));



ALTER TABLE "public"."coupon_grants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coupon_grants admin select" ON "public"."coupon_grants" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "coupon_grants select own" ON "public"."coupon_grants" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR "public"."fn_is_linked_pair"("auth"."uid"(), "user_id")));



COMMENT ON POLICY "coupon_grants select own" ON "public"."coupon_grants" IS '본인 발급분과, 현재 approved 로 연결된 상대(학생↔학부모)의 발급분을 함께 볼 수 있다 — 체크아웃 후보 목록이 학생+학부모 쌍이므로(5-d절) 조회도 쌍으로 넓힌다. 현재 링크 기준(주문 스냅샷 아님) — fn_request_refund 의 과거 권한 유지 원칙과는 반대 방향이다(sql/68 5-g절). admin select 정책은 sql/55 그대로 별도 유지(permissive 로 공존).';



ALTER TABLE "public"."coupon_redemptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coupon_redemptions admin select" ON "public"."coupon_redemptions" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "coupon_redemptions admin update" ON "public"."coupon_redemptions" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "coupon_redemptions select own" ON "public"."coupon_redemptions" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "coupon_redemptions"."order_id") AND ("o"."parent_profile_id" = "auth"."uid"()))))));



COMMENT ON POLICY "coupon_redemptions select own" ON "public"."coupon_redemptions" IS '귀속된 소유자(user_id 직접 일치)와 그 주문의 학부모(orders.parent_profile_id 조인) 둘 다 조회 가능. 학부모가 결제를 실행한 자기 주문의 쿠폰 적용 내역을 봐야 하는데 user_id 는 더 이상 항상 학부모가 아니라서(sql/68 5-d절) 직접 일치만으로는 막힌다 — orders 조인으로 넓힌다(admin_select 정책은 sql/55 그대로 별도 유지, permissive 로 OR 결합).';



CREATE POLICY "coupon_redemptions select pair" ON "public"."coupon_redemptions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "coupon_redemptions"."order_id") AND (("o"."user_id" = "auth"."uid"()) OR ("o"."student_profile_id" = "auth"."uid"()) OR ("o"."parent_profile_id" = "auth"."uid"()))))));



ALTER TABLE "public"."coupons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coupons admin insert" ON "public"."coupons" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "coupons admin select" ON "public"."coupons" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "coupons admin update" ON "public"."coupons" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "coupons public read" ON "public"."coupons" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."daily_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_entries_admin_all" ON "public"."daily_entries" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."daily_settlements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_settlements_admin_all" ON "public"."daily_settlements" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."diagnosis_attempts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "diagnosis_attempts self read" ON "public"."diagnosis_attempts" FOR SELECT USING (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."diagnosis_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "diagnosis_reports select own linked admin" ON "public"."diagnosis_reports" FOR SELECT TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR "public"."fn_is_linked_pair"("auth"."uid"(), "profile_id") OR "public"."is_winning_admin"()));



ALTER TABLE "public"."enrollments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "enrollments_admin_all" ON "public"."enrollments" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."faqs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "faqs_admin_all" ON "public"."faqs" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "faqs_public_read" ON "public"."faqs" FOR SELECT TO "authenticated", "anon" USING ((("is_active" = true) OR "public"."is_admin"()));



ALTER TABLE "public"."galleries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "galleries_admin_all" ON "public"."galleries" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "galleries_public_read" ON "public"."galleries" FOR SELECT TO "authenticated", "anon" USING ((("is_active" = true) OR "public"."is_admin"()));



ALTER TABLE "public"."goal_advice_cache" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "goal_advice_cache_admin_select" ON "public"."goal_advice_cache" FOR SELECT TO "authenticated" USING ("public"."is_winning_admin"());



CREATE POLICY "goal_advice_cache_select_own" ON "public"."goal_advice_cache" FOR SELECT TO "authenticated" USING (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."goal_daily_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "goal_daily_records_admin_select" ON "public"."goal_daily_records" FOR SELECT TO "authenticated" USING ("public"."is_winning_admin"());



CREATE POLICY "goal_daily_records_select_own" ON "public"."goal_daily_records" FOR SELECT TO "authenticated" USING (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."goal_direction_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "goal_direction_reports_admin_select" ON "public"."goal_direction_reports" FOR SELECT TO "authenticated" USING ("public"."is_winning_admin"());



CREATE POLICY "goal_direction_reports_select_own" ON "public"."goal_direction_reports" FOR SELECT TO "authenticated" USING (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."goal_mentor_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "goal_mentor_comments_admin_select" ON "public"."goal_mentor_comments" FOR SELECT TO "authenticated" USING ("public"."is_winning_admin"());



CREATE POLICY "goal_mentor_comments_select_own" ON "public"."goal_mentor_comments" FOR SELECT TO "authenticated" USING (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."goal_plan_tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "goal_plan_tasks_admin_select" ON "public"."goal_plan_tasks" FOR SELECT TO "authenticated" USING ("public"."is_winning_admin"());



CREATE POLICY "goal_plan_tasks_select_own" ON "public"."goal_plan_tasks" FOR SELECT TO "authenticated" USING (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."goal_probability_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "goal_probability_logs_admin_select" ON "public"."goal_probability_logs" FOR SELECT TO "authenticated" USING ("public"."is_winning_admin"());



CREATE POLICY "goal_probability_logs_select_own" ON "public"."goal_probability_logs" FOR SELECT TO "authenticated" USING (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."goal_schedules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "goal_schedules_admin_select" ON "public"."goal_schedules" FOR SELECT TO "authenticated" USING ("public"."is_winning_admin"());



CREATE POLICY "goal_schedules_select_own" ON "public"."goal_schedules" FOR SELECT TO "authenticated" USING (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."goal_students" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "goal_students_admin_select" ON "public"."goal_students" FOR SELECT TO "authenticated" USING ("public"."is_winning_admin"());



CREATE POLICY "goal_students_select_own" ON "public"."goal_students" FOR SELECT TO "authenticated" USING (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."goal_subject_targets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "goal_subject_targets_admin_select" ON "public"."goal_subject_targets" FOR SELECT TO "authenticated" USING ("public"."is_winning_admin"());



CREATE POLICY "goal_subject_targets_select_own" ON "public"."goal_subject_targets" FOR SELECT TO "authenticated" USING (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."goal_timer_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "goal_timer_sessions_admin_select" ON "public"."goal_timer_sessions" FOR SELECT TO "authenticated" USING ("public"."is_winning_admin"());



CREATE POLICY "goal_timer_sessions_select_own" ON "public"."goal_timer_sessions" FOR SELECT TO "authenticated" USING (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."goal_timer_subjects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "goal_timer_subjects_admin_select" ON "public"."goal_timer_subjects" FOR SELECT TO "authenticated" USING ("public"."is_winning_admin"());



CREATE POLICY "goal_timer_subjects_select_own" ON "public"."goal_timer_subjects" FOR SELECT TO "authenticated" USING (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."goal_university_cuts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "goal_university_cuts_admin_all" ON "public"."goal_university_cuts" TO "authenticated" USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "goal_university_cuts_public_read" ON "public"."goal_university_cuts" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



ALTER TABLE "public"."goal_workbooks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "goal_workbooks_admin_all" ON "public"."goal_workbooks" TO "authenticated" USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "goal_workbooks_select_own" ON "public"."goal_workbooks" FOR SELECT TO "authenticated" USING (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."growth_plan_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "growth_plan_items select own linked admin" ON "public"."growth_plan_items" FOR SELECT TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR "public"."fn_is_linked_pair"("auth"."uid"(), "profile_id") OR "public"."is_winning_admin"()));



CREATE POLICY "growth_plan_items update own" ON "public"."growth_plan_items" FOR UPDATE TO "authenticated" USING (("profile_id" = "auth"."uid"())) WITH CHECK (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."growth_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "growth_profiles insert own" ON "public"."growth_profiles" FOR INSERT TO "authenticated" WITH CHECK (("profile_id" = "auth"."uid"()));



CREATE POLICY "growth_profiles select own admin" ON "public"."growth_profiles" FOR SELECT TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR "public"."is_winning_admin"()));



CREATE POLICY "growth_profiles update own" ON "public"."growth_profiles" FOR UPDATE TO "authenticated" USING (("profile_id" = "auth"."uid"())) WITH CHECK (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."growth_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "growth_reports select own admin" ON "public"."growth_reports" FOR SELECT TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR "public"."is_winning_admin"()));



ALTER TABLE "public"."growth_uploads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "growth_uploads select own admin" ON "public"."growth_uploads" FOR SELECT TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR "public"."is_winning_admin"()));



ALTER TABLE "public"."home_acceptance_cards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "home_acceptance_cards_admin_delete" ON "public"."home_acceptance_cards" FOR DELETE TO "authenticated" USING ("public"."is_winning_admin"());



CREATE POLICY "home_acceptance_cards_admin_insert" ON "public"."home_acceptance_cards" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "home_acceptance_cards_admin_update" ON "public"."home_acceptance_cards" FOR UPDATE TO "authenticated" USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "home_acceptance_cards_public_read" ON "public"."home_acceptance_cards" FOR SELECT USING ((("is_active" = true) OR "public"."is_winning_admin"()));



ALTER TABLE "public"."home_mentor_strategies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "home_mentor_strategies_admin_delete" ON "public"."home_mentor_strategies" FOR DELETE TO "authenticated" USING ("public"."is_winning_admin"());



CREATE POLICY "home_mentor_strategies_admin_insert" ON "public"."home_mentor_strategies" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "home_mentor_strategies_admin_update" ON "public"."home_mentor_strategies" FOR UPDATE TO "authenticated" USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "home_mentor_strategies_public_read" ON "public"."home_mentor_strategies" FOR SELECT USING ((("is_active" = true) OR "public"."is_winning_admin"()));



ALTER TABLE "public"."home_side_banners" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "home_side_banners_admin_delete" ON "public"."home_side_banners" FOR DELETE TO "authenticated" USING ("public"."is_winning_admin"());



CREATE POLICY "home_side_banners_admin_insert" ON "public"."home_side_banners" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "home_side_banners_admin_update" ON "public"."home_side_banners" FOR UPDATE TO "authenticated" USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "home_side_banners_public_read" ON "public"."home_side_banners" FOR SELECT USING ((("is_active" = true) OR "public"."is_winning_admin"()));



ALTER TABLE "public"."identity_verifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inquiry_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inquiry_assets select own admin" ON "public"."inquiry_assets" FOR SELECT TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR "public"."is_winning_admin"()));



ALTER TABLE "public"."inquiry_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inquiry_reports select own admin" ON "public"."inquiry_reports" FOR SELECT TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR "public"."is_winning_admin"()));



ALTER TABLE "public"."inquiry_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inquiry_sessions select own admin" ON "public"."inquiry_sessions" FOR SELECT TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR "public"."is_winning_admin"()));



ALTER TABLE "public"."inquiry_submissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inquiry_submissions select own admin" ON "public"."inquiry_submissions" FOR SELECT TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR "public"."is_winning_admin"()));



ALTER TABLE "public"."inquiry_topics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inquiry_topics select own admin" ON "public"."inquiry_topics" FOR SELECT TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR "public"."is_winning_admin"()));



ALTER TABLE "public"."knowledge_eval_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "knowledge_eval_runs_admin_all" ON "public"."knowledge_eval_runs" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."knowledge_golden_queries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "knowledge_golden_queries_admin_all" ON "public"."knowledge_golden_queries" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "learning diagnosis options admin all" ON "public"."learning_diagnosis_options" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "learning diagnosis options public read" ON "public"."learning_diagnosis_options" FOR SELECT USING (("is_active" = true));



CREATE POLICY "learning diagnosis programs admin all" ON "public"."learning_diagnosis_programs" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "learning diagnosis programs public read" ON "public"."learning_diagnosis_programs" FOR SELECT USING (("is_active" = true));



CREATE POLICY "learning diagnosis questions admin all" ON "public"."learning_diagnosis_questions" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "learning diagnosis questions public read" ON "public"."learning_diagnosis_questions" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."learning_diagnosis_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."learning_diagnosis_programs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."learning_diagnosis_questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."learning_diagnosis_v2_survey_copy" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "learning_diagnosis_v2_survey_copy admin all" ON "public"."learning_diagnosis_v2_survey_copy" TO "authenticated" USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "learning_diagnosis_v2_survey_copy public read" ON "public"."learning_diagnosis_v2_survey_copy" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."link_code_lookups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mentor_applications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mentor_applications admin all" ON "public"."mentor_applications" TO "authenticated" USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



ALTER TABLE "public"."mentor_apply_copy" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mentor_apply_copy admin all" ON "public"."mentor_apply_copy" TO "authenticated" USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "mentor_apply_copy public read" ON "public"."mentor_apply_copy" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."mentor_apply_faqs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mentor_apply_faqs admin all" ON "public"."mentor_apply_faqs" TO "authenticated" USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "mentor_apply_faqs public read" ON "public"."mentor_apply_faqs" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



ALTER TABLE "public"."notices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notices_admin_all" ON "public"."notices" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "notices_public_read" ON "public"."notices" FOR SELECT TO "authenticated", "anon" USING ((("is_active" = true) OR "public"."is_admin"()));



ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_items select own" ON "public"."order_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND (("auth"."uid"() = "o"."student_profile_id") OR ("auth"."uid"() = "o"."parent_profile_id") OR "public"."is_admin"())))));



COMMENT ON POLICY "order_items select own" ON "public"."order_items" IS '그 주문의 학생·학부모 또는 관리자만 order_items 를 조회한다(sql/71 — orders.user_id 단일 축에서 쌍+admin 축으로 교체, orders 테이블의 "orders select own" 정책과 축을 맞춤). INSERT/UPDATE/DELETE 정책은 여전히 0개 — 쓰기는 service_role/SECURITY DEFINER RPC 경유만 가능.';



ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders select own" ON "public"."orders" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "student_profile_id") OR ("auth"."uid"() = "parent_profile_id") OR "public"."is_admin"()));



ALTER TABLE "public"."page_contents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "page_contents_admin_all" ON "public"."page_contents" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "page_contents_public_read" ON "public"."page_contents" FOR SELECT TO "authenticated", "anon" USING ((("is_active" = true) OR "public"."is_admin"()));



ALTER TABLE "public"."parent_child_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "parent_child_links party read" ON "public"."parent_child_links" FOR SELECT USING ((("parent_id" = "auth"."uid"()) OR ("student_id" = "auth"."uid"()) OR "public"."is_winning_admin"()));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_select_own" ON "public"."payments" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."performance_attachments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "performance_attachments_select_own" ON "public"."performance_attachments" FOR SELECT TO "authenticated" USING ("public"."performance_owns_session"("session_id"));



ALTER TABLE "public"."performance_credit_ledger" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "performance_credit_ledger_select_own" ON "public"."performance_credit_ledger" FOR SELECT TO "authenticated" USING (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."performance_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "performance_messages_select_own" ON "public"."performance_messages" FOR SELECT TO "authenticated" USING ("public"."performance_owns_session"("session_id"));



ALTER TABLE "public"."performance_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "performance_reports_select_own" ON "public"."performance_reports" FOR SELECT TO "authenticated" USING ("public"."performance_owns_session"("session_id"));



ALTER TABLE "public"."performance_session_vectors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "performance_session_vectors_select_own" ON "public"."performance_session_vectors" FOR SELECT TO "authenticated" USING (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."performance_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "performance_sessions_select_own" ON "public"."performance_sessions" FOR SELECT TO "authenticated" USING (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."performance_submissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "performance_submissions_select_own" ON "public"."performance_submissions" FOR SELECT TO "authenticated" USING ("public"."performance_owns_session"("session_id"));



ALTER TABLE "public"."performance_topics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "performance_topics_select_own" ON "public"."performance_topics" FOR SELECT TO "authenticated" USING ("public"."performance_owns_session"("session_id"));



ALTER TABLE "public"."phone_verifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."popups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "popups_admin_all" ON "public"."popups" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "popups_public_read" ON "public"."popups" FOR SELECT TO "authenticated", "anon" USING ((("is_active" = true) OR "public"."is_admin"()));



ALTER TABLE "public"."premium_book_pages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "premium_book_pages_admin_all" ON "public"."premium_book_pages" USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "premium_book_pages_public_read" ON "public"."premium_book_pages" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."premium_consult_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "premium_consult_requests_admin_all" ON "public"."premium_consult_requests" USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "products public read" ON "public"."products" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_admin_delete_all" ON "public"."profiles" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "profiles_admin_insert_all" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "profiles_admin_select_all" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "profiles_admin_update_all" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (((("auth"."uid"() = "id") AND ("role" = 'user'::"text")) OR "public"."is_admin"()));



CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK ((("auth"."uid"() = "id") AND ("role" = ( SELECT "p"."role"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())))));



ALTER TABLE "public"."program_access" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "program_access admin select" ON "public"."program_access" FOR SELECT TO "authenticated" USING ("public"."fn_admin_can"('members'::"text", 'view'::"text"));



COMMENT ON POLICY "program_access admin select" ON "public"."program_access" IS '회원 상세 이용서비스 탭(20260822000011). 기존 정책이 program_access_select_own(auth.uid() = id) 뿐이라 어드민이 남의 이용권을 에러가 아니라 0행으로 보게 되던 것을 연다. 술어가 is_admin()이 아니라 fn_admin_can(''members'',''view'')인 이유는 파일 상단 주석 참고.';



ALTER TABLE "public"."program_access_grants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "program_access_grants_admin_select_all" ON "public"."program_access_grants" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "program_access_grants_select_own" ON "public"."program_access_grants" FOR SELECT TO "authenticated" USING (("profile_id" = "auth"."uid"()));



CREATE POLICY "program_access_select_own" ON "public"."program_access" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."program_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "program_categories_admin_all" ON "public"."program_categories" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "program_categories_public_read" ON "public"."program_categories" FOR SELECT TO "authenticated", "anon" USING ((("is_active" = true) OR "public"."is_admin"()));



ALTER TABLE "public"."programs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "programs_select_active" ON "public"."programs" FOR SELECT TO "authenticated" USING (("is_active" = true));



ALTER TABLE "public"."refund_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "refund_requests select own" ON "public"."refund_requests" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "student_profile_id") OR ("auth"."uid"() = "parent_profile_id") OR "public"."is_admin"()));



CREATE POLICY "refund_requests_admin_select_all" ON "public"."refund_requests" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "refund_requests_admin_update_all" ON "public"."refund_requests" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."refunds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "refunds_admin_all" ON "public"."refunds" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."selfeval_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "selfeval_reports select own admin" ON "public"."selfeval_reports" FOR SELECT TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR "public"."is_winning_admin"()));



ALTER TABLE "public"."selfeval_session_activities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "selfeval_session_activities select own admin" ON "public"."selfeval_session_activities" FOR SELECT TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR "public"."is_winning_admin"()));



ALTER TABLE "public"."selfeval_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "selfeval_sessions select own admin" ON "public"."selfeval_sessions" FOR SELECT TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR "public"."is_winning_admin"()));



ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."special_highschool_acceptance_rates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "special_highschool_acceptance_rates_admin_all" ON "public"."special_highschool_acceptance_rates" USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "special_highschool_acceptance_rates_public_read" ON "public"."special_highschool_acceptance_rates" FOR SELECT TO "authenticated", "anon" USING ((("is_active" = true) OR "public"."is_winning_admin"()));



ALTER TABLE "public"."special_highschool_cases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "special_highschool_cases_admin_all" ON "public"."special_highschool_cases" USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "special_highschool_cases_public_read" ON "public"."special_highschool_cases" FOR SELECT TO "authenticated", "anon" USING ((("is_active" = true) OR "public"."is_winning_admin"()));



ALTER TABLE "public"."sso_tickets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_link_codes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "student_link_codes own read" ON "public"."student_link_codes" FOR SELECT USING ((("student_id" = "auth"."uid"()) OR "public"."is_winning_admin"()));



ALTER TABLE "public"."student_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "student_profiles insert own" ON "public"."student_profiles" FOR INSERT TO "authenticated" WITH CHECK (("profile_id" = "auth"."uid"()));



CREATE POLICY "student_profiles select own linked admin" ON "public"."student_profiles" FOR SELECT TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR "public"."fn_is_linked_pair"("auth"."uid"(), "profile_id") OR "public"."is_winning_admin"()));



CREATE POLICY "student_profiles update own" ON "public"."student_profiles" FOR UPDATE TO "authenticated" USING (("profile_id" = "auth"."uid"())) WITH CHECK (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."tenant_code_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenants_select" ON "public"."tenants" FOR SELECT TO "authenticated" USING ("public"."fn_admin_can"('tenants'::"text", 'view'::"text"));



CREATE POLICY "tenants_update" ON "public"."tenants" FOR UPDATE TO "authenticated" USING ("public"."fn_admin_can"('tenants'::"text", 'edit'::"text")) WITH CHECK ("public"."fn_admin_can"('tenants'::"text", 'edit'::"text"));



ALTER TABLE "public"."terms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "terms admin write" ON "public"."terms" USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "terms public read" ON "public"."terms" FOR SELECT USING ((("is_active" = true) OR "public"."is_winning_admin"()));



ALTER TABLE "public"."trending_departments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."university_acceptances" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "university_acceptances admin write" ON "public"."university_acceptances" USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());



CREATE POLICY "university_acceptances public read" ON "public"."university_acceptances" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."usage_status" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "usage_status_admin_all" ON "public"."usage_status" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."user_term_agreements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_term_agreements own read" ON "public"."user_term_agreements" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."is_winning_admin"()));



CREATE POLICY "winning_assessment_knowledge_admin_all" ON "public"."winning_assessment_knowledge_items" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."winning_assessment_knowledge_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."winning_base_data" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "winning_base_data_admin_all" ON "public"."winning_base_data" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."winning_db_inputs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "winning_db_inputs_admin_all" ON "public"."winning_db_inputs" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."banners";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."page_contents";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































REVOKE ALL ON FUNCTION "public"."check_email_signup_state"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_email_signup_state"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_email_signup_state"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_email_signup_state"("p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."commit_performance_design_report"("p_session_id" "uuid", "p_profile_id" "uuid", "p_topic_id" "uuid", "p_sections" "jsonb", "p_model" "text", "p_prompt_version" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."commit_performance_design_report"("p_session_id" "uuid", "p_profile_id" "uuid", "p_topic_id" "uuid", "p_sections" "jsonb", "p_model" "text", "p_prompt_version" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."commit_performance_design_report"("p_session_id" "uuid", "p_profile_id" "uuid", "p_topic_id" "uuid", "p_sections" "jsonb", "p_model" "text", "p_prompt_version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."commit_performance_design_report"("p_session_id" "uuid", "p_profile_id" "uuid", "p_topic_id" "uuid", "p_sections" "jsonb", "p_model" "text", "p_prompt_version" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."commit_performance_evaluation_report"("p_session_id" "uuid", "p_profile_id" "uuid", "p_submission_id" "uuid", "p_sections" "jsonb", "p_score" smallint, "p_summary" "text", "p_model" "text", "p_prompt_version" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."commit_performance_evaluation_report"("p_session_id" "uuid", "p_profile_id" "uuid", "p_submission_id" "uuid", "p_sections" "jsonb", "p_score" smallint, "p_summary" "text", "p_model" "text", "p_prompt_version" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."commit_performance_evaluation_report"("p_session_id" "uuid", "p_profile_id" "uuid", "p_submission_id" "uuid", "p_sections" "jsonb", "p_score" smallint, "p_summary" "text", "p_model" "text", "p_prompt_version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."commit_performance_evaluation_report"("p_session_id" "uuid", "p_profile_id" "uuid", "p_submission_id" "uuid", "p_sections" "jsonb", "p_score" smallint, "p_summary" "text", "p_model" "text", "p_prompt_version" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_signup_profile"("p_name" "text", "p_username" "text", "p_phone" "text", "p_email" "text", "p_region" "text", "p_school_type" "text", "p_school_name" "text", "p_member_type" "text", "p_terms_service_agreed" boolean, "p_privacy_required_agreed" boolean, "p_identity_required_agreed" boolean, "p_privacy_optional_agreed" boolean, "p_marketing_agreed" boolean, "p_ads_agreed" boolean, "p_guardian_phone" "text", "p_guardian_consent" boolean, "p_identity_request_id" "text", "p_birth_date" "date", "p_gender" "text", "p_org_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_signup_profile"("p_name" "text", "p_username" "text", "p_phone" "text", "p_email" "text", "p_region" "text", "p_school_type" "text", "p_school_name" "text", "p_member_type" "text", "p_terms_service_agreed" boolean, "p_privacy_required_agreed" boolean, "p_identity_required_agreed" boolean, "p_privacy_optional_agreed" boolean, "p_marketing_agreed" boolean, "p_ads_agreed" boolean, "p_guardian_phone" "text", "p_guardian_consent" boolean, "p_identity_request_id" "text", "p_birth_date" "date", "p_gender" "text", "p_org_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_signup_profile"("p_name" "text", "p_username" "text", "p_phone" "text", "p_email" "text", "p_region" "text", "p_school_type" "text", "p_school_name" "text", "p_member_type" "text", "p_terms_service_agreed" boolean, "p_privacy_required_agreed" boolean, "p_identity_required_agreed" boolean, "p_privacy_optional_agreed" boolean, "p_marketing_agreed" boolean, "p_ads_agreed" boolean, "p_guardian_phone" "text", "p_guardian_consent" boolean, "p_identity_request_id" "text", "p_birth_date" "date", "p_gender" "text", "p_org_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_signup_profile"("p_name" "text", "p_username" "text", "p_phone" "text", "p_email" "text", "p_region" "text", "p_school_type" "text", "p_school_name" "text", "p_member_type" "text", "p_terms_service_agreed" boolean, "p_privacy_required_agreed" boolean, "p_identity_required_agreed" boolean, "p_privacy_optional_agreed" boolean, "p_marketing_agreed" boolean, "p_ads_agreed" boolean, "p_guardian_phone" "text", "p_guardian_consent" boolean, "p_identity_request_id" "text", "p_birth_date" "date", "p_gender" "text", "p_org_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_diagnosis_attempt"("p_attempt_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_diagnosis_attempt"("p_attempt_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."consume_diagnosis_attempt"("p_attempt_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_diagnosis_attempt"("p_attempt_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_growth_credit"("p_report_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_growth_credit"("p_report_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_inquiry_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_inquiry_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_performance_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_performance_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."consume_performance_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_performance_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_selfeval_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_selfeval_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_performance_submission"("p_session_id" "uuid", "p_profile_id" "uuid", "p_submission_id" "uuid", "p_reason" "text", "p_sections" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_performance_submission"("p_session_id" "uuid", "p_profile_id" "uuid", "p_submission_id" "uuid", "p_reason" "text", "p_sections" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."finalize_performance_submission"("p_session_id" "uuid", "p_profile_id" "uuid", "p_submission_id" "uuid", "p_reason" "text", "p_sections" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_performance_submission"("p_session_id" "uuid", "p_profile_id" "uuid", "p_submission_id" "uuid", "p_reason" "text", "p_sections" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."admin_members" TO "anon";
GRANT ALL ON TABLE "public"."admin_members" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_members" TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_activate_admin_member"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_activate_admin_member"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_activate_admin_member"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_add_months_kst"("p_ts" timestamp with time zone, "p_months" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_add_months_kst"("p_ts" timestamp with time zone, "p_months" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_add_months_kst"("p_ts" timestamp with time zone, "p_months" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_admin_can"("p_resource" "text", "p_need" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_admin_can"("p_resource" "text", "p_need" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_admin_can"("p_resource" "text", "p_need" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_admin_effective_permissions"("p_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_admin_effective_permissions"("p_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_admin_effective_permissions"("p_profile_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."refund_requests" TO "anon";
GRANT ALL ON TABLE "public"."refund_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."refund_requests" TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_admin_requote_refund"("p_refund_request_id" bigint, "p_company_fault" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_admin_requote_refund"("p_refund_request_id" bigint, "p_company_fault" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_admin_requote_refund"("p_refund_request_id" bigint, "p_company_fault" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_admin_requote_refund"("p_refund_request_id" bigint, "p_company_fault" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_admin_set_profile_tenant"("p_profile_id" "uuid", "p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_admin_set_profile_tenant"("p_profile_id" "uuid", "p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_admin_set_profile_tenant"("p_profile_id" "uuid", "p_tenant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_agree_payment_terms"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_agree_payment_terms"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_agree_payment_terms"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_agree_payment_terms"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_ai_telemetry_citations"("p_from" timestamp with time zone, "p_to" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_ai_telemetry_citations"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_ai_telemetry_daily_summary"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_service" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_ai_telemetry_daily_summary"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_service" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_complete_refund"("p_refund_request_id" bigint, "p_admin_memo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_complete_refund"("p_refund_request_id" bigint, "p_admin_memo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_complete_refund"("p_refund_request_id" bigint, "p_admin_memo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_complete_refund"("p_refund_request_id" bigint, "p_admin_memo" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_coupon_by_code"("p_code" "text", "p_subtotal" integer, "p_student_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_coupon_by_code"("p_code" "text", "p_subtotal" integer, "p_student_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_coupon_by_code"("p_code" "text", "p_subtotal" integer, "p_student_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_coupon_by_code"("p_code" "text", "p_subtotal" integer, "p_student_profile_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_coupon_by_code"("p_code" "text", "p_subtotal" integer, "p_student_profile_id" "uuid", "p_order_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_coupon_by_code"("p_code" "text", "p_subtotal" integer, "p_student_profile_id" "uuid", "p_order_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_coupon_by_code"("p_code" "text", "p_subtotal" integer, "p_student_profile_id" "uuid", "p_order_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_coupon_by_code"("p_code" "text", "p_subtotal" integer, "p_student_profile_id" "uuid", "p_order_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_coupon_global_redeemed"("p_coupon_id" "uuid", "p_at" timestamp with time zone, "p_exclude_order_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_coupon_global_redeemed"("p_coupon_id" "uuid", "p_at" timestamp with time zone, "p_exclude_order_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_coupon_global_redeemed"("p_coupon_id" "uuid", "p_at" timestamp with time zone, "p_exclude_order_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_coupon_global_redeemed"("p_coupon_id" "uuid", "p_at" timestamp with time zone, "p_exclude_order_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_coupon_grant_valid_months"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_coupon_grant_valid_months"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_coupon_grant_valid_months"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_coupon_grant_valid_until"("p_coupon_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_coupon_grant_valid_until"("p_coupon_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_coupon_grant_valid_until"("p_coupon_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_coupon_is_granted"("p_coupon_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_coupon_is_granted"("p_coupon_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_coupon_is_granted"("p_coupon_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_coupon_is_granted"("p_coupon_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_coupon_is_redeemed"("p_coupon_id" "uuid", "p_user_id" "uuid", "p_at" timestamp with time zone, "p_exclude_order_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_coupon_is_redeemed"("p_coupon_id" "uuid", "p_user_id" "uuid", "p_at" timestamp with time zone, "p_exclude_order_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_coupon_is_redeemed"("p_coupon_id" "uuid", "p_user_id" "uuid", "p_at" timestamp with time zone, "p_exclude_order_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_coupon_is_redeemed"("p_coupon_id" "uuid", "p_user_id" "uuid", "p_at" timestamp with time zone, "p_exclude_order_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_coupon_org_matches"("p_coupon_org_code" "text", "p_student" "uuid", "p_parent" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_coupon_org_matches"("p_coupon_org_code" "text", "p_student" "uuid", "p_parent" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_coupon_org_matches"("p_coupon_org_code" "text", "p_student" "uuid", "p_parent" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_coupon_org_matches"("p_coupon_org_code" "text", "p_student" "uuid", "p_parent" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_coupon_pending_hold_minutes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_coupon_pending_hold_minutes"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_coupon_pending_hold_minutes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_coupon_pending_hold_minutes"() TO "service_role";



GRANT ALL ON TABLE "public"."tenants" TO "anon";
GRANT ALL ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_create_tenant"("p_name" "text", "p_region" "text", "p_org_type" "text", "p_tier" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_create_tenant"("p_name" "text", "p_region" "text", "p_org_type" "text", "p_tier" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_create_tenant"("p_name" "text", "p_region" "text", "p_org_type" "text", "p_tier" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_delete_account"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_delete_account"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_delete_account"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_delete_account"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_finalize_paid_order"("p_order_id" "text", "p_status" "text", "p_payment_key" "text", "p_method" "text", "p_paid_at" timestamp with time zone, "p_raw" "jsonb", "p_confirm_amount" numeric, "p_require_pending_or_failed" boolean, "p_restore_revoked" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_finalize_paid_order"("p_order_id" "text", "p_status" "text", "p_payment_key" "text", "p_method" "text", "p_paid_at" timestamp with time zone, "p_raw" "jsonb", "p_confirm_amount" numeric, "p_require_pending_or_failed" boolean, "p_restore_revoked" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_finalize_paid_order"("p_order_id" "text", "p_status" "text", "p_payment_key" "text", "p_method" "text", "p_paid_at" timestamp with time zone, "p_raw" "jsonb", "p_confirm_amount" numeric, "p_require_pending_or_failed" boolean, "p_restore_revoked" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_finalize_paid_order"("p_order_id" "text", "p_status" "text", "p_payment_key" "text", "p_method" "text", "p_paid_at" timestamp with time zone, "p_raw" "jsonb", "p_confirm_amount" numeric, "p_require_pending_or_failed" boolean, "p_restore_revoked" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_generate_tenant_code"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_generate_tenant_code"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_goal_reset_student"("p_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_goal_reset_student"("p_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_goal_reset_student"("p_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_goal_reset_student"("p_profile_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."coupon_grants" TO "anon";
GRANT ALL ON TABLE "public"."coupon_grants" TO "authenticated";
GRANT ALL ON TABLE "public"."coupon_grants" TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_grant_coupon"("p_coupon_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_grant_coupon"("p_coupon_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_grant_coupon"("p_coupon_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_grant_program_access_for_order"("p_order_id" "text", "p_user_id" "uuid", "p_paid_at" timestamp with time zone, "p_restore_revoked" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_grant_program_access_for_order"("p_order_id" "text", "p_user_id" "uuid", "p_paid_at" timestamp with time zone, "p_restore_revoked" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_grant_program_access_for_order"("p_order_id" "text", "p_user_id" "uuid", "p_paid_at" timestamp with time zone, "p_restore_revoked" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_grant_program_access_for_order"("p_order_id" "text", "p_user_id" "uuid", "p_paid_at" timestamp with time zone, "p_restore_revoked" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_grant_signup_coupons"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_grant_signup_coupons"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_grant_signup_coupons"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_grant_signup_coupons_for_user"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_grant_signup_coupons_for_user"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_growth_claim_step"("p_report_id" "uuid", "p_profile_id" "uuid", "p_step" smallint, "p_stale_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_growth_claim_step"("p_report_id" "uuid", "p_profile_id" "uuid", "p_step" smallint, "p_stale_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_growth_commit_collect"("p_report_id" "uuid", "p_profile_id" "uuid", "p_track" "text", "p_grade_inputs" "jsonb", "p_activity_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_growth_commit_collect"("p_report_id" "uuid", "p_profile_id" "uuid", "p_track" "text", "p_grade_inputs" "jsonb", "p_activity_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_growth_complete_report"("p_report_id" "uuid", "p_profile_id" "uuid", "p_sections" "jsonb", "p_plan_items" "jsonb", "p_profile" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_growth_complete_report"("p_report_id" "uuid", "p_profile_id" "uuid", "p_sections" "jsonb", "p_plan_items" "jsonb", "p_profile" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_growth_finish_step"("p_report_id" "uuid", "p_profile_id" "uuid", "p_step" smallint, "p_ok" boolean, "p_patch" "jsonb", "p_issues" "jsonb", "p_extra_attempts" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_growth_finish_step"("p_report_id" "uuid", "p_profile_id" "uuid", "p_step" smallint, "p_ok" boolean, "p_patch" "jsonb", "p_issues" "jsonb", "p_extra_attempts" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_growth_merge_survey_answers"("p_report_id" "uuid", "p_profile_id" "uuid", "p_patch" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_growth_merge_survey_answers"("p_report_id" "uuid", "p_profile_id" "uuid", "p_patch" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_growth_plan_items_guard_student_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_growth_plan_items_guard_student_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_growth_plan_items_guard_student_update"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_growth_terminate_report"("p_report_id" "uuid", "p_profile_id" "uuid", "p_step" smallint, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_growth_terminate_report"("p_report_id" "uuid", "p_profile_id" "uuid", "p_step" smallint, "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_guard_last_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_guard_last_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_guard_last_super_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_inquiry_claim_generation"("p_session_id" "uuid", "p_profile_id" "uuid", "p_mode" "text", "p_stale_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_inquiry_claim_generation"("p_session_id" "uuid", "p_profile_id" "uuid", "p_mode" "text", "p_stale_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_inquiry_finalize"("p_session_id" "uuid", "p_profile_id" "uuid", "p_fields" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_inquiry_finalize"("p_session_id" "uuid", "p_profile_id" "uuid", "p_fields" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_inquiry_finish_generation"("p_session_id" "uuid", "p_profile_id" "uuid", "p_mode" "text", "p_ok" boolean, "p_issues" "jsonb", "p_extra_attempts" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_inquiry_finish_generation"("p_session_id" "uuid", "p_profile_id" "uuid", "p_mode" "text", "p_ok" boolean, "p_issues" "jsonb", "p_extra_attempts" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_inquiry_terminate_session"("p_session_id" "uuid", "p_profile_id" "uuid", "p_mode" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_inquiry_terminate_session"("p_session_id" "uuid", "p_profile_id" "uuid", "p_mode" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_is_active_admin"("p_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_is_active_admin"("p_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_is_active_admin"("p_profile_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_is_linked_pair"("p_a" "uuid", "p_b" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_is_linked_pair"("p_a" "uuid", "p_b" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_is_linked_pair"("p_a" "uuid", "p_b" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_is_linked_pair"("p_a" "uuid", "p_b" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_is_super_admin"("p_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_is_super_admin"("p_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_is_super_admin"("p_profile_id" "uuid") TO "service_role";






GRANT ALL ON FUNCTION "public"."fn_kst_day_start"("p_ts" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_kst_day_start"("p_ts" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_kst_day_start"("p_ts" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_mark_program_entry"("p_program_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_mark_program_entry"("p_program_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_mark_program_entry"("p_program_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_mark_program_entry"("p_program_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_matched_org_codes"("p_student_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_matched_org_codes"("p_student_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_matched_org_codes"("p_student_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_matched_org_codes"("p_student_profile_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_matched_tenant_ids"("p_student_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_matched_tenant_ids"("p_student_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_matched_tenant_ids"("p_student_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_matched_tenant_ids"("p_student_profile_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_my_tenant"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_my_tenant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_my_tenant"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_normalize_tenant_code"("p" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_normalize_tenant_code"("p" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_normalize_tenant_code"("p" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_order_consumption_state"("p_order_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_order_consumption_state"("p_order_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_order_consumption_state"("p_order_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_order_consumption_state"("p_order_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_parent_children"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_parent_children"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_parent_children"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_parent_children"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_parent_create_enrollment"("p_original_order_id" "text", "p_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_parent_create_enrollment"("p_original_order_id" "text", "p_items" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_parent_create_enrollment"("p_original_order_id" "text", "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_parent_create_enrollment"("p_original_order_id" "text", "p_items" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_product_org_matches"("p_org_code" "text", "p_student" "uuid", "p_parent" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_product_org_matches"("p_org_code" "text", "p_student" "uuid", "p_parent" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_product_org_matches"("p_org_code" "text", "p_student" "uuid", "p_parent" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_product_org_matches"("p_org_code" "text", "p_student" "uuid", "p_parent" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_profiles_lock_identity_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_profiles_lock_identity_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_profiles_lock_identity_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_profiles_lock_tenant"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_profiles_lock_tenant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_profiles_lock_tenant"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_program_access_grants_summary"("p_profile_id" "uuid", "p_program_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_program_access_grants_summary"("p_profile_id" "uuid", "p_program_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_program_access_grants_summary"("p_profile_id" "uuid", "p_program_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_program_access_grants_summary"("p_profile_id" "uuid", "p_program_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_program_access_state"("p_profile_id" "uuid", "p_program_keys" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_program_access_state"("p_profile_id" "uuid", "p_program_keys" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_program_access_state"("p_profile_id" "uuid", "p_program_keys" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_program_access_state"("p_profile_id" "uuid", "p_program_keys" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_refund_completed_amount"("p_order_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_refund_completed_amount"("p_order_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_refund_completed_amount"("p_order_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_refund_completed_amount"("p_order_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_refund_quote"("p_order_id" "text", "p_order_item_ids" bigint[], "p_company_fault" boolean, "p_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_refund_quote"("p_order_id" "text", "p_order_item_ids" bigint[], "p_company_fault" boolean, "p_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_refund_quote"("p_order_id" "text", "p_order_item_ids" bigint[], "p_company_fault" boolean, "p_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_refund_quote"("p_order_id" "text", "p_order_item_ids" bigint[], "p_company_fault" boolean, "p_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_request_enrollment"("p_order_id" "text", "p_student_profile_id" "uuid", "p_parent_profile_id" "uuid", "p_customer_email" "text", "p_order_name" "text", "p_items" "jsonb", "p_list_amount" integer, "p_subtotal" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_request_enrollment"("p_order_id" "text", "p_student_profile_id" "uuid", "p_parent_profile_id" "uuid", "p_customer_email" "text", "p_order_name" "text", "p_items" "jsonb", "p_list_amount" integer, "p_subtotal" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_request_enrollment"("p_order_id" "text", "p_student_profile_id" "uuid", "p_parent_profile_id" "uuid", "p_customer_email" "text", "p_order_name" "text", "p_items" "jsonb", "p_list_amount" integer, "p_subtotal" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_request_enrollment"("p_order_id" "text", "p_student_profile_id" "uuid", "p_parent_profile_id" "uuid", "p_customer_email" "text", "p_order_name" "text", "p_items" "jsonb", "p_list_amount" integer, "p_subtotal" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_request_refund"("p_order_id" "text", "p_reason" "text", "p_refund_bank" "text", "p_refund_account" "text", "p_refund_holder" "text", "p_order_item_ids" bigint[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_request_refund"("p_order_id" "text", "p_reason" "text", "p_refund_bank" "text", "p_refund_account" "text", "p_refund_holder" "text", "p_order_item_ids" bigint[]) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_request_refund"("p_order_id" "text", "p_reason" "text", "p_refund_bank" "text", "p_refund_account" "text", "p_refund_holder" "text", "p_order_item_ids" bigint[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_request_refund"("p_order_id" "text", "p_reason" "text", "p_refund_bank" "text", "p_refund_account" "text", "p_refund_holder" "text", "p_order_item_ids" bigint[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_resolve_tenant_code"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_resolve_tenant_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_resolve_tenant_code"("p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_respond_enrollment"("p_order_id" "text", "p_approve" boolean, "p_reject_reason" "text", "p_coupon_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_respond_enrollment"("p_order_id" "text", "p_approve" boolean, "p_reject_reason" "text", "p_coupon_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_respond_enrollment"("p_order_id" "text", "p_approve" boolean, "p_reject_reason" "text", "p_coupon_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_respond_enrollment"("p_order_id" "text", "p_approve" boolean, "p_reject_reason" "text", "p_coupon_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_respond_refund"("p_refund_request_id" bigint, "p_approve" boolean, "p_reject_reason" "text", "p_refund_bank" "text", "p_refund_account" "text", "p_refund_holder" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_respond_refund"("p_refund_request_id" bigint, "p_approve" boolean, "p_reject_reason" "text", "p_refund_bank" "text", "p_refund_account" "text", "p_refund_holder" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_respond_refund"("p_refund_request_id" bigint, "p_approve" boolean, "p_reject_reason" "text", "p_refund_bank" "text", "p_refund_account" "text", "p_refund_holder" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_respond_refund"("p_refund_request_id" bigint, "p_approve" boolean, "p_reject_reason" "text", "p_refund_bank" "text", "p_refund_account" "text", "p_refund_holder" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_revalidate_order_coupons"("p_order_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_revalidate_order_coupons"("p_order_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_revalidate_order_coupons"("p_order_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_revalidate_order_coupons"("p_order_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_revoke_coupon_grant"("p_grant_id" bigint, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_revoke_coupon_grant"("p_grant_id" bigint, "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_revoke_coupon_grant"("p_grant_id" bigint, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_revoke_coupon_grant"("p_grant_id" bigint, "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_revoke_program_access_for_order"("p_order_id" "text", "p_user_id" "uuid", "p_payment_status" "text", "p_reason" "text", "p_order_item_ids" bigint[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_revoke_program_access_for_order"("p_order_id" "text", "p_user_id" "uuid", "p_payment_status" "text", "p_reason" "text", "p_order_item_ids" bigint[]) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_revoke_program_access_for_order"("p_order_id" "text", "p_user_id" "uuid", "p_payment_status" "text", "p_reason" "text", "p_order_item_ids" bigint[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_revoke_program_access_for_order"("p_order_id" "text", "p_user_id" "uuid", "p_payment_status" "text", "p_reason" "text", "p_order_item_ids" bigint[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_selfeval_claim_step"("p_session_id" "uuid", "p_profile_id" "uuid", "p_step" "text", "p_stale_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_selfeval_claim_step"("p_session_id" "uuid", "p_profile_id" "uuid", "p_step" "text", "p_stale_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_selfeval_finalize"("p_session_id" "uuid", "p_profile_id" "uuid", "p_promoted" "jsonb", "p_sections" "jsonb", "p_char_count" "jsonb", "p_score" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_selfeval_finalize"("p_session_id" "uuid", "p_profile_id" "uuid", "p_promoted" "jsonb", "p_sections" "jsonb", "p_char_count" "jsonb", "p_score" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_selfeval_finish_step"("p_session_id" "uuid", "p_profile_id" "uuid", "p_step" "text", "p_ok" boolean, "p_patch" "jsonb", "p_issues" "jsonb", "p_extra_attempts" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_selfeval_finish_step"("p_session_id" "uuid", "p_profile_id" "uuid", "p_step" "text", "p_ok" boolean, "p_patch" "jsonb", "p_issues" "jsonb", "p_extra_attempts" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_selfeval_terminate_session"("p_session_id" "uuid", "p_profile_id" "uuid", "p_step" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_selfeval_terminate_session"("p_session_id" "uuid", "p_profile_id" "uuid", "p_step" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_set_my_tenant"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_set_my_tenant"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_set_my_tenant"("p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_student_parent"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_student_parent"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_student_parent"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_student_parent"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_student_profiles_stamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_student_profiles_stamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_student_profiles_stamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_sync_admin_member_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_sync_admin_member_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_sync_admin_member_role"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_sync_program_access_cache"("p_profile_id" "uuid", "p_program_key" "text", "p_empty_payment_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_sync_program_access_cache"("p_profile_id" "uuid", "p_program_key" "text", "p_empty_payment_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_sync_program_access_cache"("p_profile_id" "uuid", "p_program_key" "text", "p_empty_payment_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_sync_program_access_cache"("p_profile_id" "uuid", "p_program_key" "text", "p_empty_payment_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_tenant_matches"("p_tenant_id" "uuid", "p_student" "uuid", "p_parent" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_tenant_matches"("p_tenant_id" "uuid", "p_student" "uuid", "p_parent" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_tenant_matches"("p_tenant_id" "uuid", "p_student" "uuid", "p_parent" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_tenants_lock_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_tenants_lock_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_tenants_lock_code"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_usable_coupons"("p_subtotal" integer, "p_student_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_usable_coupons"("p_subtotal" integer, "p_student_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_usable_coupons"("p_subtotal" integer, "p_student_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_usable_coupons"("p_subtotal" integer, "p_student_profile_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_usable_coupons"("p_subtotal" integer, "p_student_profile_id" "uuid", "p_order_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_usable_coupons"("p_subtotal" integer, "p_student_profile_id" "uuid", "p_order_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_usable_coupons"("p_subtotal" integer, "p_student_profile_id" "uuid", "p_order_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_usable_coupons"("p_subtotal" integer, "p_student_profile_id" "uuid", "p_order_id" "text") TO "service_role";



GRANT ALL ON TABLE "public"."coupon_redemptions" TO "anon";
GRANT ALL ON TABLE "public"."coupon_redemptions" TO "authenticated";
GRANT ALL ON TABLE "public"."coupon_redemptions" TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_void_coupon_redemption"("p_redemption_id" bigint, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_void_coupon_redemption"("p_redemption_id" bigint, "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_void_coupon_redemption"("p_redemption_id" bigint, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_void_coupon_redemption"("p_redemption_id" bigint, "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_link_code_string"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_link_code_string"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_link_code_string"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_link_code_string"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_board_view"("p_source" "text", "p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_board_view"("p_source" "text", "p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_board_view"("p_source" "text", "p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_board_view"("p_source" "text", "p_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_email_available"("check_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_email_available"("check_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_email_available"("check_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_username_available"("check_username" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_username_available"("check_username" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_username_available"("check_username" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_winning_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_winning_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_winning_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."issue_student_link_code"("p_student_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."issue_student_link_code"("p_student_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."issue_student_link_code"("p_student_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."issue_student_link_code"("p_student_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."keep_updated_at_on_view_count_only"() TO "anon";
GRANT ALL ON FUNCTION "public"."keep_updated_at_on_view_count_only"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."keep_updated_at_on_view_count_only"() TO "service_role";












GRANT ALL ON FUNCTION "public"."orders_guard_refunded_immutable"() TO "anon";
GRANT ALL ON FUNCTION "public"."orders_guard_refunded_immutable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."orders_guard_refunded_immutable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."orders_void_coupons_on_terminal_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."orders_void_coupons_on_terminal_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."orders_void_coupons_on_terminal_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."performance_credit_ledger_validate_reversal"() TO "anon";
GRANT ALL ON FUNCTION "public"."performance_credit_ledger_validate_reversal"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."performance_credit_ledger_validate_reversal"() TO "service_role";



GRANT ALL ON FUNCTION "public"."performance_owns_session"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."performance_owns_session"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."performance_owns_session"("p_session_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."refund_requests_guard_direct_completion"() TO "anon";
GRANT ALL ON FUNCTION "public"."refund_requests_guard_direct_completion"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refund_requests_guard_direct_completion"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reissue_link_code"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reissue_link_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."reissue_link_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reissue_link_code"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_parent_link"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_parent_link"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."request_parent_link"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_parent_link"("p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."respond_parent_link"("p_link_id" "uuid", "p_approve" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."respond_parent_link"("p_link_id" "uuid", "p_approve" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."respond_parent_link"("p_link_id" "uuid", "p_approve" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."respond_parent_link"("p_link_id" "uuid", "p_approve" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."reverse_growth_credit"("p_report_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reverse_growth_credit"("p_report_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reverse_inquiry_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reverse_inquiry_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reverse_selfeval_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reverse_selfeval_credit"("p_session_id" "uuid", "p_profile_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."revoke_parent_link"("p_link_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_parent_link"("p_link_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."revoke_parent_link"("p_link_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_parent_link"("p_link_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_homepage_content_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_homepage_content_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_homepage_content_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";






























GRANT ALL ON TABLE "public"."activity_records" TO "anon";
GRANT ALL ON TABLE "public"."activity_records" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_records" TO "service_role";



GRANT ALL ON TABLE "public"."admin_access_logs" TO "anon";
GRANT ALL ON TABLE "public"."admin_access_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_access_logs" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."admin_access_log_entries" TO "anon";
GRANT ALL ON TABLE "public"."admin_access_log_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_access_log_entries" TO "service_role";



GRANT ALL ON TABLE "public"."enrollments" TO "anon";
GRANT ALL ON TABLE "public"."enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."admin_enrollment_entries" TO "anon";
GRANT ALL ON TABLE "public"."admin_enrollment_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_enrollment_entries" TO "service_role";



GRANT ALL ON TABLE "public"."admin_roles" TO "anon";
GRANT ALL ON TABLE "public"."admin_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_roles" TO "service_role";



GRANT ALL ON TABLE "public"."admin_member_directory" TO "anon";
GRANT ALL ON TABLE "public"."admin_member_directory" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_member_directory" TO "service_role";



GRANT ALL ON TABLE "public"."admin_member_permissions" TO "anon";
GRANT ALL ON TABLE "public"."admin_member_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_member_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."admin_refund_ledger" TO "anon";
GRANT ALL ON TABLE "public"."admin_refund_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_refund_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."admin_resources" TO "anon";
GRANT ALL ON TABLE "public"."admin_resources" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_resources" TO "service_role";



GRANT ALL ON TABLE "public"."admin_revenue_items" TO "anon";
GRANT ALL ON TABLE "public"."admin_revenue_items" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_revenue_items" TO "service_role";



GRANT ALL ON TABLE "public"."admin_role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."admin_role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."admission_acceptance_rates" TO "anon";
GRANT ALL ON TABLE "public"."admission_acceptance_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."admission_acceptance_rates" TO "service_role";



GRANT ALL ON TABLE "public"."admission_case_logos" TO "anon";
GRANT ALL ON TABLE "public"."admission_case_logos" TO "authenticated";
GRANT ALL ON TABLE "public"."admission_case_logos" TO "service_role";



GRANT ALL ON TABLE "public"."admission_jungsi_results" TO "anon";
GRANT ALL ON TABLE "public"."admission_jungsi_results" TO "authenticated";
GRANT ALL ON TABLE "public"."admission_jungsi_results" TO "service_role";



GRANT ALL ON SEQUENCE "public"."admission_jungsi_results_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."admission_jungsi_results_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."admission_jungsi_results_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."admission_posts" TO "anon";
GRANT ALL ON TABLE "public"."admission_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."admission_posts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."admission_posts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."admission_posts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."admission_posts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."admission_results" TO "anon";
GRANT ALL ON TABLE "public"."admission_results" TO "authenticated";
GRANT ALL ON TABLE "public"."admission_results" TO "service_role";



GRANT ALL ON TABLE "public"."admission_result_department_index" TO "anon";
GRANT ALL ON TABLE "public"."admission_result_department_index" TO "authenticated";
GRANT ALL ON TABLE "public"."admission_result_department_index" TO "service_role";



GRANT ALL ON TABLE "public"."admission_result_university_index" TO "anon";
GRANT ALL ON TABLE "public"."admission_result_university_index" TO "authenticated";
GRANT ALL ON TABLE "public"."admission_result_university_index" TO "service_role";



GRANT ALL ON SEQUENCE "public"."admission_results_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."admission_results_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."admission_results_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."admission_susi_results" TO "anon";
GRANT ALL ON TABLE "public"."admission_susi_results" TO "authenticated";
GRANT ALL ON TABLE "public"."admission_susi_results" TO "service_role";



GRANT ALL ON SEQUENCE "public"."admission_susi_results_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."admission_susi_results_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."admission_susi_results_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."admission_universities" TO "anon";
GRANT ALL ON TABLE "public"."admission_universities" TO "authenticated";
GRANT ALL ON TABLE "public"."admission_universities" TO "service_role";



GRANT ALL ON TABLE "public"."admission_university_resources" TO "anon";
GRANT ALL ON TABLE "public"."admission_university_resources" TO "authenticated";
GRANT ALL ON TABLE "public"."admission_university_resources" TO "service_role";



GRANT ALL ON TABLE "public"."admission_university_resource_index" TO "anon";
GRANT ALL ON TABLE "public"."admission_university_resource_index" TO "authenticated";
GRANT ALL ON TABLE "public"."admission_university_resource_index" TO "service_role";



GRANT ALL ON TABLE "public"."ai_model_calls" TO "anon";
GRANT ALL ON TABLE "public"."ai_model_calls" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_model_calls" TO "service_role";



GRANT ALL ON TABLE "public"."ai_retrieval_events" TO "anon";
GRANT ALL ON TABLE "public"."ai_retrieval_events" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_retrieval_events" TO "service_role";



GRANT ALL ON TABLE "public"."alimtalk_send_logs" TO "anon";
GRANT ALL ON TABLE "public"."alimtalk_send_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."alimtalk_send_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."alimtalk_send_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."alimtalk_send_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."alimtalk_send_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT ALL ON TABLE "public"."banners" TO "anon";
GRANT ALL ON TABLE "public"."banners" TO "authenticated";
GRANT ALL ON TABLE "public"."banners" TO "service_role";



GRANT ALL ON SEQUENCE "public"."banners_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."banners_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."banners_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."board_views" TO "anon";
GRANT ALL ON TABLE "public"."board_views" TO "authenticated";
GRANT ALL ON TABLE "public"."board_views" TO "service_role";



GRANT ALL ON TABLE "public"."bundle_items" TO "anon";
GRANT ALL ON TABLE "public"."bundle_items" TO "authenticated";
GRANT ALL ON TABLE "public"."bundle_items" TO "service_role";



GRANT ALL ON TABLE "public"."company_news" TO "anon";
GRANT ALL ON TABLE "public"."company_news" TO "authenticated";
GRANT ALL ON TABLE "public"."company_news" TO "service_role";



GRANT ALL ON SEQUENCE "public"."coupon_grants_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."coupon_grants_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."coupon_grants_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."coupon_redemptions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."coupon_redemptions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."coupon_redemptions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."coupons" TO "anon";
GRANT ALL ON TABLE "public"."coupons" TO "authenticated";
GRANT ALL ON TABLE "public"."coupons" TO "service_role";



GRANT ALL ON TABLE "public"."coupon_wallet_state" TO "anon";
GRANT ALL ON TABLE "public"."coupon_wallet_state" TO "authenticated";
GRANT ALL ON TABLE "public"."coupon_wallet_state" TO "service_role";



GRANT ALL ON TABLE "public"."daily_entries" TO "anon";
GRANT ALL ON TABLE "public"."daily_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_entries" TO "service_role";



GRANT ALL ON TABLE "public"."daily_settlements" TO "anon";
GRANT ALL ON TABLE "public"."daily_settlements" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_settlements" TO "service_role";



GRANT ALL ON TABLE "public"."diagnosis_attempts" TO "anon";
GRANT ALL ON TABLE "public"."diagnosis_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."diagnosis_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."diagnosis_reports" TO "anon";
GRANT ALL ON TABLE "public"."diagnosis_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."diagnosis_reports" TO "service_role";



GRANT ALL ON TABLE "public"."faqs" TO "anon";
GRANT ALL ON TABLE "public"."faqs" TO "authenticated";
GRANT ALL ON TABLE "public"."faqs" TO "service_role";



GRANT ALL ON TABLE "public"."galleries" TO "anon";
GRANT ALL ON TABLE "public"."galleries" TO "authenticated";
GRANT ALL ON TABLE "public"."galleries" TO "service_role";



GRANT ALL ON TABLE "public"."goal_advice_cache" TO "anon";
GRANT ALL ON TABLE "public"."goal_advice_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."goal_advice_cache" TO "service_role";



GRANT ALL ON SEQUENCE "public"."goal_advice_cache_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."goal_advice_cache_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."goal_advice_cache_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."goal_daily_records" TO "anon";
GRANT ALL ON TABLE "public"."goal_daily_records" TO "authenticated";
GRANT ALL ON TABLE "public"."goal_daily_records" TO "service_role";



GRANT ALL ON SEQUENCE "public"."goal_daily_records_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."goal_daily_records_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."goal_daily_records_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."goal_direction_reports" TO "anon";
GRANT ALL ON TABLE "public"."goal_direction_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."goal_direction_reports" TO "service_role";



GRANT ALL ON SEQUENCE "public"."goal_direction_reports_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."goal_direction_reports_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."goal_direction_reports_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."goal_mentor_comments" TO "anon";
GRANT ALL ON TABLE "public"."goal_mentor_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."goal_mentor_comments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."goal_mentor_comments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."goal_mentor_comments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."goal_mentor_comments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."goal_plan_tasks" TO "anon";
GRANT ALL ON TABLE "public"."goal_plan_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."goal_plan_tasks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."goal_plan_tasks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."goal_plan_tasks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."goal_plan_tasks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."goal_probability_logs" TO "anon";
GRANT ALL ON TABLE "public"."goal_probability_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."goal_probability_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."goal_probability_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."goal_probability_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."goal_probability_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."goal_schedules" TO "anon";
GRANT ALL ON TABLE "public"."goal_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."goal_schedules" TO "service_role";



GRANT ALL ON SEQUENCE "public"."goal_schedules_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."goal_schedules_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."goal_schedules_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."goal_students" TO "anon";
GRANT ALL ON TABLE "public"."goal_students" TO "authenticated";
GRANT ALL ON TABLE "public"."goal_students" TO "service_role";



GRANT ALL ON TABLE "public"."goal_student_state" TO "anon";
GRANT ALL ON TABLE "public"."goal_student_state" TO "authenticated";
GRANT ALL ON TABLE "public"."goal_student_state" TO "service_role";



GRANT ALL ON TABLE "public"."goal_subject_targets" TO "anon";
GRANT ALL ON TABLE "public"."goal_subject_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."goal_subject_targets" TO "service_role";



GRANT ALL ON TABLE "public"."goal_timer_sessions" TO "anon";
GRANT ALL ON TABLE "public"."goal_timer_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."goal_timer_sessions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."goal_timer_sessions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."goal_timer_sessions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."goal_timer_sessions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."goal_timer_subjects" TO "anon";
GRANT ALL ON TABLE "public"."goal_timer_subjects" TO "authenticated";
GRANT ALL ON TABLE "public"."goal_timer_subjects" TO "service_role";



GRANT ALL ON TABLE "public"."goal_university_cuts" TO "anon";
GRANT ALL ON TABLE "public"."goal_university_cuts" TO "authenticated";
GRANT ALL ON TABLE "public"."goal_university_cuts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."goal_university_cuts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."goal_university_cuts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."goal_university_cuts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."goal_university_options" TO "anon";
GRANT ALL ON TABLE "public"."goal_university_options" TO "authenticated";
GRANT ALL ON TABLE "public"."goal_university_options" TO "service_role";



GRANT ALL ON TABLE "public"."goal_workbooks" TO "anon";
GRANT ALL ON TABLE "public"."goal_workbooks" TO "authenticated";
GRANT ALL ON TABLE "public"."goal_workbooks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."goal_workbooks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."goal_workbooks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."goal_workbooks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."growth_plan_items" TO "anon";
GRANT ALL ON TABLE "public"."growth_plan_items" TO "authenticated";
GRANT ALL ON TABLE "public"."growth_plan_items" TO "service_role";



GRANT UPDATE("status") ON TABLE "public"."growth_plan_items" TO "authenticated";



GRANT UPDATE("done_source_program") ON TABLE "public"."growth_plan_items" TO "authenticated";



GRANT UPDATE("done_at") ON TABLE "public"."growth_plan_items" TO "authenticated";



GRANT UPDATE("updated_at") ON TABLE "public"."growth_plan_items" TO "authenticated";



GRANT ALL ON TABLE "public"."growth_profiles" TO "anon";
GRANT ALL ON TABLE "public"."growth_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."growth_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."growth_reports" TO "anon";
GRANT ALL ON TABLE "public"."growth_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."growth_reports" TO "service_role";



GRANT ALL ON TABLE "public"."growth_uploads" TO "anon";
GRANT ALL ON TABLE "public"."growth_uploads" TO "authenticated";
GRANT ALL ON TABLE "public"."growth_uploads" TO "service_role";



GRANT ALL ON TABLE "public"."home_acceptance_cards" TO "anon";
GRANT ALL ON TABLE "public"."home_acceptance_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."home_acceptance_cards" TO "service_role";



GRANT ALL ON TABLE "public"."home_mentor_strategies" TO "anon";
GRANT ALL ON TABLE "public"."home_mentor_strategies" TO "authenticated";
GRANT ALL ON TABLE "public"."home_mentor_strategies" TO "service_role";



GRANT ALL ON TABLE "public"."home_side_banners" TO "anon";
GRANT ALL ON TABLE "public"."home_side_banners" TO "authenticated";
GRANT ALL ON TABLE "public"."home_side_banners" TO "service_role";



GRANT ALL ON TABLE "public"."identity_verifications" TO "anon";
GRANT ALL ON TABLE "public"."identity_verifications" TO "authenticated";
GRANT ALL ON TABLE "public"."identity_verifications" TO "service_role";



GRANT ALL ON TABLE "public"."inquiry_assets" TO "anon";
GRANT ALL ON TABLE "public"."inquiry_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."inquiry_assets" TO "service_role";



GRANT ALL ON TABLE "public"."inquiry_reports" TO "anon";
GRANT ALL ON TABLE "public"."inquiry_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."inquiry_reports" TO "service_role";



GRANT ALL ON TABLE "public"."inquiry_sessions" TO "anon";
GRANT ALL ON TABLE "public"."inquiry_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."inquiry_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."inquiry_submissions" TO "anon";
GRANT ALL ON TABLE "public"."inquiry_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."inquiry_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."inquiry_topics" TO "anon";
GRANT ALL ON TABLE "public"."inquiry_topics" TO "authenticated";
GRANT ALL ON TABLE "public"."inquiry_topics" TO "service_role";



GRANT ALL ON TABLE "public"."knowledge_eval_runs" TO "anon";
GRANT ALL ON TABLE "public"."knowledge_eval_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."knowledge_eval_runs" TO "service_role";



GRANT ALL ON TABLE "public"."knowledge_golden_queries" TO "anon";
GRANT ALL ON TABLE "public"."knowledge_golden_queries" TO "authenticated";
GRANT ALL ON TABLE "public"."knowledge_golden_queries" TO "service_role";



GRANT ALL ON TABLE "public"."learning_diagnosis_options" TO "anon";
GRANT ALL ON TABLE "public"."learning_diagnosis_options" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_diagnosis_options" TO "service_role";



GRANT ALL ON TABLE "public"."learning_diagnosis_programs" TO "anon";
GRANT ALL ON TABLE "public"."learning_diagnosis_programs" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_diagnosis_programs" TO "service_role";



GRANT ALL ON TABLE "public"."learning_diagnosis_questions" TO "anon";
GRANT ALL ON TABLE "public"."learning_diagnosis_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_diagnosis_questions" TO "service_role";



GRANT ALL ON TABLE "public"."learning_diagnosis_v2_survey_copy" TO "anon";
GRANT ALL ON TABLE "public"."learning_diagnosis_v2_survey_copy" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_diagnosis_v2_survey_copy" TO "service_role";



GRANT ALL ON TABLE "public"."link_code_lookups" TO "anon";
GRANT ALL ON TABLE "public"."link_code_lookups" TO "authenticated";
GRANT ALL ON TABLE "public"."link_code_lookups" TO "service_role";



GRANT ALL ON TABLE "public"."mentor_applications" TO "anon";
GRANT ALL ON TABLE "public"."mentor_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."mentor_applications" TO "service_role";



GRANT ALL ON TABLE "public"."mentor_apply_copy" TO "anon";
GRANT ALL ON TABLE "public"."mentor_apply_copy" TO "authenticated";
GRANT ALL ON TABLE "public"."mentor_apply_copy" TO "service_role";



GRANT ALL ON TABLE "public"."mentor_apply_faqs" TO "anon";
GRANT ALL ON TABLE "public"."mentor_apply_faqs" TO "authenticated";
GRANT ALL ON TABLE "public"."mentor_apply_faqs" TO "service_role";



GRANT ALL ON TABLE "public"."notices" TO "anon";
GRANT ALL ON TABLE "public"."notices" TO "authenticated";
GRANT ALL ON TABLE "public"."notices" TO "service_role";



GRANT ALL ON SEQUENCE "public"."order_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."order_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."order_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."page_contents" TO "anon";
GRANT ALL ON TABLE "public"."page_contents" TO "authenticated";
GRANT ALL ON TABLE "public"."page_contents" TO "service_role";



GRANT ALL ON TABLE "public"."parent_child_links" TO "anon";
GRANT ALL ON TABLE "public"."parent_child_links" TO "authenticated";
GRANT ALL ON TABLE "public"."parent_child_links" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."performance_attachments" TO "anon";
GRANT ALL ON TABLE "public"."performance_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."performance_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."performance_credit_ledger" TO "anon";
GRANT ALL ON TABLE "public"."performance_credit_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."performance_credit_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."performance_messages" TO "anon";
GRANT ALL ON TABLE "public"."performance_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."performance_messages" TO "service_role";



GRANT ALL ON TABLE "public"."performance_reports" TO "anon";
GRANT ALL ON TABLE "public"."performance_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."performance_reports" TO "service_role";



GRANT ALL ON TABLE "public"."performance_session_vectors" TO "anon";
GRANT ALL ON TABLE "public"."performance_session_vectors" TO "authenticated";
GRANT ALL ON TABLE "public"."performance_session_vectors" TO "service_role";



GRANT ALL ON TABLE "public"."performance_sessions" TO "anon";
GRANT ALL ON TABLE "public"."performance_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."performance_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."performance_submissions" TO "anon";
GRANT ALL ON TABLE "public"."performance_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."performance_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."performance_topics" TO "anon";
GRANT ALL ON TABLE "public"."performance_topics" TO "authenticated";
GRANT ALL ON TABLE "public"."performance_topics" TO "service_role";



GRANT ALL ON TABLE "public"."phone_verifications" TO "anon";
GRANT ALL ON TABLE "public"."phone_verifications" TO "authenticated";
GRANT ALL ON TABLE "public"."phone_verifications" TO "service_role";



GRANT ALL ON TABLE "public"."popups" TO "anon";
GRANT ALL ON TABLE "public"."popups" TO "authenticated";
GRANT ALL ON TABLE "public"."popups" TO "service_role";



GRANT ALL ON TABLE "public"."premium_book_pages" TO "anon";
GRANT ALL ON TABLE "public"."premium_book_pages" TO "authenticated";
GRANT ALL ON TABLE "public"."premium_book_pages" TO "service_role";



GRANT ALL ON SEQUENCE "public"."premium_book_pages_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."premium_book_pages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."premium_book_pages_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."premium_consult_requests" TO "anon";
GRANT ALL ON TABLE "public"."premium_consult_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."premium_consult_requests" TO "service_role";



GRANT ALL ON SEQUENCE "public"."premium_consult_requests_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."premium_consult_requests_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."premium_consult_requests_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."program_access" TO "anon";
GRANT ALL ON TABLE "public"."program_access" TO "authenticated";
GRANT ALL ON TABLE "public"."program_access" TO "service_role";



GRANT ALL ON TABLE "public"."program_access_grants" TO "anon";
GRANT ALL ON TABLE "public"."program_access_grants" TO "authenticated";
GRANT ALL ON TABLE "public"."program_access_grants" TO "service_role";



GRANT ALL ON TABLE "public"."program_categories" TO "anon";
GRANT ALL ON TABLE "public"."program_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."program_categories" TO "service_role";



GRANT ALL ON TABLE "public"."programs" TO "anon";
GRANT ALL ON TABLE "public"."programs" TO "authenticated";
GRANT ALL ON TABLE "public"."programs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."refund_requests_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."refund_requests_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."refund_requests_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."refunds" TO "anon";
GRANT ALL ON TABLE "public"."refunds" TO "authenticated";
GRANT ALL ON TABLE "public"."refunds" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON SEQUENCE "public"."reviews_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."reviews_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."reviews_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."selfeval_reports" TO "anon";
GRANT ALL ON TABLE "public"."selfeval_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."selfeval_reports" TO "service_role";



GRANT ALL ON TABLE "public"."selfeval_session_activities" TO "anon";
GRANT ALL ON TABLE "public"."selfeval_session_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."selfeval_session_activities" TO "service_role";



GRANT ALL ON TABLE "public"."selfeval_sessions" TO "anon";
GRANT ALL ON TABLE "public"."selfeval_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."selfeval_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";



GRANT ALL ON SEQUENCE "public"."services_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."services_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."services_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."special_highschool_acceptance_rates" TO "anon";
GRANT ALL ON TABLE "public"."special_highschool_acceptance_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."special_highschool_acceptance_rates" TO "service_role";



GRANT ALL ON TABLE "public"."special_highschool_cases" TO "anon";
GRANT ALL ON TABLE "public"."special_highschool_cases" TO "authenticated";
GRANT ALL ON TABLE "public"."special_highschool_cases" TO "service_role";



GRANT ALL ON TABLE "public"."sso_tickets" TO "anon";
GRANT ALL ON TABLE "public"."sso_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."sso_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."student_link_codes" TO "anon";
GRANT ALL ON TABLE "public"."student_link_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."student_link_codes" TO "service_role";



GRANT ALL ON TABLE "public"."student_profiles" TO "anon";
GRANT ALL ON TABLE "public"."student_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."student_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_code_attempts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tenant_code_attempts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tenant_code_attempts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tenant_code_attempts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."terms" TO "anon";
GRANT ALL ON TABLE "public"."terms" TO "authenticated";
GRANT ALL ON TABLE "public"."terms" TO "service_role";



GRANT ALL ON TABLE "public"."trending_departments" TO "anon";
GRANT ALL ON TABLE "public"."trending_departments" TO "authenticated";
GRANT ALL ON TABLE "public"."trending_departments" TO "service_role";



GRANT ALL ON TABLE "public"."university_acceptances" TO "anon";
GRANT ALL ON TABLE "public"."university_acceptances" TO "authenticated";
GRANT ALL ON TABLE "public"."university_acceptances" TO "service_role";



GRANT ALL ON TABLE "public"."usage_status" TO "anon";
GRANT ALL ON TABLE "public"."usage_status" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_status" TO "service_role";



GRANT ALL ON TABLE "public"."user_term_agreements" TO "anon";
GRANT ALL ON TABLE "public"."user_term_agreements" TO "authenticated";
GRANT ALL ON TABLE "public"."user_term_agreements" TO "service_role";



GRANT ALL ON TABLE "public"."v_performance_saved_reports" TO "anon";
GRANT ALL ON TABLE "public"."v_performance_saved_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."v_performance_saved_reports" TO "service_role";



GRANT ALL ON TABLE "public"."winning_assessment_knowledge_items" TO "anon";
GRANT ALL ON TABLE "public"."winning_assessment_knowledge_items" TO "authenticated";
GRANT ALL ON TABLE "public"."winning_assessment_knowledge_items" TO "service_role";



GRANT ALL ON TABLE "public"."winning_base_data" TO "anon";
GRANT ALL ON TABLE "public"."winning_base_data" TO "authenticated";
GRANT ALL ON TABLE "public"."winning_base_data" TO "service_role";



GRANT ALL ON TABLE "public"."winning_db_inputs" TO "anon";
GRANT ALL ON TABLE "public"."winning_db_inputs" TO "authenticated";
GRANT ALL ON TABLE "public"."winning_db_inputs" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































--
-- Dumped schema changes for auth and storage
--

CREATE POLICY "banners bucket admin delete" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'banners'::"text") AND "public"."is_winning_admin"()));



CREATE POLICY "banners bucket admin insert" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'banners'::"text") AND "public"."is_winning_admin"()));



CREATE POLICY "banners bucket admin update" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'banners'::"text") AND "public"."is_winning_admin"())) WITH CHECK ((("bucket_id" = 'banners'::"text") AND "public"."is_winning_admin"()));



CREATE POLICY "banners bucket public read" ON "storage"."objects" FOR SELECT TO "authenticated", "anon" USING (("bucket_id" = 'banners'::"text"));



CREATE POLICY "mentor proof admin read" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'mentor-applications'::"text") AND "public"."is_winning_admin"()));



CREATE POLICY "performance guides owner read" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'performance-guides'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



