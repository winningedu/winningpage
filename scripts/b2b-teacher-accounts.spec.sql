-- =====================================================================
-- B2B 선생님 계정 함수 SQL 스펙: attach_account, password_set, set_status, soft_delete, assignment_set
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-teacher-accounts.spec.sql
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

create function pg_temp.mk_tenant(p_code text, p_org_type text) returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.tenants (code, name, region, org_type, tier)
  values (p_code, 't4-' || p_code, '서울', p_org_type, 'B')
  returning id into v_id;
  return v_id;
end $$;

create function pg_temp.mk_tenant2(p_code text) returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.tenants (code, name, region, org_type, tier)
  values (p_code, 'ta-' || p_code, '서울', '학교', 'B')
  returning id into v_id;
  return v_id;
end $$;

create temp table fx (k text primary key, v uuid);
insert into fx values
  ('ta', pg_temp.mk_tenant2('TAAAAAAA')),
  ('tb', pg_temp.mk_tenant2('TABBBBBB'));
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;

-- 등록 헬퍼: fn_teacher_register 결과의 교사 id
create function pg_temp.reg(p_tenant text, p_name text, p_phone text, p_role text, p_classes text default '[]')
returns uuid language sql as $$
  select teacher_id from public.fn_teacher_register(
    pg_temp.fx(p_tenant), p_name, p_phone, p_role, p_classes::jsonb, null)
$$;

-- Auth 사용자 헬퍼(로컬 스택에는 auth.users -> profiles 트리거가 없다)
create function pg_temp.mk_auth(p_email text) returns uuid
language plpgsql as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role) values (v_id, p_email, 'authenticated', 'authenticated');
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- fn_teacher_attach_account
-- ---------------------------------------------------------------------
create temp table t1 (k text primary key, id uuid);
insert into t1 values ('h1', pg_temp.reg('ta', '계정교사', '01070000001', 'homeroom', '[{"grade":"고1","name":"1"}]'));
create temp table au (k text primary key, id uuid);
insert into au values ('h1', pg_temp.mk_auth((select login_id from public.teachers where id = (select id from t1 where k = 'h1')) || '@teacher.schoolmentor.kr'));

select public.fn_teacher_attach_account(
  (select id from t1 where k = 'h1'), (select id from au where k = 'h1'),
  (select login_id from public.teachers where id = (select id from t1 where k = 'h1')), 'scrypt$hash1');
select pg_temp.expect_text('attach 는 profiles 를 teacher 로 만든다',
  (select member_type || '/' || role from public.profiles where id = (select id from au where k = 'h1')), 'teacher/user');
select pg_temp.expect_text('profiles.username 은 로그인 아이디',
  (select username from public.profiles where id = (select id from au where k = 'h1')),
  (select login_id from public.teachers where id = (select id from t1 where k = 'h1')));
select pg_temp.expect_bool('profiles.tenant_id 와 name 이 채워지고 email, phone 은 비어 있다',
  (select tenant_id = pg_temp.fx('ta') and name = '계정교사' and email is null and phone is null
     from public.profiles where id = (select id from au where k = 'h1')), true);
select pg_temp.expect_bool('teachers 는 계정, 임시 해시, 변경 필요 상태를 갖는다',
  (select profile_id = (select id from au where k = 'h1') and temp_password_hash = 'scrypt$hash1'
          and must_change_password and temp_password_issued_at is not null and password_set_at is null
     from public.teachers where id = (select id from t1 where k = 'h1')), true);
select pg_temp.expect_ok('같은 계정으로 다시 attach(재시도, 재발급)는 성공하고 해시를 바꾼다',
  $$select public.fn_teacher_attach_account((select id from t1 where k = 'h1'), (select id from au where k = 'h1'),
    (select login_id from public.teachers where id = (select id from t1 where k = 'h1')), 'scrypt$hash2')$$);
select pg_temp.expect_text('재발급은 새 해시를 저장한다',
  (select temp_password_hash from public.teachers where id = (select id from t1 where k = 'h1')), 'scrypt$hash2');
select pg_temp.expect_error('다른 로그인 아이디는 WC089',
  $$select public.fn_teacher_attach_account((select id from t1 where k = 'h1'), (select id from au where k = 'h1'), 'TAAAAAAAZZZZZZ', 'x')$$, 'WC089');
select pg_temp.expect_error('이미 다른 계정이 붙은 교사에 다른 계정은 WC089',
  $$select public.fn_teacher_attach_account((select id from t1 where k = 'h1'), pg_temp.mk_auth('other@teacher.schoolmentor.kr'),
    (select login_id from public.teachers where id = (select id from t1 where k = 'h1')), 'x')$$, 'WC089');
select pg_temp.expect_error('없는 교사는 WC088',
  $$select public.fn_teacher_attach_account(gen_random_uuid(), (select id from au where k = 'h1'), 'TAAAAAAAZZZZZZ', 'x')$$, 'WC088');

-- @@SEGMENTS@@

do $$ begin raise notice '=== b2b-teacher-accounts.spec: 전체 통과 ==='; end $$;

rollback;
