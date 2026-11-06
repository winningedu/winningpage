-- =====================================================================
-- 스쿨멘토 학생 가입: 기관별 전화번호 유일성, 소속코드 사전 조회, 가입 함수 SQL 스펙
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-school-signup.spec.sql
--
-- 전체가 한 트랜잭션이고 마지막에 ROLLBACK 한다. 어떤 데이터도 남기지
-- 않는다. 단언 실패는 예외로 터져 psql 이 비정상 종료(ON_ERROR_STOP)한다.
-- =====================================================================
begin;

create function pg_temp.expect_ok(t text, p_sql text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise notice '[PASS] % 성공', t;
end $$;

-- 주어진 SQL 이 want 로 지정한 SQLSTATE 로 실패하는지 단언한다.
create function pg_temp.expect_error(t text, p_sql text, want text) returns void
language plpgsql as $$
declare
  v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state is distinct from want then
      raise exception '[FAIL] %: sqlstate %, want %', t, v_state, want;
    end if;
    raise notice '[PASS] % = %', t, want;
    return;
  end;
  raise exception '[FAIL] %: 예외가 나지 않았다, want %', t, want;
end $$;

create function pg_temp.expect_text(t text, got text, want text) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '[FAIL] %: got %, want %', t, got, want;
  end if;
  raise notice '[PASS] % = %', t, want;
end $$;

create function pg_temp.expect_int(t text, got bigint, want bigint) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '[FAIL] %: got %, want %', t, got, want;
  end if;
  raise notice '[PASS] % = %', t, want;
end $$;

create function pg_temp.expect_bool(t text, got boolean, want boolean) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '[FAIL] %: got %, want %', t, got, want;
  end if;
  raise notice '[PASS] % = %', t, want;
end $$;

-- 이미 있는 기타 기관은 이 스펙 안에서만 내려, 스펙이 만든 기타 기관과 겹치지 않게 한다.
update public.tenants set is_catch_all = false where is_catch_all;

-- 기관(code 8자 고정 형식 중 앞 2자를 바꿔 쓴다)
create function pg_temp.mk_tenant(p_code text, p_org_type text default '학교') returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.tenants (code, name, region, org_type, tier)
  values (p_code, p_code || ' 기관', '서울', p_org_type, 'A')
  returning id into v_id;
  return v_id;
end $$;

create function pg_temp.mk_profile(p_tenant uuid, p_phone text) returns uuid
language plpgsql as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role)
  values (v_id, 'au-' || v_id || '@example.com', 'authenticated', 'authenticated');
  insert into public.profiles (id, role, member_type, name, phone, tenant_id)
  values (v_id, 'user', 'student', 'x', p_phone, p_tenant);
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 전화번호 유일성은 기관 안에서만 본다(소속 없음끼리는 전체에서 하나)
-- ---------------------------------------------------------------------
select pg_temp.mk_tenant('SA222222');
select pg_temp.mk_tenant('SB222222');

select pg_temp.expect_ok('같은 번호가 다른 기관에 각각 있을 수 있다', $$
  select pg_temp.mk_profile((select id from public.tenants where code = 'SA222222'), '010-1111-2222'),
         pg_temp.mk_profile((select id from public.tenants where code = 'SB222222'), '010-1111-2222')
$$);
select pg_temp.expect_error('같은 기관 안에서 같은 번호는 23505', $$
  select pg_temp.mk_profile((select id from public.tenants where code = 'SA222222'), '010-1111-2222')
$$, '23505');
select pg_temp.expect_error('숫자만 비교한다(하이픈 유무가 달라도 같은 번호)', $$
  select pg_temp.mk_profile((select id from public.tenants where code = 'SA222222'), '01011112222')
$$, '23505');
select pg_temp.expect_ok('소속 없는 번호는 기관 번호와 다른 키', $$
  select pg_temp.mk_profile(null, '010-1111-2222')
$$);
select pg_temp.expect_error('소속 없는 계정끼리 같은 번호는 23505(NULL 도 같은 값으로 본다)', $$
  select pg_temp.mk_profile(null, '010-1111-2222')
$$, '23505');
select pg_temp.expect_bool('옛 전역 인덱스는 없다',
  to_regclass('public.profiles_phone_unique_idx') is null, true);
select pg_temp.expect_bool('새 인덱스 이름에 phone 이 들어 있다(StudentForm 이 duplicate key + phone 으로 안내를 고른다)',
  to_regclass('public.profiles_tenant_phone_unique_idx') is not null, true);

-- ---------------------------------------------------------------------
-- 학부모 정보 컬럼: 모두 NULL 허용, 관계는 정해진 값만
-- ---------------------------------------------------------------------
select pg_temp.expect_ok('학부모 컬럼은 비워 둔 채 행을 만들 수 있다', $$
  select pg_temp.mk_profile(null, '010-3000-0001')
$$);
select pg_temp.expect_ok('학부모 이름, 관계, 인증 시각을 저장할 수 있다', $$
  update public.profiles set guardian_name = '김보호', guardian_relation = '어머니',
    guardian_phone_verified_at = now() where phone = '010-3000-0001'
$$);
select pg_temp.expect_error('관계는 아버지, 어머니, 기타만 허용한다', $$
  update public.profiles set guardian_relation = '삼촌' where phone = '010-3000-0001'
$$, '23514');

-- ---------------------------------------------------------------------
-- 소속코드 시도 기록: user_id 대신 ip 로도 남길 수 있다
-- ---------------------------------------------------------------------
select pg_temp.expect_ok('ip 만 있는 시도 기록을 넣을 수 있다', $$
  insert into public.tenant_code_attempts (ip) values ('203.0.113.250')
$$);
select pg_temp.expect_error('user_id 도 ip 도 없는 시도 기록은 거부한다', $$
  insert into public.tenant_code_attempts (attempted_at) values (now())
$$, '23514');

-- ---------------------------------------------------------------------
-- fn_signup_tenant_lookup: 계정 만들기 전 소속코드 조회(IP 당 1시간 10회 실패)
-- ---------------------------------------------------------------------
create function pg_temp.lookup_s(p_code text, p_ip text) returns text language sql as $$
  select coalesce((select l.id::text || ':' || l.name || ':' || l.org_type
    from public.fn_signup_tenant_lookup(p_code, p_ip) l), 'none')
$$;
create function pg_temp.attempts(p_ip text) returns bigint language sql as $$
  select count(*) from public.tenant_code_attempts where ip = p_ip
$$;

select pg_temp.expect_text('맞는 코드는 id, 이름, 유형을 돌려준다',
  pg_temp.lookup_s('SA222222', '203.0.113.1'),
  (select id::text from public.tenants where code = 'SA222222') || ':SA222222 기관:학교');
select pg_temp.expect_int('맞는 코드는 실패 기록을 남기지 않는다', pg_temp.attempts('203.0.113.1'), 0);
select pg_temp.expect_text('소문자, 공백, 하이픈을 정규화한다',
  pg_temp.lookup_s(' sa22-2222 ', '203.0.113.1'),
  (select id::text from public.tenants where code = 'SA222222') || ':SA222222 기관:학교');
select pg_temp.expect_text('없는 코드는 예외 없이 0행', pg_temp.lookup_s('ZZZZZZZZ', '203.0.113.1'), 'none');
select pg_temp.expect_text('빈 코드도 0행', pg_temp.lookup_s('', '203.0.113.1'), 'none');
select pg_temp.expect_int('없는 코드와 빈 코드는 실패 기록이 쌓인다', pg_temp.attempts('203.0.113.1'), 2);

-- 10번째 실패까지는 조회되고, 그 뒤에는 맞는 코드도 WC068
select pg_temp.lookup_s('ZZZZZZZZ', '203.0.113.2') from generate_series(1, 10);
select pg_temp.expect_int('실패 10회 기록', pg_temp.attempts('203.0.113.2'), 10);
select pg_temp.expect_error('실패 10회 뒤에는 맞는 코드도 WC068', $$
  select * from public.fn_signup_tenant_lookup('SA222222', '203.0.113.2')
$$, 'WC068');
select pg_temp.expect_bool('다른 ip 는 영향이 없다',
  pg_temp.lookup_s('SA222222', '203.0.113.3') like '%:SA222222 기관:학교', true);

-- 1시간 지난 기록은 판정에서 빠지고 지워진다
update public.tenant_code_attempts set attempted_at = now() - interval '61 minutes'
  where ip = '203.0.113.2';
select pg_temp.expect_bool('1시간이 지나면 다시 조회된다',
  pg_temp.lookup_s('SA222222', '203.0.113.2') like '%:SA222222 기관:학교', true);
select pg_temp.expect_int('오래된 기록은 지워진다', pg_temp.attempts('203.0.113.2'), 0);

select pg_temp.expect_error('ip 가 비면 22023', $$
  select * from public.fn_signup_tenant_lookup('SA222222', '  ')
$$, '22023');

-- ---------------------------------------------------------------------
-- 클라이언트 role 은 새 함수를 실행할 수 없고 service_role 만 실행한다
-- ---------------------------------------------------------------------
grant execute on function pg_temp.expect_error(text, text, text) to anon, authenticated;
set local role anon;
select pg_temp.expect_error('anon 은 fn_signup_tenant_lookup 실행 불가', $$
  select * from public.fn_signup_tenant_lookup('SA222222', '203.0.113.9')
$$, '42501');
reset role;
set local role authenticated;
select pg_temp.expect_error('authenticated 는 fn_signup_tenant_lookup 실행 불가', $$
  select * from public.fn_signup_tenant_lookup('SA222222', '203.0.113.9')
$$, '42501');
reset role;
grant execute on function pg_temp.expect_bool(text, boolean, boolean), pg_temp.lookup_s(text, text) to service_role;
set local role service_role;
select pg_temp.expect_bool('service_role 은 fn_signup_tenant_lookup 실행 가능',
  pg_temp.lookup_s('SA222222', '203.0.113.9') like '%:SA222222 기관:학교', true);
reset role;

-- ---------------------------------------------------------------------
-- fn_student_signup: 가입 확정. 픽스처
-- ---------------------------------------------------------------------
insert into public.app_settings (key, value) values ('signup_enabled', 'true'::jsonb)
  on conflict (key) do update set value = 'true'::jsonb;

-- 약관은 데이터 SQL 로 들어가는 행이라 이 스펙이 직접 만든다(롤백된다).
delete from public.user_term_agreements;
delete from public.terms where code in ('student_service', 'student_privacy', 'student_db_transfer', 'student_marketing');
insert into public.terms (code, version, audience, title, is_required, profile_column) values
  ('student_service', 'T1', 'student', '이용약관', true, 'terms_service_agreed'),
  ('student_privacy', 'T1', 'student', '개인정보', true, 'privacy_required_agreed'),
  ('student_db_transfer', 'T1', 'student', 'DB 전환', true, null),
  ('student_marketing', 'T1', 'student', '마케팅', false, 'marketing_agreed');

-- handle_new_user 트리거가 만드는 상태(auth.users 와 빈 profiles 행)를 흉내 낸다.
create function pg_temp.new_user(p_email text) returns uuid
language plpgsql as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role) values (v_id, p_email, 'authenticated', 'authenticated');
  insert into public.profiles (id, email, role) values (v_id, p_email, 'user');
  return v_id;
end $$;

-- 문자 인증을 통과한 상태의 phone_verifications 행
create function pg_temp.verify(p_phone text, p_purpose text default 'signup') returns void
language plpgsql as $$
begin
  insert into public.phone_verifications (phone, code_hash, purpose, verified_at, expires_at)
  values (regexp_replace(p_phone, '[^0-9]', '', 'g'), 'x', p_purpose, now(), now() + interval '10 minutes');
end $$;

-- 기본값으로 fn_student_signup 을 부른다. p 에 키가 있으면 그 값(JSON null 은 SQL null)으로 덮는다.
create function pg_temp.su(p_user uuid, p jsonb default '{}') returns jsonb
language plpgsql as $$
begin
  return public.fn_student_signup(
    p_user_id => p_user,
    p_username => case when p ? 'username' then p->>'username' else 'kimstu01' end,
    p_name => case when p ? 'name' then p->>'name' else '김학생' end,
    p_email => case when p ? 'email' then p->>'email' else 'Stu01@Example.com' end,
    p_phone => case when p ? 'phone' then p->>'phone' else '010-4000-0001' end,
    p_birth_date => case when p ? 'birth_date' then (p->>'birth_date')::date else date '2010-03-02' end,
    p_gender => case when p ? 'gender' then p->>'gender' else '남' end,
    p_tenant_id => case when p ? 'tenant_id' then (p->>'tenant_id')::uuid
                        else (select id from public.tenants where code = 'SA222222') end,
    p_grade => case when p ? 'grade' then p->>'grade' else '고1' end,
    p_group_name => case when p ? 'group_name' then p->>'group_name' else null end,
    p_class_name => case when p ? 'class_name' then p->>'class_name' else '3' end,
    p_number => case when p ? 'number' then (p->>'number')::smallint else 7::smallint end,
    p_guardian_name => case when p ? 'guardian_name' then p->>'guardian_name' else null end,
    p_guardian_phone => case when p ? 'guardian_phone' then p->>'guardian_phone' else null end,
    p_guardian_relation => case when p ? 'guardian_relation' then p->>'guardian_relation' else null end,
    p_guardian_consent => case when p ? 'guardian_consent' then (p->>'guardian_consent')::boolean else false end,
    p_identity_request_id => case when p ? 'identity_request_id' then p->>'identity_request_id' else null end,
    p_agree_service => case when p ? 'agree_service' then (p->>'agree_service')::boolean else true end,
    p_agree_privacy => case when p ? 'agree_privacy' then (p->>'agree_privacy')::boolean else true end,
    p_agree_db_transfer => case when p ? 'agree_db_transfer' then (p->>'agree_db_transfer')::boolean else true end,
    p_agree_marketing => case when p ? 'agree_marketing' then (p->>'agree_marketing')::boolean else false end
  );
end $$;

-- ---------------------------------------------------------------------
-- 14세 이상 학교 학생 가입이 프로필, 학년, 학적, 약관, 연결코드를 한 번에 만든다
-- ---------------------------------------------------------------------
select pg_temp.new_user('stu01@example.com') as uid \gset a_
select pg_temp.verify('010-4000-0001');
select pg_temp.su(:'a_uid'::uuid) as r \gset a_

select pg_temp.expect_bool('가입 결과 ok', (:'a_r'::jsonb)->>'ok' = 'true', true);
select pg_temp.expect_text('프로필: 학생, 아이디 소문자, 이메일 소문자',
  (select member_type || ':' || username || ':' || email from public.profiles where id = :'a_uid'::uuid),
  'student:kimstu01:stu01@example.com');
select pg_temp.expect_text('프로필: 이름, 전화, 생일, 성별',
  (select name || ':' || phone || ':' || birth_date || ':' || gender from public.profiles where id = :'a_uid'::uuid),
  '김학생:010-4000-0001:2010-03-02:남');
select pg_temp.expect_bool('프로필: 기관이 정해진다',
  (select tenant_id = (select id from public.tenants where code = 'SA222222') from public.profiles where id = :'a_uid'::uuid), true);
select pg_temp.expect_text('프로필: 학교 소속이면 school_name 이 기관명, 지역과 학교 유형은 비운다',
  (select coalesce(school_name, '-') || ':' || coalesce(region, '-') || ':' || coalesce(school_type, '-') from public.profiles where id = :'a_uid'::uuid),
  'SA222222 기관:-:-');
select pg_temp.expect_text('프로필: 약관 동의 열',
  (select terms_service_agreed || ':' || privacy_required_agreed || ':' || marketing_agreed from public.profiles where id = :'a_uid'::uuid),
  'true:true:false');
select pg_temp.expect_text('student_profiles 에 학년이 들어간다',
  (select grade from public.student_profiles where profile_id = :'a_uid'::uuid), '고1');
select pg_temp.expect_text('학적: 학년, 반, 번호',
  (select e.grade || ':' || c.name || ':' || e.number from public.student_enrollments e
     join public.classes c on c.id = e.class_id where e.student_id = :'a_uid'::uuid), '고1:3:7');
select pg_temp.expect_int('학적 변경 이력 signup 1건',
  (select count(*) from public.enrollment_changes where student_id = :'a_uid'::uuid and kind = 'signup'), 1);
select pg_temp.expect_int('약관 동의 기록은 약관 4종 전부', (select count(*) from public.user_term_agreements where user_id = :'a_uid'::uuid), 4);
select pg_temp.expect_text('약관 동의: DB 전환 true, 마케팅 false',
  (select string_agg(t.code || '=' || a.agreed, ',' order by t.code) from public.user_term_agreements a
     join public.terms t on t.id = a.term_id where a.user_id = :'a_uid'::uuid and t.code in ('student_db_transfer', 'student_marketing')),
  'student_db_transfer=true,student_marketing=false');
select pg_temp.expect_bool('연결코드 발급, 결과에 같은 코드',
  (select code = (:'a_r'::jsonb)->>'link_code' from public.student_link_codes where student_id = :'a_uid'::uuid and is_active), true);
select pg_temp.expect_int('문자 인증은 소비된다',
  (select count(*) from public.phone_verifications where phone = '01040000001' and consumed_at is not null), 1);

-- ---------------------------------------------------------------------
-- 입력 검증과 가입 게이트(번호 n 마다 따로 만든 계정, 아이디, 이메일, 번호를 쓴다)
-- ---------------------------------------------------------------------
-- 예외 메시지까지 확인한다(plpgsql 평문 예외는 모두 P0001 이라 메시지로 구분한다).
create function pg_temp.expect_msg(t text, p_sql text, want_state text, want_msg text) returns void
language plpgsql as $$
declare
  v_state text;
  v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    if v_state is distinct from want_state or v_msg is distinct from want_msg then
      raise exception '[FAIL] %: got % / %, want % / %', t, v_state, v_msg, want_state, want_msg;
    end if;
    raise notice '[PASS] % = % %', t, want_state, want_msg;
    return;
  end;
  raise exception '[FAIL] %: 예외가 나지 않았다, want % %', t, want_state, want_msg;
end $$;

create function pg_temp.go(n int, extra jsonb default '{}', p_verify boolean default true) returns jsonb
language plpgsql as $$
declare
  v_phone text := '010-50' || lpad(n::text, 2, '0') || '-0001';
begin
  if p_verify then perform pg_temp.verify(v_phone); end if;
  return pg_temp.su(
    pg_temp.new_user('go' || n || '@example.com'),
    jsonb_build_object('phone', v_phone, 'username', 'gouser' || n, 'email', 'go' || n || '@example.com', 'number', n) || extra);
end $$;

update public.app_settings set value = 'false'::jsonb where key = 'signup_enabled';
select pg_temp.expect_error('가입이 꺼져 있으면 WC074', $$select pg_temp.go(1)$$, 'WC074');
delete from public.app_settings where key = 'signup_enabled';
select pg_temp.expect_error('설정 행이 없어도 닫힌다(폴백으로 열지 않는다)', $$select pg_temp.go(2)$$, 'WC074');
insert into public.app_settings (key, value) values ('signup_enabled', 'true'::jsonb);

select pg_temp.expect_msg('이용약관 미동의', $$select pg_temp.go(3, '{"agree_service": false}')$$, 'P0001', 'terms_service_required');
select pg_temp.expect_msg('개인정보 미동의', $$select pg_temp.go(4, '{"agree_privacy": false}')$$, 'P0001', 'privacy_required');
select pg_temp.expect_msg('DB 전환 미동의', $$select pg_temp.go(5, '{"agree_db_transfer": false}')$$, 'P0001', 'db_transfer_required');
select pg_temp.expect_msg('이름 없음', $$select pg_temp.go(6, '{"name": "  "}')$$, 'P0001', 'name_required');
select pg_temp.expect_msg('이메일 없음', $$select pg_temp.go(7, '{"email": ""}')$$, 'P0001', 'email_required');
select pg_temp.expect_msg('학년 없음', $$select pg_temp.go(8, '{"grade": null}')$$, 'P0001', 'grade_required');
select pg_temp.expect_msg('14세 이상은 생년월일 필수', $$select pg_temp.go(9, '{"birth_date": null}')$$, 'P0001', 'birth_date_required');
select pg_temp.expect_msg('14세 이상은 성별 필수', $$select pg_temp.go(10, '{"gender": null}')$$, 'P0001', 'gender_required');
select pg_temp.expect_msg('성별은 남, 여만', $$select pg_temp.go(11, '{"gender": "x"}')$$, 'P0001', 'invalid_gender');
select pg_temp.expect_msg('아이디가 너무 짧다', $$select pg_temp.go(12, '{"username": "abc"}')$$, 'P0001', 'username_invalid');
select pg_temp.expect_msg('아이디가 너무 길다', $$select pg_temp.go(13, '{"username": "abcdefghijklmnopqrstu"}')$$, 'P0001', 'username_invalid');
select pg_temp.expect_msg('아이디에 @ 불가', $$select pg_temp.go(14, '{"username": "ab@cd"}')$$, 'P0001', 'username_invalid');
select pg_temp.expect_msg('아이디에 한글 불가', $$select pg_temp.go(15, '{"username": "가나다라"}')$$, 'P0001', 'username_invalid');
select pg_temp.expect_ok('아이디 대문자는 소문자로 바꿔 받는다', $$select pg_temp.go(16, '{"username": "UpperCase16"}')$$);
select pg_temp.expect_text('저장된 아이디는 소문자',
  (select username from public.profiles where email = 'go16@example.com'), 'uppercase16');
select pg_temp.expect_error('이미 쓰는 아이디(대소문자 무시)는 WC095', $$select pg_temp.go(17, '{"username": "UPPERCASE16"}')$$, 'WC095');
select pg_temp.expect_ok('선생님 계정 login_id 와 겹치는 아이디 준비', $$
  insert into public.teachers (tenant_id, name, phone, role, login_id)
  values ((select id from public.tenants where code = 'SA222222'), '교사', '01099990001', 'homeroom', 'SA222222ABC234')
$$);
select pg_temp.expect_error('선생님 login_id 와 겹치는 아이디는 WC095', $$select pg_temp.go(18, '{"username": "sa222222abc234"}')$$, 'WC095');
select pg_temp.expect_msg('계정이 없으면 user_not_found', $$
  select pg_temp.verify('010-5019-0001');
  select pg_temp.su(gen_random_uuid(), '{"phone": "010-5019-0001", "username": "nouser19", "email": "n19@example.com"}')
$$, 'P0001', 'user_not_found');
select pg_temp.expect_msg('이미 가입을 끝낸 계정은 다시 가입할 수 없다', $$
  select pg_temp.su((select id from auth.users where email = 'stu01@example.com'), '{"username": "again20"}')
$$, 'P0001', 'already_signed_up');
select pg_temp.expect_msg('다른 계정이 쓰는 이메일은 duplicate_email', $$
  select pg_temp.go(21, '{"email": "STU01@example.com"}')
$$, 'P0001', 'duplicate_email');

-- ---------------------------------------------------------------------
-- 소속: 기타(소속 없음)는 기타 기관으로, 없는 기관은 WC097
-- ---------------------------------------------------------------------
select pg_temp.expect_error('기타 기관이 없으면 소속 없는 가입은 WC097', $$select pg_temp.go(30, '{"tenant_id": null}')$$, 'WC097');
select pg_temp.expect_error('없는 기관 id 는 WC097', $$select pg_temp.go(31, jsonb_build_object('tenant_id', gen_random_uuid()))$$, 'WC097');
select pg_temp.verify('010-5036-0001');
select pg_temp.expect_error('없는 기관이면 WC097(문자 인증은 미리 통과)', $$
  select pg_temp.go(36, jsonb_build_object('tenant_id', gen_random_uuid()), false)
$$, 'WC097');
select pg_temp.expect_int('실패한 가입은 문자 인증을 소비하지 않는다',
  (select count(*) from public.phone_verifications where phone = '01050360001' and consumed_at is null), 1);

insert into public.tenants (code, name, region, org_type, tier, is_catch_all)
  values ('SC222222', '기타', '기타', '기타', 'W', true);
select pg_temp.expect_ok('소속 없는 가입', $$select pg_temp.go(32, '{"tenant_id": null}')$$);
select pg_temp.expect_text('기타 기관에 묶이고 school_name 은 비운다',
  (select (tenant_id = (select id from public.tenants where is_catch_all))::text || ':' || coalesce(school_name, '-')
     from public.profiles where email = 'go32@example.com'), 'true:-');
select pg_temp.expect_text('기타는 반과 번호를 받지 않는다(넘겨도 비운다), 학년은 남는다',
  (select coalesce(class_id::text, '-') || ':' || coalesce(number::text, '-') || ':' || grade
     from public.student_enrollments where student_id = (select id from public.profiles where email = 'go32@example.com')), '-:-:고1');
select pg_temp.expect_text('기타도 student_profiles 학년이 들어간다',
  (select grade from public.student_profiles where profile_id = (select id from public.profiles where email = 'go32@example.com')), '고1');
select pg_temp.expect_ok('기타끼리는 같은 학년, 반, 번호 검사에서 빠진다', $$select pg_temp.go(33, '{"tenant_id": null, "number": 5}')$$);
select pg_temp.expect_ok('기타끼리는 같은 학년, 반, 번호 검사에서 빠진다(2)', $$select pg_temp.go(34, '{"tenant_id": null, "number": 5}')$$);

select pg_temp.mk_tenant('SD222222', '기관');
select pg_temp.expect_ok('학원 소속 가입', $$select pg_temp.go(35, jsonb_build_object('tenant_id', (select id from public.tenants where code = 'SD222222')))$$);
select pg_temp.expect_text('학원 소속은 school_name 을 비운다',
  (select coalesce(school_name, '-') from public.profiles where email = 'go35@example.com'), '-');

-- ---------------------------------------------------------------------
-- 본인 번호 문자 인증: 가입 목적, 인증 완료, 10분 안, 한 번만 쓸 수 있다
-- ---------------------------------------------------------------------
select pg_temp.expect_msg('인증 없이는 가입할 수 없다', $$select pg_temp.go(40, '{}', false)$$, 'P0001', 'phone_not_verified');
select pg_temp.expect_msg('번호가 비면 phone_required', $$select pg_temp.go(41, '{"phone": ""}', false)$$, 'P0001', 'phone_required');
select pg_temp.expect_msg('다른 목적(find_account) 인증은 가입에 못 쓴다', $$
  select pg_temp.verify('010-5042-0001', 'find_account');
  select pg_temp.go(42, '{}', false)
$$, 'P0001', 'phone_not_verified');
select pg_temp.expect_msg('인증번호만 보내고 확인하지 않은 행은 못 쓴다', $$
  insert into public.phone_verifications (phone, code_hash, purpose, expires_at)
    values ('01050430001', 'x', 'signup', now() + interval '5 minutes');
  select pg_temp.go(43, '{}', false)
$$, 'P0001', 'phone_not_verified');
select pg_temp.expect_msg('인증 후 10분이 지나면 못 쓴다', $$
  insert into public.phone_verifications (phone, code_hash, purpose, verified_at, expires_at)
    values ('01050440001', 'x', 'signup', now() - interval '11 minutes', now() + interval '5 minutes');
  select pg_temp.go(44, '{}', false)
$$, 'P0001', 'phone_not_verified');

-- 같은 인증은 한 번만: 기관이 다르면 같은 번호도 가입할 수 있지만 인증은 다시 받아야 한다
select pg_temp.expect_ok('기관 A 에서 번호 가입', $$select pg_temp.go(45, '{}')$$);
select pg_temp.expect_msg('같은 인증을 기관 B 가입에 다시 쓸 수 없다', $$
  select pg_temp.su(pg_temp.new_user('go45b@example.com'), jsonb_build_object(
    'phone', '010-5045-0001', 'username', 'gouser45b', 'email', 'go45b@example.com',
    'tenant_id', (select id from public.tenants where code = 'SB222222')))
$$, 'P0001', 'phone_not_verified');
select pg_temp.expect_ok('기관 B 는 새 인증을 받으면 같은 번호로 가입된다', $$
  select pg_temp.verify('010-5045-0001');
  select pg_temp.su(pg_temp.new_user('go45c@example.com'), jsonb_build_object(
    'phone', '010-5045-0001', 'username', 'gouser45c', 'email', 'go45c@example.com',
    'tenant_id', (select id from public.tenants where code = 'SB222222')))
$$);

select pg_temp.expect_ok('같은 번호로 새 인증이 있어도 같은 기관에는 한 번만(준비)', $$select pg_temp.verify('010-5045-0001')$$);
select pg_temp.expect_error('같은 기관 같은 번호는 WC096', $$
  select pg_temp.su(pg_temp.new_user('go45d@example.com'), jsonb_build_object(
    'phone', '01050450001', 'username', 'gouser45d', 'email', 'go45d@example.com', 'number', 46))
$$, 'WC096');

-- ---------------------------------------------------------------------
-- 학급 번호 중복(WC077)은 먼저 가입한 학생 이름을 detail 로 싣고, 실패하면 아무것도 남기지 않는다
-- ---------------------------------------------------------------------
create function pg_temp.expect_detail(t text, p_sql text, want_state text, want_detail text) returns void
language plpgsql as $$
declare
  v_state text;
  v_detail text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_detail = pg_exception_detail;
    if v_state is distinct from want_state or v_detail is distinct from want_detail then
      raise exception '[FAIL] %: got % / %, want % / %', t, v_state, v_detail, want_state, want_detail;
    end if;
    raise notice '[PASS] % = % %', t, want_state, want_detail;
    return;
  end;
  raise exception '[FAIL] %: 예외가 나지 않았다, want % %', t, want_state, want_detail;
end $$;

-- a_uid 학생(김학생)이 SA222222 고1 3반 7번이다.
select pg_temp.verify('010-5050-0001');
select pg_temp.expect_detail('같은 학년, 반, 번호는 WC077 이고 detail 이 먼저 가입한 학생 이름이다', $$
  select pg_temp.go(50, '{"number": 7, "name": "박다른", "agree_marketing": true}', false)
$$, 'WC077', '김학생');
select pg_temp.expect_int('WC077 실패 뒤 문자 인증은 소비되지 않는다',
  (select count(*) from public.phone_verifications where phone = '01050500001' and consumed_at is null), 1);
select pg_temp.expect_int('WC077 실패 뒤 프로필은 가입 전 상태다(아이디 없음)',
  (select count(*) from public.profiles where email = 'go50@example.com' and member_type is not null), 0);
select pg_temp.expect_int('WC077 실패 뒤 약관, 연결코드, 학적이 남지 않는다',
  (select count(*) from public.student_link_codes l join public.profiles p on p.id = l.student_id where p.email = 'go50@example.com')
  + (select count(*) from public.student_enrollments e join public.profiles p on p.id = e.student_id where p.email = 'go50@example.com'), 0);
select pg_temp.expect_ok('번호를 비우면 중복 검사에서 빠진다(같은 반)', $$select pg_temp.go(51, '{"number": null}')$$);
select pg_temp.expect_ok('번호를 비우면 중복 검사에서 빠진다(같은 반 2)', $$select pg_temp.go(52, '{"number": null}')$$);
select pg_temp.expect_ok('학급 번호는 학년이 다르면 따로다', $$select pg_temp.go(53, '{"number": 7, "grade": "고2"}')$$);

select pg_temp.expect_error('등록되지 않은 그룹은 WC080', $$
  select pg_temp.go(54, jsonb_build_object('tenant_id', (select id from public.tenants where code = 'SD222222'), 'group_name', '없는그룹'))
$$, 'WC080');
insert into public.class_groups (tenant_id, name) values ((select id from public.tenants where code = 'SD222222'), '심화반');
select pg_temp.expect_ok('등록된 그룹은 통과(대소문자 무시)', $$
  select pg_temp.go(55, jsonb_build_object('tenant_id', (select id from public.tenants where code = 'SD222222'), 'group_name', '심화반'))
$$);
select pg_temp.expect_text('그룹이 학급에 묶인다',
  (select g.name from public.student_enrollments e join public.classes c on c.id = e.class_id
     join public.class_groups g on g.id = c.group_id
    where e.student_id = (select id from public.profiles where email = 'go55@example.com')), '심화반');

-- ---------------------------------------------------------------------
-- 학부모 정보(14세 이상): 번호를 넣으면 guardian_signup 문자 인증이 필요하다
-- ---------------------------------------------------------------------
select pg_temp.expect_text('학부모 정보를 비우면 학부모 컬럼도 비어 있다',
  (select coalesce(guardian_name, '-') || ':' || coalesce(guardian_phone, '-') || ':' || coalesce(guardian_relation, '-')
     || ':' || (guardian_phone_verified_at is null) from public.profiles where id = (select id from auth.users where email = 'stu01@example.com')),
  '-:-:-:true');
select pg_temp.expect_msg('학부모 번호가 인증되지 않았으면 거부', $$
  select pg_temp.go(60, '{"guardian_name": "김보호", "guardian_phone": "010-6000-0001", "guardian_relation": "어머니"}')
$$, 'P0001', 'guardian_phone_not_verified');
select pg_temp.expect_msg('가입 목적(signup) 인증은 학부모 번호 인증이 아니다', $$
  select pg_temp.verify('010-6000-0002', 'signup');
  select pg_temp.go(61, '{"guardian_name": "김보호", "guardian_phone": "010-6000-0002"}')
$$, 'P0001', 'guardian_phone_not_verified');
select pg_temp.expect_msg('관계는 아버지, 어머니, 기타만', $$
  select pg_temp.go(62, '{"guardian_relation": "삼촌"}')
$$, 'P0001', 'invalid_guardian_relation');

select pg_temp.verify('010-6000-0003', 'guardian_signup');
select pg_temp.expect_ok('학부모 번호 인증을 마치면 가입된다', $$
  select pg_temp.go(63, '{"guardian_name": " 김보호 ", "guardian_phone": "01060000003", "guardian_relation": "어머니"}')
$$);
select pg_temp.expect_text('학부모 이름, 하이픈 번호, 관계가 저장된다',
  (select guardian_name || ':' || guardian_phone || ':' || guardian_relation from public.profiles where email = 'go63@example.com'),
  '김보호:010-6000-0003:어머니');
select pg_temp.expect_bool('학부모 번호 인증 시각이 기록된다',
  (select guardian_phone_verified_at is not null from public.profiles where email = 'go63@example.com'), true);
select pg_temp.expect_int('학부모 인증도 소비된다',
  (select count(*) from public.phone_verifications where phone = '01060000003' and consumed_at is not null), 1);
select pg_temp.expect_int('학부모 번호는 학생 번호 유일성에 걸리지 않는다(같은 번호의 다른 학생 가입)', 1,
  (select count(*) from public.profiles where email = 'go63@example.com' and phone = '010-5063-0001'));
select pg_temp.verify('010-6000-0003', 'guardian_signup');
select pg_temp.expect_ok('형제는 같은 학부모 번호를 쓸 수 있다', $$
  select pg_temp.go(64, '{"guardian_name": "김보호", "guardian_phone": "010-6000-0003", "guardian_relation": "어머니"}')
$$);

-- ---------------------------------------------------------------------
-- 만 14세 미만: PASS 본인확인(under14_guardian)이 생년월일, 성별, 학부모 번호의 정본이다
-- ---------------------------------------------------------------------
create function pg_temp.mk_iv(p_rid text, p_purpose text default 'under14_guardian', p_status text default 'verified',
  p_guardian_under14 boolean default false, p_gender text default '1', p_mobile text default '01070000001',
  p_verified_ago interval default interval '1 minute', p_consumed boolean default false) returns void
language plpgsql as $$
begin
  insert into public.identity_verifications (request_id, purpose, status, is_under14, birth_date, gender, mobile,
    verified_at, expires_at, consumed_at)
  values (p_rid, p_purpose, p_status, p_guardian_under14, date '1980-05-06', p_gender, p_mobile,
    now() - p_verified_ago, now() + interval '1 hour', case when p_consumed then now() end);
end $$;

-- 14세 미만은 본인 번호가 선택이라 비워 보낸다. 학부모 번호는 PASS 값으로 덮인다.
create function pg_temp.go14(n int, p_rid text, extra jsonb default '{}') returns jsonb
language plpgsql as $$
begin
  return pg_temp.su(
    pg_temp.new_user('go' || n || '@example.com'),
    jsonb_build_object('phone', '', 'username', 'gouser' || n, 'email', 'go' || n || '@example.com', 'number', n,
      'birth_date', date '2013-05-06', 'gender', '여', 'identity_request_id', p_rid,
      'guardian_name', '박보호', 'guardian_phone', '010-0000-0000', 'guardian_relation', '아버지',
      'guardian_consent', true) || extra);
end $$;

select pg_temp.mk_iv('rid-70');
select pg_temp.expect_ok('PASS 본인확인으로 본인 번호 없이 가입된다', $$select pg_temp.go14(70, 'rid-70')$$);
select pg_temp.expect_text('학생 생년월일과 성별은 폼 값이고 PASS(학부모) 값이 아니다, 본인 번호는 비운다',
  (select birth_date || ':' || gender || ':' || coalesce(phone, '-') from public.profiles where email = 'go70@example.com'),
  '2013-05-06:여:-');
select pg_temp.expect_text('학부모 번호는 PASS 번호로 덮이고 SMS 인증 시각은 비운다',
  (select guardian_phone || ':' || guardian_consent || ':' || (guardian_phone_verified_at is null)
     from public.profiles where email = 'go70@example.com'), '010-7000-0001:true:true');
select pg_temp.expect_text('본인확인은 소비되고 새 계정과 이어진다',
  (select (consumed_at is not null)::text || ':' || (user_id = (select id from public.profiles where email = 'go70@example.com'))::text
     from public.identity_verifications where request_id = 'rid-70'), 'true:true');
select pg_temp.expect_msg('같은 본인확인은 한 번만', $$select pg_temp.go14(71, 'rid-70')$$, 'P0001', 'identity_not_verified');

select pg_temp.mk_iv('rid-72', p_gender => '2');
select pg_temp.go14(72, 'rid-72', '{"gender": "남"}');
select pg_temp.expect_text('PASS 성별 코드는 학생 성별에 쓰이지 않는다', (select gender from public.profiles where email = 'go72@example.com'), '남');
select pg_temp.mk_iv('rid-83');
select pg_temp.expect_msg('14세 미만도 생년월일 필수', $$select pg_temp.go14(83, 'rid-83', '{"birth_date": null}')$$, 'P0001', 'birth_date_required');
select pg_temp.mk_iv('rid-84');
select pg_temp.expect_msg('14세 미만도 성별 필수', $$select pg_temp.go14(84, 'rid-84', '{"gender": null}')$$, 'P0001', 'gender_required');
select pg_temp.expect_msg('14세 미만 생년월일인데 본인확인이 없으면 거부', $$
  select pg_temp.go(85, jsonb_build_object('birth_date', ((now() at time zone 'Asia/Seoul')::date - interval '13 years 364 days')::date))
$$, 'P0001', 'identity_not_verified');
select pg_temp.expect_ok('만 14세 생일 당일은 14세 이상이라 본인확인 없이 가입된다', $$
  select pg_temp.go(86, jsonb_build_object('birth_date', ((now() at time zone 'Asia/Seoul')::date - interval '14 years')::date))
$$);

select pg_temp.expect_msg('없는 본인확인', $$select pg_temp.go14(73, 'nope')$$, 'P0001', 'identity_not_verified');
select pg_temp.mk_iv('rid-74', p_status => 'pending');
select pg_temp.expect_msg('완료되지 않은 본인확인', $$select pg_temp.go14(74, 'rid-74')$$, 'P0001', 'identity_not_verified');
select pg_temp.mk_iv('rid-75', p_verified_ago => interval '31 minutes');
select pg_temp.expect_msg('30분 지난 본인확인', $$select pg_temp.go14(75, 'rid-75')$$, 'P0001', 'identity_not_verified');
select pg_temp.mk_iv('rid-76', p_purpose => 'signup');
select pg_temp.expect_msg('목적이 다른 본인확인', $$select pg_temp.go14(76, 'rid-76')$$, 'P0001', 'identity_purpose_mismatch');
select pg_temp.mk_iv('rid-77', p_guardian_under14 => true);
select pg_temp.expect_msg('법정대리인이 14세 미만', $$select pg_temp.go14(77, 'rid-77')$$, 'P0001', 'guardian_age');
select pg_temp.mk_iv('rid-78');
select pg_temp.expect_msg('법정대리인 동의가 없으면 거부', $$select pg_temp.go14(78, 'rid-78', '{"guardian_consent": false}')$$, 'P0001', 'guardian_consent_required');
select pg_temp.mk_iv('rid-79', p_mobile => null);
select pg_temp.expect_msg('학부모 번호가 PASS 에도 입력에도 없으면 거부', $$select pg_temp.go14(79, 'rid-79', '{"guardian_phone": ""}')$$, 'P0001', 'guardian_phone_required');
select pg_temp.mk_iv('rid-80');
select pg_temp.expect_msg('본인 번호를 넣었으면 14세 미만도 인증이 필요하다', $$select pg_temp.go14(80, 'rid-80', '{"phone": "010-5080-0001"}')$$, 'P0001', 'phone_not_verified');
select pg_temp.expect_ok('본인 번호를 인증하면 14세 미만도 본인 번호가 저장된다', $$
  select pg_temp.verify('010-5081-0001');
  select pg_temp.mk_iv('rid-81');
  select pg_temp.go14(81, 'rid-81', '{"phone": "010-5081-0001"}')
$$);
select pg_temp.mk_iv('rid-82');
select pg_temp.expect_msg('14세 미만이 아니면 본인 번호 없이는 가입할 수 없다', $$select pg_temp.go(82, '{"phone": ""}', false)$$, 'P0001', 'phone_required');

-- ---------------------------------------------------------------------
-- fn_student_signup 은 service_role 만 실행한다(계정을 만드는 쪽은 서버뿐이다)
-- ---------------------------------------------------------------------
grant execute on function pg_temp.su(uuid, jsonb) to anon, authenticated;
set local role anon;
select pg_temp.expect_error('anon 은 fn_student_signup 실행 불가', $$select pg_temp.su(gen_random_uuid())$$, '42501');
reset role;
set local role authenticated;
select pg_temp.expect_error('authenticated 는 fn_student_signup 실행 불가', $$select pg_temp.su(gen_random_uuid())$$, '42501');
reset role;
select pg_temp.expect_bool('service_role 만 실행 권한이 있다',
  has_function_privilege('service_role',
    'public.fn_student_signup(uuid, text, text, text, text, date, text, uuid, text, text, text, smallint, text, text, text, boolean, text, boolean, boolean, boolean, boolean)', 'execute')
  and not has_function_privilege('anon',
    'public.fn_student_signup(uuid, text, text, text, text, date, text, uuid, text, text, text, smallint, text, text, text, boolean, text, boolean, boolean, boolean, boolean)', 'execute')
  and not has_function_privilege('authenticated',
    'public.fn_student_signup(uuid, text, text, text, text, date, text, uuid, text, text, text, smallint, text, text, text, boolean, text, boolean, boolean, boolean, boolean)', 'execute'), true);

do $$ begin raise notice '=== b2b-school-signup.spec: 전체 통과 ==='; end $$;

rollback;
