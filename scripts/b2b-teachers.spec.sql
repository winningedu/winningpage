-- =====================================================================
-- B2B 기반 4: 선생님, 담당 학급, 가드 트리거, 로그인 아이디, 등록 함수 SQL 스펙 (T4)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-teachers.spec.sql
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

create temp table fx (k text primary key, v uuid);
insert into fx values
  ('ta', pg_temp.mk_tenant('T4AAAAAA', '학교')),
  ('tb', pg_temp.mk_tenant('T4BBBBBB', '학교'));
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;

-- 교사 직접 insert 헬퍼. login_id 는 선택.
create function pg_temp.mk_teacher(
  p_tenant text, p_name text, p_phone text,
  p_role text default 'homeroom', p_login text default null
) returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.teachers (tenant_id, name, phone, role, login_id)
  values (pg_temp.fx(p_tenant), p_name, p_phone, p_role, p_login)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 전화번호: 같은 기관 안에서만 유일(삭제되지 않은 행 기준)
-- ---------------------------------------------------------------------
select pg_temp.mk_teacher('ta', '김하나', '01011110001');
select pg_temp.expect_error('같은 기관 같은 전화번호 두 번째 활성 행 거부',
  $$select pg_temp.mk_teacher('ta', '이둘', '01011110001')$$, '23505');
select pg_temp.expect_ok('다른 기관은 같은 전화번호 가능',
  $$select pg_temp.mk_teacher('tb', '김하나', '01011110001')$$);
select pg_temp.expect_error('전화번호 형식 오류 거부',
  $$select pg_temp.mk_teacher('ta', '삼', '010-1111-0002')$$, '23514');
select pg_temp.expect_error('빈 이름 거부',
  $$select pg_temp.mk_teacher('ta', ' ', '01011110003')$$, '23514');
select pg_temp.expect_error('role 목록 밖 거부',
  $$select pg_temp.mk_teacher('ta', '사', '01011110004', 'principal')$$, '23514');
update public.teachers set deleted_at = now()
  where tenant_id = pg_temp.fx('ta') and phone = '01011110001';
select pg_temp.expect_ok('삭제된 행의 전화번호는 다시 쓸 수 있다',
  $$select pg_temp.mk_teacher('ta', '김하나', '01011110001')$$);

-- ---------------------------------------------------------------------
-- 로그인 아이디: 형식, 기관 코드 접두, 변경 불가, 삭제 후에도 재사용 불가
-- ---------------------------------------------------------------------
select pg_temp.mk_teacher('ta', '아이디', '01022220001');
select pg_temp.expect_error('로그인 아이디 형식 오류 거부',
  $$update public.teachers set login_id = 'T4AAAAAA0LOWER'
    where phone = '01022220001' and tenant_id = pg_temp.fx('ta')$$, '23514');
select pg_temp.expect_error('기관 코드와 다른 접두 거부',
  $$update public.teachers set login_id = 'T4BBBBBBAAAAAA'
    where phone = '01022220001' and tenant_id = pg_temp.fx('ta')$$, '23514');
select pg_temp.expect_ok('null 에서 처음 지정은 가능',
  $$update public.teachers set login_id = 'T4AAAAAAAAAAAA'
    where phone = '01022220001' and tenant_id = pg_temp.fx('ta')$$);
select pg_temp.expect_error('지정된 로그인 아이디 변경 거부',
  $$update public.teachers set login_id = 'T4AAAAAABBBBBB'
    where phone = '01022220001' and tenant_id = pg_temp.fx('ta')$$, '23514');
select pg_temp.expect_error('로그인 아이디를 null 로 되돌리기 거부',
  $$update public.teachers set login_id = null
    where phone = '01022220001' and tenant_id = pg_temp.fx('ta')$$, '23514');
select pg_temp.expect_error('기관 변경 거부',
  $$update public.teachers set tenant_id = pg_temp.fx('tb')
    where phone = '01022220001' and tenant_id = pg_temp.fx('ta')$$, '23514');
select pg_temp.expect_error('같은 로그인 아이디 두 번째 행 거부',
  $$select pg_temp.mk_teacher('ta', '중복', '01022220002', 'homeroom', 'T4AAAAAAAAAAAA')$$, '23505');
select pg_temp.expect_bool('사용 중 아이디는 사용 불가',
  public.is_username_available('T4AAAAAAAAAAAA'), false);
select pg_temp.expect_bool('소문자로 물어도 사용 불가',
  public.is_username_available('t4aaaaaaaaaaaa'), false);
select pg_temp.expect_bool('쓰지 않은 아이디는 사용 가능',
  public.is_username_available('t4never-used-id'), true);
update public.teachers set deleted_at = now()
  where phone = '01022220001' and tenant_id = pg_temp.fx('ta');
select pg_temp.expect_error('삭제된 교사의 로그인 아이디는 다시 넣을 수 없다',
  $$select pg_temp.mk_teacher('ta', '재사용', '01022220003', 'homeroom', 'T4AAAAAAAAAAAA')$$, '23505');
select pg_temp.expect_bool('삭제된 교사의 아이디는 사용 불가로 남는다',
  public.is_username_available('T4AAAAAAAAAAAA'), false);

-- 계정 상태 CHECK
select pg_temp.mk_teacher('ta', '계정', '01033330001');
select pg_temp.expect_error('profile_id 는 login_id 가 있어야 한다',
  $$update public.teachers set profile_id = gen_random_uuid()
    where phone = '01033330001' and tenant_id = pg_temp.fx('ta')$$, '23514');
select pg_temp.expect_error('must_change_password 와 임시 비밀번호 해시는 함께',
  $$update public.teachers set must_change_password = true
    where phone = '01033330001' and tenant_id = pg_temp.fx('ta')$$, '23514');
select pg_temp.expect_ok('임시 비밀번호 해시와 must_change_password 함께 지정',
  $$update public.teachers set must_change_password = true, temp_password_hash = 'h'
    where phone = '01033330001' and tenant_id = pg_temp.fx('ta')$$);

-- ---------------------------------------------------------------------
-- 로그인 아이디 생성기
-- ---------------------------------------------------------------------
select pg_temp.expect_bool('생성된 아이디는 기관 코드 + 6자 형식',
  public.fn_generate_teacher_login_id(pg_temp.fx('ta')) ~ '^T4AAAAAA[A-HJ-KM-NP-Z2-9]{6}$', true);
select pg_temp.expect_bool('생성할 때마다 값이 다르다',
  public.fn_generate_teacher_login_id(pg_temp.fx('ta')) <> public.fn_generate_teacher_login_id(pg_temp.fx('ta')), true);

-- ---------------------------------------------------------------------
-- 담당 학급: 학급당 담임 하나, 다른 기관 학급은 FK 로 거부
-- ---------------------------------------------------------------------
create temp table ids (k text primary key, v uuid);
insert into ids values
  ('c1', public.fn_class_ensure(pg_temp.fx('ta'), 2026, '고1', null, '1')),
  ('c2', public.fn_class_ensure(pg_temp.fx('ta'), 2026, '고1', null, '2')),
  ('cb', public.fn_class_ensure(pg_temp.fx('tb'), 2026, '고1', null, '1')),
  ('h1', pg_temp.mk_teacher('ta', '담임일', '01044440001')),
  ('h2', pg_temp.mk_teacher('ta', '담임이', '01044440002'));
create function pg_temp.ids(p_k text) returns uuid language sql as $$ select v from ids where k = p_k $$;

select pg_temp.expect_ok('담임 배정',
  $$insert into public.teacher_class_assignments (teacher_id, tenant_id, class_id)
    values (pg_temp.ids('h1'), pg_temp.fx('ta'), pg_temp.ids('c1'))$$);
select pg_temp.expect_error('한 학급에 두 번째 담임 거부',
  $$insert into public.teacher_class_assignments (teacher_id, tenant_id, class_id)
    values (pg_temp.ids('h2'), pg_temp.fx('ta'), pg_temp.ids('c1'))$$, '23505');
select pg_temp.expect_error('다른 기관 학급 배정은 FK 로 거부',
  $$insert into public.teacher_class_assignments (teacher_id, tenant_id, class_id)
    values (pg_temp.ids('h1'), pg_temp.fx('ta'), pg_temp.ids('cb'))$$, '23503');
select pg_temp.expect_error('교사와 다른 기관 id 로 배정 거부',
  $$insert into public.teacher_class_assignments (teacher_id, tenant_id, class_id)
    values (pg_temp.ids('h1'), pg_temp.fx('tb'), pg_temp.ids('cb'))$$, '23503');
select pg_temp.expect_ok('주담당은 교사당 하나',
  $$update public.teacher_class_assignments set is_primary = true
    where teacher_id = pg_temp.ids('h1')$$);
select pg_temp.expect_ok('두 번째 학급 배정(비주담당)',
  $$insert into public.teacher_class_assignments (teacher_id, tenant_id, class_id)
    values (pg_temp.ids('h1'), pg_temp.fx('ta'), pg_temp.ids('c2'))$$);
select pg_temp.expect_error('교사당 주담당 두 개 거부',
  $$update public.teacher_class_assignments set is_primary = true
    where teacher_id = pg_temp.ids('h1') and class_id = pg_temp.ids('c2')$$, '23505');

-- ---------------------------------------------------------------------
-- 마지막 학교 관리자 보호
-- ---------------------------------------------------------------------
insert into ids values ('adm1', pg_temp.mk_teacher('tb', '관리자일', '01055550001', 'school_admin'));
select pg_temp.expect_error('마지막 관리자 비활성화 거부',
  $$update public.teachers set status = 'inactive' where id = pg_temp.ids('adm1')$$, 'WC076');
select pg_temp.expect_error('마지막 관리자 소프트 삭제 거부',
  $$update public.teachers set deleted_at = now() where id = pg_temp.ids('adm1')$$, 'WC076');
select pg_temp.expect_error('마지막 관리자 담임 강등 거부',
  $$update public.teachers set role = 'homeroom' where id = pg_temp.ids('adm1')$$, 'WC076');
select pg_temp.expect_error('마지막 관리자 행 삭제 거부',
  $$delete from public.teachers where id = pg_temp.ids('adm1')$$, 'WC076');
insert into ids values ('adm2', pg_temp.mk_teacher('tb', '관리자이', '01055550002', 'school_admin'));
select pg_temp.expect_ok('관리자가 둘이면 하나는 비활성화 가능',
  $$update public.teachers set status = 'inactive' where id = pg_temp.ids('adm1')$$);
select pg_temp.expect_error('이제 남은 하나가 마지막이라 삭제 거부',
  $$update public.teachers set deleted_at = now() where id = pg_temp.ids('adm2')$$, 'WC076');
select pg_temp.expect_ok('비활성 관리자는 마지막 관리자가 아니므로 삭제 가능',
  $$delete from public.teachers where id = pg_temp.ids('adm1')$$);
select pg_temp.expect_ok('담임은 자유롭게 삭제 가능',
  $$delete from public.teachers where id = pg_temp.ids('h2')$$);

-- ---------------------------------------------------------------------
-- fn_teacher_register: created, classes_added, promoted, 전화번호 충돌
-- ---------------------------------------------------------------------
create temp table reg (k text primary key, teacher_id uuid, verdict text);
insert into reg
  select 'r1', teacher_id, verdict from public.fn_teacher_register(
    pg_temp.fx('ta'), '등록교사', '01066660001', 'homeroom',
    '[{"grade":"고2","name":"3반"}]'::jsonb, null);
select pg_temp.expect_text('신규 등록은 created', (select verdict from reg where k = 'r1'), 'created');
select pg_temp.expect_bool('신규 등록은 기관 코드 접두 로그인 아이디를 받는다',
  (select login_id from public.teachers where id = (select teacher_id from reg where k = 'r1')) ~ '^T4AAAAAA[A-HJ-KM-NP-Z2-9]{6}$', true);
select pg_temp.expect_int('신규 등록은 학급 하나를 배정',
  (select count(*) from public.teacher_class_assignments where teacher_id = (select teacher_id from reg where k = 'r1')), 1);
select pg_temp.expect_bool('첫 학급은 주담당',
  (select is_primary from public.teacher_class_assignments where teacher_id = (select teacher_id from reg where k = 'r1')), true);
select pg_temp.expect_text('등록된 학급은 현재 학년도 3 으로 정규화',
  (select c.name from public.teacher_class_assignments a join public.classes c on c.id = a.class_id
    where a.teacher_id = (select teacher_id from reg where k = 'r1')), '3');
select pg_temp.expect_int('학급 학년도는 기관의 현재 학년도',
  (select c.school_year from public.teacher_class_assignments a join public.classes c on c.id = a.class_id
    where a.teacher_id = (select teacher_id from reg where k = 'r1')),
  (select school_year from public.tenants where id = pg_temp.fx('ta')));

insert into reg
  select 'r2', teacher_id, verdict from public.fn_teacher_register(
    pg_temp.fx('ta'), '등록교사', '01066660001', 'homeroom',
    '[{"grade":"고2","name":"4"}]'::jsonb, null);
select pg_temp.expect_text('같은 사람 다시 등록은 classes_added', (select verdict from reg where k = 'r2'), 'classes_added');
select pg_temp.expect_bool('같은 사람은 같은 교사 행',
  (select teacher_id from reg where k = 'r1') = (select teacher_id from reg where k = 'r2'), true);
select pg_temp.expect_int('같은 사람에게 학급이 추가된다',
  (select count(*) from public.teacher_class_assignments where teacher_id = (select teacher_id from reg where k = 'r1')), 2);
select pg_temp.expect_int('추가된 학급은 주담당이 아니다',
  (select count(*) from public.teacher_class_assignments
    where teacher_id = (select teacher_id from reg where k = 'r1') and is_primary), 1);

insert into reg
  select 'r3', teacher_id, verdict from public.fn_teacher_register(
    pg_temp.fx('ta'), '등록교사', '01066660001', 'homeroom',
    '[{"grade":"고2","name":"4"}]'::jsonb, null);
select pg_temp.expect_text('같은 학급 반복 등록도 classes_added(중복 없음)', (select verdict from reg where k = 'r3'), 'classes_added');
select pg_temp.expect_int('반복 등록은 학급을 늘리지 않는다',
  (select count(*) from public.teacher_class_assignments where teacher_id = (select teacher_id from reg where k = 'r1')), 2);

select pg_temp.expect_error('같은 전화번호 다른 이름은 WC075',
  $$select * from public.fn_teacher_register(pg_temp.fx('ta'), '다른사람', '01066660001', 'homeroom', '[]'::jsonb, null)$$, 'WC075');
select pg_temp.expect_error('다른 교사가 이미 담임인 학급은 23505',
  $$select * from public.fn_teacher_register(pg_temp.fx('ta'), '새교사', '01066660002', 'homeroom',
      '[{"grade":"고2","name":"3"}]'::jsonb, null)$$, '23505');
select pg_temp.expect_int('실패한 등록은 교사 행을 남기지 않는다',
  (select count(*) from public.teachers where phone = '01066660002' and tenant_id = pg_temp.fx('ta')), 0);

insert into reg
  select 'r4', teacher_id, verdict from public.fn_teacher_register(
    pg_temp.fx('ta'), '등록교사', '01066660001', 'school_admin', '[]'::jsonb, null);
select pg_temp.expect_text('같은 사람 관리자 발급은 promoted', (select verdict from reg where k = 'r4'), 'promoted');
select pg_temp.expect_text('승격 후 role',
  (select role from public.teachers where id = (select teacher_id from reg where k = 'r1')), 'school_admin');
select pg_temp.expect_bool('승격은 같은 행과 로그인 아이디를 유지',
  (select teacher_id from reg where k = 'r4') = (select teacher_id from reg where k = 'r1'), true);

-- 이름은 앞뒤 공백을 무시하고 같은 사람으로 본다
insert into reg
  select 'r5', teacher_id, verdict from public.fn_teacher_register(
    pg_temp.fx('ta'), ' 등록교사 ', '01066660001', 'homeroom', '[]'::jsonb, null);
select pg_temp.expect_text('이름 앞뒤 공백 무시', (select verdict from reg where k = 'r5'), 'classes_added');
select pg_temp.expect_text('담임으로 다시 등록해도 관리자를 강등하지 않는다',
  (select role from public.teachers where id = (select teacher_id from reg where k = 'r1')), 'school_admin');

-- 직책, 담당 이메일, 일반전화(사 #159-q3): 등록할 때 같이 저장하고, 같은 사람을 다시 등록할 때 값이 있으면 고친다
insert into reg
  select 'r6', teacher_id, verdict from public.fn_teacher_register(
    pg_temp.fx('ta'), '관리자둘', '01066660010', 'school_admin', '[]'::jsonb, null,
    '교감', 'admin2@school.kr', '0212345678');
select pg_temp.expect_text('등록 시 직책, 이메일, 일반전화가 저장된다',
  (select position || '/' || email || '/' || landline from public.teachers where id = (select teacher_id from reg where k = 'r6')),
  '교감/admin2@school.kr/0212345678');
select pg_temp.expect_text('값 없이 다시 등록해도 저장된 값은 그대로다',
  (select position || '/' || email || '/' || landline from public.fn_teacher_register(
      pg_temp.fx('ta'), '관리자둘', '01066660010', 'school_admin', '[]'::jsonb, null) r
    join public.teachers t on t.id = r.teacher_id),
  '교감/admin2@school.kr/0212345678');
select * from public.fn_teacher_register(
  pg_temp.fx('ta'), '관리자둘', '01066660010', 'school_admin', '[]'::jsonb, null, '교장', null, null);
select pg_temp.expect_text('값을 주고 다시 등록하면 그 값만 고친다',
  (select position || '/' || email || '/' || landline from public.teachers where id = (select teacher_id from reg where k = 'r6')),
  '교장/admin2@school.kr/0212345678');

-- ---------------------------------------------------------------------
-- 클라이언트 role 차단
-- ---------------------------------------------------------------------
grant execute on function pg_temp.expect_error(text, text, text) to anon, authenticated;
set local role anon;
select pg_temp.expect_error('anon 은 teachers 조회 불가',
  $$select count(*) from public.teachers$$, '42501');
select pg_temp.expect_error('anon 은 fn_teacher_register 실행 불가',
  $$select * from public.fn_teacher_register(null, 'a', '01000000000', 'homeroom', '[]'::jsonb, null)$$, '42501');
reset role;
set local role authenticated;
select pg_temp.expect_error('authenticated 는 teacher_class_assignments 조회 불가',
  $$select count(*) from public.teacher_class_assignments$$, '42501');
select pg_temp.expect_error('authenticated 는 fn_generate_teacher_login_id 실행 불가',
  $$select public.fn_generate_teacher_login_id(null)$$, '42501');
reset role;

do $$ begin raise notice '=== b2b-teachers.spec: 전체 통과 ==='; end $$;

rollback;
