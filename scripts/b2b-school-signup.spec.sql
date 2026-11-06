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

do $$ begin raise notice '=== b2b-school-signup.spec: 전체 통과 ==='; end $$;

rollback;
