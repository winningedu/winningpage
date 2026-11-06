-- 스쿨멘토 학생 가입(소속코드 가입, 계정 생성 전 소속 조회, 가입 확정 함수).
-- 새 컬럼은 모두 NULL 허용이고 새 함수는 service_role 만 부르며 기존 가입 경로(complete_signup_profile)는 바꾸지 않는다.
-- 위닝 사이트는 행을 쓰지 않으므로 동작이 그대로다.

-- 1) 전화번호 유일성을 기관(tenant) 안으로 좁힌다.
-- 같은 번호가 다른 기관에 있을 수 있다(결정 r8). 소속 없는 계정끼리는 NULL 을 같은 값으로 보아 전체에서 하나만 허용한다.
-- 기존 행은 숫자 기준 전역 유일이므로 (tenant, 숫자) 기준으로도 위반이 없다.
-- 이름에 phone 을 유지한다: StudentForm 이 'duplicate key' 와 'phone' 을 함께 보고 안내 문구를 고른다.
create unique index profiles_tenant_phone_unique_idx
  on public.profiles (tenant_id, regexp_replace(phone, '[^0-9]', '', 'g')) nulls not distinct
  where member_type is not null
    and phone is not null
    and regexp_replace(phone, '[^0-9]', '', 'g') <> '';

drop index public.profiles_phone_unique_idx;

comment on index public.profiles_tenant_phone_unique_idx is '가입 완료 계정의 전화번호(숫자만)는 기관 안에서 유일하다. tenant_id 가 NULL 인 계정끼리는 전체에서 유일하다(NULLS NOT DISTINCT).';

-- 2) 학부모 정보(선택 입력). 모두 NULL 허용이고 기존 행은 그대로다.
alter table public.profiles
  add column guardian_name text,
  add column guardian_relation text,
  add column guardian_phone_verified_at timestamptz,
  add constraint profiles_guardian_relation_check check (guardian_relation in ('아버지', '어머니', '기타'));

comment on column public.profiles.guardian_name is '학부모 이름(스쿨멘토 가입 4단계, 선택).';
comment on column public.profiles.guardian_relation is '학부모 관계(아버지, 어머니, 기타).';
comment on column public.profiles.guardian_phone_verified_at is '학부모 휴대폰 SMS 인증을 통과한 시각. 14세 미만 PASS 번호는 비운다.';

-- 3) 소속코드 시도 기록을 계정 없이 ip 로도 남긴다. 가입 전에는 계정이 없다.
-- 기존 행은 모두 user_id 가 있어 check 를 만족한다.
alter table public.tenant_code_attempts
  alter column user_id drop not null,
  add column ip text,
  add constraint tenant_code_attempts_actor_check check (user_id is not null or ip is not null);

create index tenant_code_attempts_ip_attempted_at_idx on public.tenant_code_attempts (ip, attempted_at);

-- 4) 계정 만들기 전 소속코드 조회. fn_resolve_tenant_code 는 로그인한 사용자(auth.uid)가 있어야 해서 따로 둔다.
-- 같은 ip 의 최근 1시간 실패가 10회 이상이면 WC068(맞는 코드도 막는다). 못 찾으면 실패 기록을 남기고 0행을 돌려준다.
-- raise 하지 않는 이유는 fn_resolve_tenant_code 와 같다: 예외로 끝나면 기록 insert 가 같이 롤백돼 제한이 무력화된다.
-- id, name, org_type 만 돌려주고 tier 같은 내부 컬럼은 내보내지 않는다.
create function public.fn_signup_tenant_lookup(p_code text, p_ip text)
returns table (id uuid, name text, org_type text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ip text := nullif(btrim(p_ip), '');
  v_code text;
  v_failures integer;
  v_tenant public.tenants;
begin
  if v_ip is null then
    raise exception 'ip required' using errcode = '22023';
  end if;

  -- 1시간 지난 기록은 판정 재료가 아니므로 이 ip 것만 이 기회에 지운다.
  delete from public.tenant_code_attempts a
   where a.ip = v_ip and a.attempted_at <= now() - interval '1 hour';

  select count(*) into v_failures from public.tenant_code_attempts a where a.ip = v_ip;
  if v_failures >= 10 then
    raise exception 'tenant_code_attempts_exceeded' using errcode = 'WC068';
  end if;

  v_code := public.fn_normalize_tenant_code(p_code);
  select * into v_tenant from public.tenants t where t.code = v_code;

  if v_tenant.id is null then
    insert into public.tenant_code_attempts (ip) values (v_ip);
    return;
  end if;

  return query select v_tenant.id, v_tenant.name, v_tenant.org_type;
end;
$$;

revoke all on function public.fn_signup_tenant_lookup(text, text) from public, anon, authenticated;
grant execute on function public.fn_signup_tenant_lookup(text, text) to service_role;

comment on function public.fn_signup_tenant_lookup(text, text) is '계정 만들기 전 소속코드 조회(service_role 전용). ip 당 1시간 실패 10회면 WC068. 못 찾으면 실패 기록을 남기고 0행(raise 하지 않는다). ip 가 비면 22023.';

-- 5) 스쿨멘토 학생 가입 확정. API 가 auth.admin.createUser 로 계정을 만든 뒤 한 트랜잭션으로 부른다.
-- complete_signup_profile 과 달리 로그인 세션(auth.uid)이 필요 없고 위닝 전용 필수값(지역, 학교 유형)이 없다.
-- 어느 단계든 예외로 끝나면 이 호출의 쓰기가 전부 롤백된다(문자 인증도 소비되지 않는다).
create function public.fn_student_signup(
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
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
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
  v_iv_birth_date date;
  v_iv_gender text;
  v_iv_mobile text;
  v_under14 boolean := false;
  v_constraint text;
begin
  -- 가입 on/off 게이트(complete_signup_profile 과 같다). 설정 행이 없으면 닫는다(폴백으로 열지 않는다).
  select ((s.value #>> '{}')::boolean) into v_signup_enabled
    from public.app_settings s where s.key = 'signup_enabled';
  if not coalesce(v_signup_enabled, false) then
    raise exception 'signup_disabled' using errcode = 'WC074';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'user_not_found';
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

  -- 결정 70: 영문 소문자와 숫자 4~20자(@ 불가).
  if v_username !~ '^[a-z0-9]{4,20}$' then
    raise exception 'username_invalid';
  end if;
  if not public.is_username_available(v_username) then
    raise exception 'username_taken' using errcode = 'WC095';
  end if;

  if v_gender is not null and v_gender not in ('남', '여') then
    raise exception 'invalid_gender';
  end if;

  -- 만 14세 미만: PASS 본인확인(under14_guardian)이 생년월일, 성별, 학부모 번호의 정본이다(complete_signup_profile 과 같다).
  -- 행을 잠가 같은 본인확인으로 두 계정이 만들어지지 않게 한다.
  if v_identity_rid <> '' then
    select iv.id, iv.purpose, iv.is_under14, iv.birth_date, iv.gender, iv.mobile
      into v_iv_id, v_iv_purpose, v_iv_under14, v_iv_birth_date, v_iv_gender, v_iv_mobile
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
    v_birth_date := v_iv_birth_date;
    -- NICE 성별코드: 홀수(1/3/5/7)는 남, 짝수 계열(0/2/4/6/8)은 여, 그 밖의 값은 null.
    v_gender := case
      when v_iv_gender in ('1', '3', '5', '7') then '남'
      when v_iv_gender in ('0', '2', '4', '6', '8') then '여'
      else null
    end;
    v_guardian_phone := coalesce(nullif(regexp_replace(coalesce(v_iv_mobile, ''), '[^0-9]', '', 'g'), ''), v_guardian_phone);
  end if;

  -- 14세 이상은 생년월일과 성별이 필수다.
  if not v_under14 then
    if v_birth_date is null then
      raise exception 'birth_date_required';
    end if;
    if v_gender is null then
      raise exception 'gender_required';
    end if;
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
      p_user_id, v_name, v_username, nullif(v_phone, ''), v_email,
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
    if v_constraint = 'profiles_username_unique_idx' then
      raise exception 'username_taken' using errcode = 'WC095';
    elsif v_constraint = 'profiles_tenant_phone_unique_idx' then
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
    'username', v_username,
    'email', v_email,
    'under14', v_under14,
    'tenant_id', v_tenant.id,
    'tenant_name', v_tenant.name,
    'link_code', v_link_code
  );
end;
$$;

revoke all on function public.fn_student_signup(uuid, text, text, text, text, date, text, uuid, text, text, text, smallint, text, text, text, boolean, text, boolean, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.fn_student_signup(uuid, text, text, text, text, date, text, uuid, text, text, text, smallint, text, text, text, boolean, text, boolean, boolean, boolean, boolean) to service_role;
