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

create function pg_temp.expect_uuid(t text, got uuid, want uuid) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '[FAIL] %: got %, want %', t, got, want;
  end if;
  raise notice '[PASS] % = %', t, want;
end $$;

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

-- ---------------------------------------------------------------------
-- fn_teacher_password_set
-- ---------------------------------------------------------------------
select public.fn_teacher_password_set((select id from t1 where k = 'h1'));
select pg_temp.expect_bool('password_set 은 임시 해시와 변경 필요 상태를 지우고 설정 시각을 남긴다',
  (select temp_password_hash is null and not must_change_password and password_set_at is not null
     from public.teachers where id = (select id from t1 where k = 'h1')), true);
select pg_temp.expect_error('비밀번호 설정 뒤에는 attach(재발급)가 WC090',
  $$select public.fn_teacher_attach_account((select id from t1 where k = 'h1'), (select id from au where k = 'h1'),
    (select login_id from public.teachers where id = (select id from t1 where k = 'h1')), 'x')$$, 'WC090');
select pg_temp.expect_error('계정이 없는 교사의 password_set 은 WC089',
  $$select public.fn_teacher_password_set(pg_temp.reg('ta', '계정없음', '01070000002', 'homeroom'))$$, 'WC089');
select pg_temp.expect_error('없는 교사의 password_set 은 WC088',
  $$select public.fn_teacher_password_set(gen_random_uuid())$$, 'WC088');

-- ---------------------------------------------------------------------
-- fn_teacher_set_status
-- ---------------------------------------------------------------------
select pg_temp.expect_error('본인 비활성화는 WC091',
  $$select public.fn_teacher_set_status((select id from t1 where k = 'h1'), 'inactive', (select id from au where k = 'h1'), pg_temp.fx('ta'))$$, 'WC091');
select pg_temp.expect_uuid('비활성화는 Auth 정지에 쓸 profile id 를 돌려준다',
  public.fn_teacher_set_status((select id from t1 where k = 'h1'), 'inactive', null, pg_temp.fx('ta')), (select id from au where k = 'h1'));
select pg_temp.expect_text('상태가 inactive 로 바뀐다',
  (select status from public.teachers where id = (select id from t1 where k = 'h1')), 'inactive');
select pg_temp.expect_uuid('다시 활성화',
  public.fn_teacher_set_status((select id from t1 where k = 'h1'), 'active', null, pg_temp.fx('ta')), (select id from au where k = 'h1'));
select pg_temp.expect_text('상태가 active 로 돌아온다',
  (select status from public.teachers where id = (select id from t1 where k = 'h1')), 'active');
select pg_temp.expect_error('상태 값 오류는 check_violation',
  $$select public.fn_teacher_set_status((select id from t1 where k = 'h1'), 'gone', null, pg_temp.fx('ta'))$$, '23514');
select pg_temp.expect_error('없는 교사는 WC088',
  $$select public.fn_teacher_set_status(gen_random_uuid(), 'inactive', null, pg_temp.fx('ta'))$$, 'WC088');
insert into t1 values ('adm', pg_temp.reg('ta', '관리자', '01070000003', 'school_admin'));
select pg_temp.expect_error('마지막 학교 관리자 비활성화는 WC076',
  $$select public.fn_teacher_set_status((select id from t1 where k = 'adm'), 'inactive', null, pg_temp.fx('ta'))$$, 'WC076');
insert into t1 values ('adm2', pg_temp.reg('ta', '관리자둘', '01070000004', 'school_admin'));
select pg_temp.expect_ok('관리자가 둘이면 하나는 비활성화 가능',
  $$select public.fn_teacher_set_status((select id from t1 where k = 'adm'), 'inactive', null, pg_temp.fx('ta'))$$);

-- ---------------------------------------------------------------------
-- fn_teacher_soft_delete
-- ---------------------------------------------------------------------
create function pg_temp.mk_student(p_class_name text, p_number int) returns uuid
language plpgsql as $$
declare
  v_id uuid := pg_temp.mk_auth('st-' || gen_random_uuid() || '@example.com');
  v_t public.tenants;
begin
  select * into v_t from public.tenants where id = pg_temp.fx('ta');
  insert into public.profiles (id, role, member_type, tenant_id, name) values (v_id, 'user', 'student', v_t.id, '학생');
  insert into public.student_enrollments (tenant_id, student_id, school_year, grade, class_id, number)
  select v_t.id, v_id, c.school_year, c.grade, c.id, p_number
    from public.classes c
   where c.tenant_id = v_t.id and c.school_year = v_t.school_year and c.grade = '고1' and c.name = p_class_name;
  return v_id;
end $$;
select pg_temp.mk_student('1', 1);
select pg_temp.mk_student('1', 2);

create temp table del (teacher_id uuid, profile_id uuid, active_students bigint);
insert into del select * from public.fn_teacher_soft_delete(array[(select id from t1 where k = 'h1')], null, pg_temp.fx('ta'));
select pg_temp.expect_int('삭제는 담당 학급의 재학생 수를 돌려준다', (select active_students from del), 2);
select pg_temp.expect_uuid('삭제는 Auth 삭제에 쓸 profile id 를 돌려준다',
  (select profile_id from del), (select id from au where k = 'h1'));
select pg_temp.expect_bool('삭제된 교사는 deleted_at 이 있고 로그인 아이디를 유지한다',
  (select deleted_at is not null and login_id is not null from public.teachers where id = (select id from t1 where k = 'h1')), true);
select pg_temp.expect_int('삭제는 담당 학급을 모두 지운다',
  (select count(*) from public.teacher_class_assignments where teacher_id = (select id from t1 where k = 'h1')), 0);
select pg_temp.expect_int('재학생 기록은 그대로다',
  (select count(*) from public.student_enrollments where tenant_id = pg_temp.fx('ta')), 2);
select pg_temp.expect_bool('삭제된 교사의 로그인 아이디는 사용 불가로 남는다',
  public.is_username_available((select login_id from public.teachers where id = (select id from t1 where k = 'h1'))), false);
select pg_temp.expect_int('같은 호출을 다시 해도(Auth 삭제 재시도) 같은 profile id 가 나오고 재학생은 0',
  (select count(*) from public.fn_teacher_soft_delete(array[(select id from t1 where k = 'h1')], null, pg_temp.fx('ta'))
    where profile_id = (select id from au where k = 'h1') and active_students = 0), 1);
select pg_temp.expect_ok('삭제된 교사의 전화번호는 다시 등록할 수 있다',
  $$select pg_temp.reg('ta', '계정교사', '01070000001', 'homeroom')$$);
select pg_temp.expect_error('마지막 학교 관리자 삭제는 WC076 이고 같은 호출의 다른 교사도 지워지지 않는다',
  $$select * from public.fn_teacher_soft_delete(array[pg_temp.reg('ta', '담임셋', '01070000005', 'homeroom'), (select id from t1 where k = 'adm2')], null, pg_temp.fx('ta'))$$, 'WC076');
select pg_temp.expect_int('실패한 삭제는 아무도 지우지 않는다',
  (select count(*) from public.teachers where phone = '01070000005' and deleted_at is not null), 0);

-- ---------------------------------------------------------------------
-- fn_assignment_set
-- ---------------------------------------------------------------------
insert into t1 values ('a1', pg_temp.reg('ta', '배정교사', '01070000010', 'homeroom', '[{"grade":"고2","name":"1"}]'));
insert into t1 values ('a2', pg_temp.reg('ta', '다른교사', '01070000011', 'homeroom', '[{"grade":"고2","name":"2"}]'));
create function pg_temp.cls(p_grade text, p_name text) returns uuid language sql as $$
  select c.id from public.classes c join public.tenants t on t.id = c.tenant_id and t.school_year = c.school_year
   where c.tenant_id = pg_temp.fx('ta') and c.grade = p_grade and c.name = p_name
$$;

select public.fn_assignment_set((select id from t1 where k = 'a1'), '[{"grade":"고2","name":"3반"}]'::jsonb, '{}', null, pg_temp.fx('ta'));
select pg_temp.expect_int('add 는 학급을 더한다(이름 정규화)',
  (select count(*) from public.teacher_class_assignments where teacher_id = (select id from t1 where k = 'a1')), 2);
select pg_temp.expect_ok('같은 학급을 다시 더해도 성공(중복 없음)',
  $$select public.fn_assignment_set((select id from t1 where k = 'a1'), '[{"grade":"고2","name":"3"}]'::jsonb, '{}', null, pg_temp.fx('ta'))$$);
select pg_temp.expect_int('중복 add 는 늘지 않는다',
  (select count(*) from public.teacher_class_assignments where teacher_id = (select id from t1 where k = 'a1')), 2);
select pg_temp.expect_error('다른 교사가 이미 담임인 학급은 23505',
  $$select public.fn_assignment_set((select id from t1 where k = 'a1'), '[{"grade":"고2","name":"2"}]'::jsonb, '{}', null, pg_temp.fx('ta'))$$, '23505');
select public.fn_assignment_set((select id from t1 where k = 'a1'), '[]'::jsonb, '{}', pg_temp.cls('고2', '3'), pg_temp.fx('ta'));
select pg_temp.expect_uuid('primary 지정은 그 학급 하나만 주담당으로 만든다',
  (select class_id from public.teacher_class_assignments where teacher_id = (select id from t1 where k = 'a1') and is_primary),
  pg_temp.cls('고2', '3'));
select pg_temp.expect_error('배정되지 않은 학급을 주담당으로 지정하면 WC093',
  $$select public.fn_assignment_set((select id from t1 where k = 'a1'), '[]'::jsonb, '{}', pg_temp.cls('고2', '2'), pg_temp.fx('ta'))$$, 'WC093');
select public.fn_assignment_set((select id from t1 where k = 'a1'), '[]'::jsonb, array[pg_temp.cls('고2', '3')], null, pg_temp.fx('ta'));
select pg_temp.expect_int('주담당 학급을 지워도 남은 학급이 주담당이 된다',
  (select count(*) from public.teacher_class_assignments where teacher_id = (select id from t1 where k = 'a1') and is_primary), 1);
select pg_temp.expect_error('담임의 마지막 학급 제거는 WC092',
  $$select public.fn_assignment_set((select id from t1 where k = 'a1'), '[]'::jsonb, array[pg_temp.cls('고2', '1')], null, pg_temp.fx('ta'))$$, 'WC092');
select pg_temp.expect_ok('학급을 더하면서 마지막 학급을 바꾸는 것은 가능',
  $$select public.fn_assignment_set((select id from t1 where k = 'a1'), '[{"grade":"고2","name":"5"}]'::jsonb, array[pg_temp.cls('고2', '1')], null, pg_temp.fx('ta'))$$);
select pg_temp.expect_int('교체 뒤에도 학급은 하나',
  (select count(*) from public.teacher_class_assignments where teacher_id = (select id from t1 where k = 'a1')), 1);
select pg_temp.expect_error('없는 교사는 WC088',
  $$select public.fn_assignment_set(gen_random_uuid(), '[]'::jsonb, '{}', null, pg_temp.fx('ta'))$$, 'WC088');

-- ---------------------------------------------------------------------
-- 기관 범위: 다른 기관의 교사는 없는 것처럼 WC088 이고 아무것도 바뀌지 않는다(행을 잠근 뒤 검사)
-- ---------------------------------------------------------------------
select pg_temp.expect_error('다른 기관 기준 set_status 는 WC088',
  $$select public.fn_teacher_set_status((select id from t1 where k = 'a1'), 'inactive', null, pg_temp.fx('tb'))$$, 'WC088');
select pg_temp.expect_text('다른 기관 기준이면 상태가 그대로',
  (select status from public.teachers where id = (select id from t1 where k = 'a1')), 'active');
select pg_temp.expect_error('다른 기관 기준 soft_delete 는 WC088',
  $$select * from public.fn_teacher_soft_delete(array[(select id from t1 where k = 'a1')], null, pg_temp.fx('tb'))$$, 'WC088');
select pg_temp.expect_bool('다른 기관 기준이면 삭제되지 않는다',
  (select deleted_at is null from public.teachers where id = (select id from t1 where k = 'a1')), true);
select pg_temp.expect_error('다른 기관 기준 assignment_set 은 WC088',
  $$select public.fn_assignment_set((select id from t1 where k = 'a1'), '[{"grade":"고2","name":"9"}]'::jsonb, '{}', null, pg_temp.fx('tb'))$$, 'WC088');
select pg_temp.expect_error('다른 기관 기준 password_set 은 WC088',
  $$select public.fn_teacher_password_set((select id from t1 where k = 'a1'), pg_temp.fx('tb'))$$, 'WC088');

-- ---------------------------------------------------------------------
-- 클라이언트 role 차단
-- ---------------------------------------------------------------------
grant execute on function pg_temp.expect_error(text, text, text) to anon, authenticated;
set local role anon;
select pg_temp.expect_error('anon 은 fn_teacher_attach_account 실행 불가',
  $$select public.fn_teacher_attach_account(null, null, 'x', 'x')$$, '42501');
select pg_temp.expect_error('anon 은 fn_assignment_set 실행 불가',
  $$select public.fn_assignment_set(null, '[]'::jsonb, '{}', null, null)$$, '42501');
reset role;
set local role authenticated;
select pg_temp.expect_error('authenticated 는 fn_teacher_soft_delete 실행 불가',
  $$select * from public.fn_teacher_soft_delete('{}', null, null)$$, '42501');
select pg_temp.expect_error('authenticated 는 fn_teacher_set_status 실행 불가',
  $$select public.fn_teacher_set_status(null, 'inactive', null, null)$$, '42501');
select pg_temp.expect_error('authenticated 는 fn_teacher_password_set 실행 불가',
  $$select public.fn_teacher_password_set(null)$$, '42501');
reset role;

do $$ begin raise notice '=== b2b-teacher-accounts.spec: 전체 통과 ==='; end $$;

rollback;
