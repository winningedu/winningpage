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

do $$ begin raise notice '=== b2b-school-signup.spec: 전체 통과 ==='; end $$;

rollback;
