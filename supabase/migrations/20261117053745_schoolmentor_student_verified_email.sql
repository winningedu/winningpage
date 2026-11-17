-- 스쿨멘토 학생은 아이디 없이 인증된 이메일로 가입하고 로그인한다.
-- 1) fn_student_signup: 시그니처는 그대로 둔다(grant 유지). p_username 과 p_email 은 무시하고,
--    이메일은 auth.users 의 인증 완료(email_confirmed_at) 계정 것을 소문자로 정리해 저장한다. 미인증이면 email_not_verified.
--    학생 profiles.username 은 null. 같은 계정의 동시 호출은 advisory 잠금으로 줄을 선다.
-- 2) fn_login_resolve_email: 교사(member_type = 'teacher')만 아이디로 합성 이메일을 돌려준다. 그 밖의 계정은 null.

create or replace function public.fn_student_signup(
  p_user_id uuid,
  p_username text,
  p_name text,
  p_email text,
  p_phone text,
  p_birth_date date,
  p_gender text,
  p_tenant_id uuid,
  p_grade text,
  p_group_name text,
  p_class_name text,
  p_number smallint,
  p_guardian_name text,
  p_guardian_phone text,
  p_guardian_relation text,
  p_guardian_consent boolean,
  p_identity_request_id text,
  p_agree_service boolean,
  p_agree_privacy boolean,
  p_agree_db_transfer boolean,
  p_agree_marketing boolean
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_email text;
  v_email_confirmed_at timestamptz;
  v_phone text := btrim(coalesce(p_phone, ''));
  v_gender text := nullif(btrim(coalesce(p_gender, '')), '');
  v_phone_digits text;
  v_tenant public.tenants;
  v_pv_id uuid;
  v_gpv_id uuid;
  v_guardian_phone text := btrim(coalesce(p_guardian_phone, ''));
  v_guardian_digits text;
  v_guardian_relation text := nullif(btrim(coalesce(p_guardian_relation, '')), '');
  v_link_code text;
  v_signup_enabled boolean;
  v_member_type text;
  v_birth_date date := p_birth_date;
  v_identity_rid text := btrim(coalesce(p_identity_request_id, ''));
  v_iv_id uuid;
  v_iv_purpose text;
  v_iv_under14 boolean;
  v_iv_mobile text;
  v_under14 boolean := false;
  v_constraint text;
begin
  -- 같은 계정의 동시 호출을 가장 먼저 줄 세운다. 두 번째 호출은 첫 호출이 끝난 뒤 아래 already_signed_up 에 걸린다.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- 가입 on/off 게이트(complete_signup_profile 과 같다). 설정 행이 없으면 닫는다(폴백으로 열지 않는다).
  select ((s.value #>> '{}')::boolean) into v_signup_enabled
    from public.app_settings s where s.key = 'signup_enabled';
  if not coalesce(v_signup_enabled, false) then
    raise exception 'signup_disabled' using errcode = 'WC074';
  end if;

  -- 이메일은 인증 코드를 마친 auth 계정의 것만 쓴다. p_email 과 p_username 은 받기만 하고 무시한다(옛 호출과의 호환).
  select lower(btrim(coalesce(u.email, ''))), u.email_confirmed_at
    into v_email, v_email_confirmed_at
    from auth.users u where u.id = p_user_id;
  if not found then
    raise exception 'user_not_found';
  end if;
  if v_email_confirmed_at is null then
    raise exception 'email_not_verified';
  end if;

  -- 같은 계정의 동시 호출을 줄 세우고, 이미 가입을 끝낸 계정은 다시 쓰지 못하게 한다.
  select pr.member_type into v_member_type from public.profiles pr where pr.id = p_user_id for update;
  if v_member_type is not null then
    raise exception 'already_signed_up';
  end if;

  if v_name = '' then
    raise exception 'name_required';
  end if;
  if v_email = '' then
    raise exception 'email_required';
  end if;
  if nullif(btrim(coalesce(p_grade, '')), '') is null then
    raise exception 'grade_required';
  end if;
  if coalesce(p_agree_service, false) is not true then
    raise exception 'terms_service_required';
  end if;
  if coalesce(p_agree_privacy, false) is not true then
    raise exception 'privacy_required';
  end if;
  if coalesce(p_agree_db_transfer, false) is not true then
    raise exception 'db_transfer_required';
  end if;

  if v_gender is not null and v_gender not in ('남', '여') then
    raise exception 'invalid_gender';
  end if;

  -- 만 14세 미만: PASS 본인확인(under14_guardian)은 법정대리인(성인)의 것이다. 학생의 생년월일과 성별은 폼 값을 그대로 쓰고,
  -- PASS 에서는 학부모 번호만 받는다. 행을 잠가 같은 본인확인으로 두 계정이 만들어지지 않게 한다.
  if v_identity_rid <> '' then
    select iv.id, iv.purpose, iv.is_under14, iv.mobile
      into v_iv_id, v_iv_purpose, v_iv_under14, v_iv_mobile
      from public.identity_verifications iv
     where iv.request_id = v_identity_rid
       and iv.status = 'verified'
       and iv.consumed_at is null
       and iv.verified_at > now() - interval '30 minutes'
     limit 1
       for update;

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
    v_guardian_phone := coalesce(nullif(regexp_replace(coalesce(v_iv_mobile, ''), '[^0-9]', '', 'g'), ''), v_guardian_phone);
  end if;

  -- 생년월일과 성별은 14세 미만도 필수다.
  if v_birth_date is null then
    raise exception 'birth_date_required';
  end if;
  if v_gender is null then
    raise exception 'gender_required';
  end if;
  -- 만 14세 미만(KST 오늘 기준 만 나이)인데 본인확인이 없으면 거부한다.
  if not v_under14 and extract(year from age((now() at time zone 'Asia/Seoul')::date, v_birth_date)) < 14 then
    raise exception 'identity_not_verified';
  end if;

  if exists (select 1 from public.profiles pr where lower(btrim(pr.email)) = v_email and pr.id <> p_user_id) then
    raise exception 'duplicate_email';
  end if;

  -- 본인 번호는 14세 이상 필수, 14세 미만은 선택이다(결정 72).
  v_phone_digits := regexp_replace(v_phone, '[^0-9]', '', 'g');
  if v_phone_digits = '' and not v_under14 then
    raise exception 'phone_required';
  end if;

  if v_guardian_relation is not null and v_guardian_relation not in ('아버지', '어머니', '기타') then
    raise exception 'invalid_guardian_relation';
  end if;

  -- 학부모 번호 표기를 complete_signup_profile 과 같은 하이픈 형식으로 맞춘다(아이디 찾기가 같은 열을 읽는다).
  v_guardian_digits := regexp_replace(v_guardian_phone, '[^0-9]', '', 'g');
  v_guardian_phone := case
    when v_guardian_digits = '' then ''
    when length(v_guardian_digits) = 11 then
      substr(v_guardian_digits, 1, 3) || '-' || substr(v_guardian_digits, 4, 4) || '-' || substr(v_guardian_digits, 8, 4)
    when length(v_guardian_digits) = 10 then
      substr(v_guardian_digits, 1, 3) || '-' || substr(v_guardian_digits, 4, 3) || '-' || substr(v_guardian_digits, 7, 4)
    else v_guardian_phone
  end;

  if v_under14 then
    if v_guardian_digits = '' then
      raise exception 'guardian_phone_required';
    end if;
    if coalesce(p_guardian_consent, false) is not true then
      raise exception 'guardian_consent_required';
    end if;
  end if;

  -- 소속: 코드를 모르면 null 로 보내 기타 기관에 둔다. 기타 기관은 반과 번호를 받지 않는다(결정 r4).
  if p_tenant_id is null then
    select * into v_tenant from public.tenants t where t.is_catch_all;
  else
    select * into v_tenant from public.tenants t where t.id = p_tenant_id;
  end if;
  if v_tenant.id is null then
    raise exception 'tenant_not_found' using errcode = 'WC097';
  end if;

  -- 본인 번호 문자 인증(가입 목적, 10분 안, 아직 안 쓴 것). 행 잠금 아래에서 소비한다.
  if v_phone_digits <> '' then
    select v.id into v_pv_id
      from public.phone_verifications v
     where v.phone = v_phone_digits
       and v.purpose = 'signup'
       and v.verified_at is not null
       and v.consumed_at is null
       and v.verified_at > now() - interval '10 minutes'
     order by v.verified_at desc
     limit 1
       for update;

    if v_pv_id is null then
      raise exception 'phone_not_verified';
    end if;
  end if;

  -- 14세 이상이 학부모 번호를 넣었으면 학부모 문자 인증(guardian_signup)도 같은 규칙으로 확인한다.
  -- 14세 미만의 학부모 번호는 PASS 로 이미 확인됐다. 학부모 번호는 유일성 검사를 하지 않는다(형제 공유).
  if v_guardian_digits <> '' and not v_under14 then
    select v.id into v_gpv_id
      from public.phone_verifications v
     where v.phone = v_guardian_digits
       and v.purpose = 'guardian_signup'
       and v.verified_at is not null
       and v.consumed_at is null
       and v.verified_at > now() - interval '10 minutes'
     order by v.verified_at desc
     limit 1
       for update;
    if v_gpv_id is null then
      raise exception 'guardian_phone_not_verified';
    end if;
  end if;

  -- 번호 유일성은 기관 안에서만 본다(profiles_tenant_phone_unique_idx 와 같은 기준). 동시 가입은 아래 unique_violation 이 받는다.
  if v_phone_digits <> '' and exists (
    select 1 from public.profiles pr
     where pr.id <> p_user_id
       and pr.member_type is not null
       and pr.tenant_id = v_tenant.id
       and regexp_replace(coalesce(pr.phone, ''), '[^0-9]', '', 'g') = v_phone_digits
  ) then
    raise exception 'phone_taken' using errcode = 'WC096';
  end if;

  perform set_config('app.tenant_set_via_rpc', '1', true);

  -- 동시 가입이 사전 검사를 같이 통과해도 유일 인덱스가 하나만 통과시킨다. 어느 인덱스인지에 따라 오류를 나눈다.
  begin
    insert into public.profiles (
      id, name, username, phone, email, school_name, member_type, role,
      terms_service_agreed, privacy_required_agreed, marketing_agreed,
      birth_date, gender, tenant_id, updated_at,
      guardian_name, guardian_phone, guardian_relation, guardian_consent, guardian_phone_verified_at
    ) values (
      p_user_id, v_name, null, nullif(v_phone, ''), v_email,
      case when v_tenant.org_type = '학교' then v_tenant.name end, 'student', 'user',
      coalesce(p_agree_service, false), coalesce(p_agree_privacy, false), coalesce(p_agree_marketing, false),
      v_birth_date, v_gender, v_tenant.id, now(),
      nullif(btrim(coalesce(p_guardian_name, '')), ''), nullif(v_guardian_phone, ''), v_guardian_relation,
      coalesce(p_guardian_consent, false), case when v_gpv_id is not null then now() end
    )
    on conflict (id) do update set
      name = excluded.name, username = excluded.username, phone = excluded.phone, email = excluded.email,
      school_name = excluded.school_name, member_type = excluded.member_type,
      terms_service_agreed = excluded.terms_service_agreed,
      privacy_required_agreed = excluded.privacy_required_agreed,
      marketing_agreed = excluded.marketing_agreed,
      birth_date = excluded.birth_date, gender = excluded.gender, tenant_id = excluded.tenant_id,
      guardian_name = excluded.guardian_name, guardian_phone = excluded.guardian_phone,
      guardian_relation = excluded.guardian_relation, guardian_consent = excluded.guardian_consent,
      guardian_phone_verified_at = excluded.guardian_phone_verified_at,
      updated_at = now();
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'profiles_tenant_phone_unique_idx' then
      raise exception 'phone_taken' using errcode = 'WC096';
    elsif v_constraint = 'profiles_email_unique_idx' then
      raise exception 'duplicate_email';
    end if;
    raise;
  end;

  update public.phone_verifications set consumed_at = now()
   where id in (v_pv_id, v_gpv_id) and consumed_at is null;

  -- 본인확인도 같은 원칙으로 소비하고 새 계정과 잇는다(가입 전 인증이라 그 시점엔 계정이 없었다).
  if v_iv_id is not null then
    update public.identity_verifications set consumed_at = now(), user_id = p_user_id where id = v_iv_id;
  end if;

  insert into public.student_profiles (profile_id, grade) values (p_user_id, p_grade)
  on conflict (profile_id) do update set grade = excluded.grade, updated_at = now();

  insert into public.user_term_agreements (user_id, term_id, agreed)
  select p_user_id, t.id,
    case t.code
      when 'student_service' then coalesce(p_agree_service, false)
      when 'student_privacy' then coalesce(p_agree_privacy, false)
      when 'student_db_transfer' then coalesce(p_agree_db_transfer, false)
      when 'student_marketing' then coalesce(p_agree_marketing, false)
    end
    from public.terms t
   where t.is_active
     and t.code in ('student_service', 'student_privacy', 'student_db_transfer', 'student_marketing')
  on conflict (user_id, term_id) do update set agreed = excluded.agreed, agreed_at = now();

  v_link_code := public.issue_student_link_code(p_user_id);

  perform public.fn_enrollment_join(
    p_user_id, v_tenant.id, p_grade,
    case when v_tenant.is_catch_all then null else p_group_name end,
    case when v_tenant.is_catch_all then null else p_class_name end,
    case when v_tenant.is_catch_all then null else p_number end);

  return jsonb_build_object(
    'ok', true,
    'id', p_user_id,
    'email', v_email,
    'under14', v_under14,
    'tenant_id', v_tenant.id,
    'tenant_name', v_tenant.name,
    'link_code', v_link_code
  );
end;
$$;

-- 합성 도메인(teacher.schoolmentor.kr)은 api/_lib/auth/login.ts 의 SYNTHETIC_DOMAIN 과 같아야 한다.
create or replace function public.fn_login_resolve_email(p_username text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select lower(btrim(p.username)) || '@teacher.schoolmentor.kr'
    from public.profiles p
   where p.member_type = 'teacher'
     and p.username is not null
     and btrim(p.username) <> ''
     and lower(btrim(p.username)) = lower(btrim(p_username))
$$;
