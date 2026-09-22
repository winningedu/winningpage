-- 가입 on/off 게이트 — S(스쿨멘토)는 당분간 가입을 막고, W(위닝에듀)는 그대로
-- 열어둔다. 토글은 app_settings(key='signup_enabled')이고 사이트별 값은
-- scripts/seed-prod-from-dev.mjs --site=<site> 가 배포 시 오버라이드한다
-- (기본값은 여기서 true 로 심어 W 쪽이 별도 시드 없이도 동작하게 한다).
--
-- 원칙 — complete_signup_profile 은 20260922002939_tenant_id_functions_
-- rewrite.sql 의 최신 정의를 통째로 복사한 뒤 최소 치환만 했다: 선언부에
-- v_signup_enabled 를 추가하고, 인증 확인(v_user_id is null 체크) 직후·다른
-- 검증보다 먼저 signup_enabled 게이트(WC074)를 끼워 넣었다. 그 외 시그니처·
-- 본문·코멘트·GRANT/REVOKE 는 원문 그대로다.

insert into public.app_settings (key, value)
values ('signup_enabled', 'true'::jsonb)
on conflict (key) do nothing;

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

comment on function public.complete_signup_profile(
  "text", "text", "text", "text", "text", "text", "text", "text",
  boolean, boolean, boolean, boolean, boolean, boolean,
  "text", boolean, "text", "date", "text", "text"
) is
  '회원가입 프로필 완성 RPC(20260903041457 학생/학부모 번호 분기 최신본 기준). 2026-09-22 — p_org_code(파라미터명 유지)는 이제 8자 tenant 코드로 해석된다: fn_resolve_tenant_code 로 정규화·조회하고(레이트리밋 WC068은 그 함수가 던지고, 못 찾으면 NULL 을 돌려준다) profiles.tenant_id 에 저장한다(org_code 컬럼에는 더 이상 쓰지 않는다). app_settings.require_tenant_on_signup 이 true 인데 코드가 없거나 못 찾으면 WC073(필수가 아니면 잘못된 코드는 무시). fn_profiles_lock_tenant(20260922) 트리거를 통과시키려고 upsert 직전 app.tenant_set_via_rpc 를 켠다. 나머지(학생 본인 번호 없을 시 guardian_phone 정본화, 14세 미만 PASS 본인확인, 전화번호 인증·중복 검사 등)는 원문 그대로다. 2026-09-22 — app_settings.signup_enabled 이 false(또는 미설정)면 다른 검증보다 먼저 WC074(signup_disabled)로 막는다(S 사이트 가입 차단용, 폴백 없이 기본 차단).';

REVOKE ALL ON FUNCTION "public"."complete_signup_profile"("p_name" "text", "p_username" "text", "p_phone" "text", "p_email" "text", "p_region" "text", "p_school_type" "text", "p_school_name" "text", "p_member_type" "text", "p_terms_service_agreed" boolean, "p_privacy_required_agreed" boolean, "p_identity_required_agreed" boolean, "p_privacy_optional_agreed" boolean, "p_marketing_agreed" boolean, "p_ads_agreed" boolean, "p_guardian_phone" "text", "p_guardian_consent" boolean, "p_identity_request_id" "text", "p_birth_date" "date", "p_gender" "text", "p_org_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_signup_profile"("p_name" "text", "p_username" "text", "p_phone" "text", "p_email" "text", "p_region" "text", "p_school_type" "text", "p_school_name" "text", "p_member_type" "text", "p_terms_service_agreed" boolean, "p_privacy_required_agreed" boolean, "p_identity_required_agreed" boolean, "p_privacy_optional_agreed" boolean, "p_marketing_agreed" boolean, "p_ads_agreed" boolean, "p_guardian_phone" "text", "p_guardian_consent" boolean, "p_identity_request_id" "text", "p_birth_date" "date", "p_gender" "text", "p_org_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_signup_profile"("p_name" "text", "p_username" "text", "p_phone" "text", "p_email" "text", "p_region" "text", "p_school_type" "text", "p_school_name" "text", "p_member_type" "text", "p_terms_service_agreed" boolean, "p_privacy_required_agreed" boolean, "p_identity_required_agreed" boolean, "p_privacy_optional_agreed" boolean, "p_marketing_agreed" boolean, "p_ads_agreed" boolean, "p_guardian_phone" "text", "p_guardian_consent" boolean, "p_identity_request_id" "text", "p_birth_date" "date", "p_gender" "text", "p_org_code" "text") TO "service_role";
