-- =====================================================================
-- B2B 기반 9 (A): 학적, 학적 변경 이력, 가입/수정 함수, 본인 행 정책 SQL 스펙 (T18)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-enrollments.spec.sql
--
-- 전체가 한 트랜잭션이고 마지막에 ROLLBACK 한다. 어떤 데이터도 남기지
-- 않는다. 단언 실패는 예외로 터져 psql 이 비정상 종료(ON_ERROR_STOP)한다.
-- =====================================================================
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

-- 주어진 SQL 이 want 로 실패하고 DETAIL 이 want_detail 인지 단언한다.
create function pg_temp.expect_detail(t text, p_sql text, want text, want_detail text) returns void
language plpgsql as $$
declare
  v_state text;
  v_detail text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_detail = pg_exception_detail;
    if v_state is distinct from want or v_detail is distinct from want_detail then
      raise exception '[FAIL] %: sqlstate %, detail %, want % / %', t, v_state, v_detail, want, want_detail;
    end if;
    raise notice '[PASS] % = % (%)', t, want, want_detail;
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


create function pg_temp.mk_user(p_email text) returns uuid
language plpgsql as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values (
    v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_email, 'x', now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
  );
  insert into public.profiles (id, name, role, email, member_type)
  values (v_id, p_email, 'user', p_email, 'student')
  on conflict (id) do nothing;
  insert into public.student_profiles (profile_id, grade) values (v_id, '고1');
  return v_id;
end $$;

create temp table fx (k text primary key, v uuid);
insert into public.tenants (code, name, region, org_type, tier)
  values ('T9AAAAAA', 't9-a', '서울', '학교', 'B'),
         ('T9BBBBBB', 't9-b', '서울', '학교', 'B'),
         ('T9CCCCCC', 't9-c', '서울', '사기업', 'B');
insert into fx select 'ta', id from public.tenants where code = 'T9AAAAAA';
insert into fx select 'tb', id from public.tenants where code = 'T9BBBBBB';
insert into fx select 'tc', id from public.tenants where code = 'T9CCCCCC';
insert into fx values
  ('s1', pg_temp.mk_user('t9-s1@t.local')), ('s2', pg_temp.mk_user('t9-s2@t.local')),
  ('s3', pg_temp.mk_user('t9-s3@t.local')), ('s4', pg_temp.mk_user('t9-s4@t.local')),
  ('s5', pg_temp.mk_user('t9-s5@t.local')), ('s6', pg_temp.mk_user('t9-s6@t.local')),
  ('s7', pg_temp.mk_user('t9-s7@t.local')),
  ('actor', pg_temp.mk_user('t9-actor@t.local'));
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;

create function pg_temp.year() returns integer language sql as $$
  select school_year from public.tenants where code = 'T9AAAAAA'
$$;

-- 학급 만들기. p_tenant 는 fx 키.
create function pg_temp.mk_class(p_tenant text, p_year integer, p_grade text, p_name text) returns uuid
language sql as $$
  select public.fn_class_ensure(pg_temp.fx(p_tenant), p_year, p_grade, null, p_name)
$$;

create temp table cls (k text primary key, v uuid);
insert into cls values
  ('a1', pg_temp.mk_class('ta', pg_temp.year(), '고1', '1')),
  ('a2', pg_temp.mk_class('ta', pg_temp.year(), '고1', '2')),
  ('a_old', pg_temp.mk_class('ta', pg_temp.year() - 1, '고1', '1')),
  ('a_g2', pg_temp.mk_class('ta', pg_temp.year(), '고2', '1')),
  ('b1', pg_temp.mk_class('tb', pg_temp.year(), '고1', '1'));
create function pg_temp.cls(p_k text) returns uuid language sql as $$ select v from cls where k = p_k $$;

-- 학적 직접 insert 헬퍼
create function pg_temp.enroll(p_student text, p_tenant text, p_year integer, p_grade text, p_class text, p_number integer)
returns void language plpgsql as $$
begin
  insert into public.student_enrollments (tenant_id, student_id, school_year, grade, class_id, number)
  values (pg_temp.fx(p_tenant), pg_temp.fx(p_student), p_year, p_grade,
    case when p_class is not null then pg_temp.cls(p_class) end, p_number);
end $$;

-- ---------------------------------------------------------------------
-- 학적 테이블: 학생당 학년도 한 행, 번호 유일, 학급 복합 FK
-- ---------------------------------------------------------------------
select pg_temp.expect_ok('학적 insert',
  $$select pg_temp.enroll('s1', 'ta', pg_temp.year(), '고1', 'a1', 1)$$);
select pg_temp.expect_error('같은 학생 같은 학년도 두 번째 행 거부',
  $$select pg_temp.enroll('s1', 'ta', pg_temp.year(), '고1', 'a2', 2)$$, '23505');
select pg_temp.expect_ok('같은 학생 다른 학년도는 가능',
  $$select pg_temp.enroll('s1', 'ta', pg_temp.year() - 1, '고1', 'a_old', 1)$$);
select pg_temp.expect_error('같은 학급 같은 번호 거부',
  $$select pg_temp.enroll('s2', 'ta', pg_temp.year(), '고1', 'a1', 1)$$, '23505');
select pg_temp.expect_ok('번호 null 은 같은 학급에 여러 명 가능',
  $$select pg_temp.enroll('s2', 'ta', pg_temp.year(), '고1', 'a1', null)$$);
select pg_temp.expect_ok('번호 null 두 번째도 가능',
  $$select pg_temp.enroll('s3', 'ta', pg_temp.year(), '고1', 'a1', null)$$);
select pg_temp.expect_error('다른 기관의 학급 거부',
  $$select pg_temp.enroll('s4', 'ta', pg_temp.year(), '고1', 'b1', 5)$$, '23503');
select pg_temp.expect_error('다른 학년도의 학급 거부',
  $$select pg_temp.enroll('s4', 'ta', pg_temp.year(), '고1', 'a_old', 5)$$, '23503');
select pg_temp.expect_error('다른 학년의 학급 거부',
  $$select pg_temp.enroll('s4', 'ta', pg_temp.year(), '고1', 'a_g2', 5)$$, '23503');
select pg_temp.expect_error('학급이 있는데 학년이 없으면 거부',
  $$select pg_temp.enroll('s4', 'ta', pg_temp.year(), null, 'a1', 5)$$, '23514');
select pg_temp.expect_error('번호 0 거부',
  $$select pg_temp.enroll('s4', 'ta', pg_temp.year(), '고1', 'a1', 0)$$, '23514');
select pg_temp.expect_error('번호 100 거부',
  $$select pg_temp.enroll('s4', 'ta', pg_temp.year(), '고1', 'a1', 100)$$, '23514');
select pg_temp.expect_error('학년 목록 밖 거부',
  $$select pg_temp.enroll('s4', 'ta', pg_temp.year(), '초1', null, null)$$, '23514');
select pg_temp.expect_ok('학급 없는 학적(풀)도 가능',
  $$select pg_temp.enroll('s4', 'ta', pg_temp.year(), '고1', null, null)$$);
select pg_temp.expect_error('졸업인데 graduated_at 없음 거부',
  $$update public.student_enrollments set status = 'graduated' where student_id = pg_temp.fx('s4')$$, '23514');
select pg_temp.expect_error('재학인데 graduated_at 있음 거부',
  $$update public.student_enrollments set graduated_at = now() where student_id = pg_temp.fx('s4')$$, '23514');
select pg_temp.expect_ok('졸업과 graduated_at 은 함께 가능',
  $$update public.student_enrollments set status = 'graduated', graduated_at = now() where student_id = pg_temp.fx('s4')$$);
select pg_temp.expect_int('version 기본값 1',
  (select version from public.student_enrollments where student_id = pg_temp.fx('s1') and school_year = pg_temp.year()), 1);

-- ---------------------------------------------------------------------
-- 변경 이력 테이블: 신청 한 건, 거절 사유, 신청만 pending
-- ---------------------------------------------------------------------
create function pg_temp.chg(p_student text, p_kind text, p_status text, p_reject text default null)
returns void language plpgsql as $$
begin
  insert into public.enrollment_changes (tenant_id, student_id, school_year, kind, status, reject_reason)
  values (pg_temp.fx('ta'), pg_temp.fx(p_student), pg_temp.year(), p_kind, p_status, p_reject);
end $$;

select pg_temp.expect_ok('신청 pending', $$select pg_temp.chg('s1', 'request', 'pending')$$);
select pg_temp.expect_error('같은 학생 두 번째 pending 거부',
  $$select pg_temp.chg('s1', 'request', 'pending')$$, '23505');
select pg_temp.expect_ok('다른 학생 pending 가능', $$select pg_temp.chg('s2', 'request', 'pending')$$);
select pg_temp.expect_ok('applied 는 여러 개 가능', $$select pg_temp.chg('s1', 'admin_direct', 'applied')$$);
select pg_temp.expect_error('request 가 아닌 kind 의 pending 거부',
  $$select pg_temp.chg('s3', 'admin_direct', 'pending')$$, '23514');
select pg_temp.expect_error('거절 사유 없는 rejected 거부',
  $$select pg_temp.chg('s3', 'request', 'rejected')$$, '23514');
select pg_temp.expect_error('공백 거절 사유 거부',
  $$select pg_temp.chg('s3', 'request', 'rejected', '  ')$$, '23514');
select pg_temp.expect_ok('사유 있는 rejected 가능',
  $$select pg_temp.chg('s3', 'request', 'rejected', '번호 중복')$$);
select pg_temp.expect_error('kind 목록 밖 거부', $$select pg_temp.chg('s3', 'magic', 'applied')$$, '23514');
select pg_temp.expect_error('reason 목록 밖 거부',
  $$insert into public.enrollment_changes (tenant_id, student_id, school_year, kind, status, reason)
    values (pg_temp.fx('ta'), pg_temp.fx('s3'), pg_temp.year(), 'admin_direct', 'applied', 'whim')$$, '23514');

-- ---------------------------------------------------------------------
-- RLS: 학생은 본인 행만 읽고, 쓰지 못한다
-- ---------------------------------------------------------------------
grant execute on function pg_temp.expect_error(text, text, text) to anon, authenticated;
grant execute on function pg_temp.expect_int(text, bigint, bigint) to authenticated;
grant execute on function pg_temp.fx(text) to authenticated;
select set_config('request.jwt.claim.sub', pg_temp.fx('s1')::text, true);
set local role authenticated;
select pg_temp.expect_int('학생 s1 은 본인 학적 2행만 보인다',
  (select count(*) from public.student_enrollments), 2);
select pg_temp.expect_int('학생 s1 은 본인 이력 2행만 보인다',
  (select count(*) from public.enrollment_changes), 2);
select pg_temp.expect_error('학생은 학적 insert 불가',
  $$insert into public.student_enrollments (tenant_id, student_id, school_year)
    select tenant_id, student_id, 2000 from public.student_enrollments limit 1$$, '42501');
select pg_temp.expect_error('학생은 학적 update 불가',
  $$update public.student_enrollments set number = 9$$, '42501');
select pg_temp.expect_error('학생은 이력 insert 불가',
  $$insert into public.enrollment_changes (tenant_id, student_id, school_year, kind, status)
    select tenant_id, student_id, school_year, 'admin_direct', 'applied' from public.enrollment_changes limit 1$$, '42501');
reset role;
set local role anon;
select pg_temp.expect_error('anon 은 학적 조회 불가', $$select count(*) from public.student_enrollments$$, '42501');
select pg_temp.expect_error('anon 은 이력 조회 불가', $$select count(*) from public.enrollment_changes$$, '42501');
reset role;

-- ---------------------------------------------------------------------
-- fn_enrollment_join: 가입 시 학적 만들기, 학급 없는 학적에 스스로 배정
-- ---------------------------------------------------------------------
create function pg_temp.sp_grade(p_student text) returns text language sql as $$
  select grade from public.student_profiles where profile_id = pg_temp.fx(p_student)
$$;
create function pg_temp.enr_s(p_student text, p_year integer default null) returns text language sql as $$
  select coalesce(e.grade, '-') || '/' || coalesce(c.name, '-') || '/' || coalesce(e.number::text, '-')
    || '/v' || e.version
  from public.student_enrollments e left join public.classes c on c.id = e.class_id
  where e.student_id = pg_temp.fx(p_student) and e.school_year = coalesce(p_year, pg_temp.year())
$$;
create function pg_temp.chg_s(p_student text, p_kind text) returns text language sql as $$
  select count(*) || ':' || coalesce(string_agg(status || '/' || coalesce(reason, '-'), ',' order by created_at), '')
  from public.enrollment_changes where student_id = pg_temp.fx(p_student) and kind = p_kind
$$;

select pg_temp.expect_text('join: 학급과 번호로 가입(03 은 3 으로 정규화)',
  (select e.class_id is not null and e.version = 1 from public.fn_enrollment_join(
     pg_temp.fx('s5'), pg_temp.fx('ta'), '고2', null, '03', 7::smallint) e)::text, 'true');
select pg_temp.expect_text('join: 학적 행', pg_temp.enr_s('s5'), '고2/3/7/v1');
select pg_temp.expect_text('join: student_profiles.grade 동기화', pg_temp.sp_grade('s5'), '고2');
select pg_temp.expect_text('join: signup applied auto 이력 1건', pg_temp.chg_s('s5', 'signup'), '1:applied/auto');

select pg_temp.expect_error('join: 같은 번호 거부(WC077)',
  $$select * from public.fn_enrollment_join(pg_temp.fx('s6'), pg_temp.fx('ta'), '고2', null, '3', 7::smallint)$$, 'WC077');
select pg_temp.expect_detail('join: 번호 중복 에러는 그 번호를 쓰는 학생 이름을 DETAIL 로 알려준다',
  $$select * from public.fn_enrollment_join(pg_temp.fx('s6'), pg_temp.fx('ta'), '고2', null, '3', 7::smallint)$$,
  'WC077', 't9-s5@t.local');
select pg_temp.expect_text('join: 거부되면 학적도 이력도 남지 않는다',
  (select count(*) from public.student_enrollments where student_id = pg_temp.fx('s6'))::text
  || ':' || (select count(*) from public.enrollment_changes where student_id = pg_temp.fx('s6')), '0:0');

-- 학생이 아닌 계정(member_type 이 student 가 아님)은 가입도 배정도 못 한다(WC094)
insert into fx values ('s8', pg_temp.mk_user('t9-s8@t.local'));
update public.profiles set member_type = 'parent' where id = pg_temp.fx('s8');
select pg_temp.expect_error('join: 학생이 아닌 계정은 거부(WC094)',
  $$select * from public.fn_enrollment_join(pg_temp.fx('s8'), pg_temp.fx('ta'), '고1', null, '1', 20::smallint)$$, 'WC094');
update public.profiles set member_type = null where id = pg_temp.fx('s8');
select pg_temp.expect_error('join: member_type 이 비어 있어도 거부(WC094)',
  $$select * from public.fn_enrollment_join(pg_temp.fx('s8'), pg_temp.fx('ta'), '고1', null, '1', 20::smallint)$$, 'WC094');
select pg_temp.expect_int('join: 거부되면 학적이 없다',
  (select count(*) from public.student_enrollments where student_id = pg_temp.fx('s8')), 0);

-- 학급 없이 가입하고(풀), 나중에 스스로 배정
select pg_temp.expect_ok('join: 학급 없이 가입',
  $$select * from public.fn_enrollment_join(pg_temp.fx('s6'), pg_temp.fx('ta'), '고1', null, null, null)$$);
select pg_temp.expect_text('join: 학급 없는 학적', pg_temp.enr_s('s6'), '고1/-/-/v1');
select pg_temp.expect_ok('join: 학급 null 이면 스스로 배정',
  $$select * from public.fn_enrollment_join(pg_temp.fx('s6'), pg_temp.fx('ta'), '고2', null, '4반', 8::smallint)$$);
select pg_temp.expect_text('join: 배정 결과와 version 증가', pg_temp.enr_s('s6'), '고2/4/8/v2');
select pg_temp.expect_text('join: self_assign 이력 1건', pg_temp.chg_s('s6', 'self_assign'), '1:applied/auto');
select pg_temp.expect_text('join: 학급 배정 후 grade 동기화', pg_temp.sp_grade('s6'), '고2');
select pg_temp.expect_error('join: 이미 학급이 있으면 거부(WC079)',
  $$select * from public.fn_enrollment_join(pg_temp.fx('s6'), pg_temp.fx('ta'), '고2', null, '5', 9::smallint)$$, 'WC079');

-- 학원 그룹
insert into public.class_groups (tenant_id, name) values (pg_temp.fx('tc'), '수능반');
select pg_temp.expect_ok('join: 그룹 이름은 대소문자와 앞뒤 공백을 무시하고 찾는다',
  $$select * from public.fn_enrollment_join(pg_temp.fx('s7'), pg_temp.fx('tc'), '고3', ' 수능반 ', ' A 1 ', 1::smallint)$$);
select pg_temp.expect_bool('join: 학원 학급은 그룹에 묶이고 이름이 A1',
  (select c.name = 'A1' and c.group_id is not null
     from public.student_enrollments e join public.classes c on c.id = e.class_id
    where e.student_id = pg_temp.fx('s7') and e.tenant_id = pg_temp.fx('tc')), true);
select pg_temp.expect_error('join: 등록되지 않은 그룹 거부(WC080)',
  $$select * from public.fn_enrollment_join(pg_temp.fx('s7'), pg_temp.fx('tc'), '고3', '없는반', '1', null)$$, 'WC080');

-- ---------------------------------------------------------------------
-- fn_enrollment_update: 버전 검사, 번호 유일, 학년 동기화, 이력
-- ---------------------------------------------------------------------
create function pg_temp.upd(p_student text, p_version integer, p_grade text, p_class text, p_number integer,
  p_kind text default 'homeroom_edit', p_reason text default 'class_change', p_year integer default null,
  p_tenant text default 'ta', p_allowed text[] default null)
returns text language sql as $$
  select u.version::text from public.fn_enrollment_update(
    pg_temp.fx(p_student), p_version, p_grade,
    case when p_class is not null then pg_temp.cls(p_class) end, p_number::smallint,
    p_kind, p_reason, p_year, pg_temp.fx('actor'), pg_temp.fx(p_tenant),
    case when p_allowed is not null then (select array_agg(pg_temp.cls(k)) from unnest(p_allowed) k) end) u
$$;

-- s2 는 a1 반 번호 없음(version 1)
select pg_temp.expect_error('update: 오래된 version 거부(WC078)',
  $$select pg_temp.upd('s2', 0, '고1', 'a2', 3)$$, 'WC078');
select pg_temp.expect_text('update: 거부되면 그대로', pg_temp.enr_s('s2'), '고1/1/-/v1');
select pg_temp.expect_text('update: 성공하면 version 2', pg_temp.upd('s2', 1, '고1', 'a2', 3), '2');
select pg_temp.expect_text('update: 학급과 번호가 바뀐다', pg_temp.enr_s('s2'), '고1/2/3/v2');
select pg_temp.expect_text('update: 적용 이력 1건(homeroom_edit, class_change)',
  pg_temp.chg_s('s2', 'homeroom_edit'), '1:applied/class_change');
select pg_temp.expect_bool('update: 이력에 이전, 이후 값과 base_version 이 담긴다',
  (select from_class_id = pg_temp.cls('a1') and to_class_id = pg_temp.cls('a2')
      and from_number is null and to_number = 3 and from_grade = '고1' and to_grade = '고1'
      and base_version = 1 and decided_by = pg_temp.fx('actor') and decided_at is not null
     from public.enrollment_changes where student_id = pg_temp.fx('s2') and kind = 'homeroom_edit'), true);
select pg_temp.expect_error('update: 같은 반 같은 번호 거부(WC077)',
  $$select pg_temp.upd('s3', 1, '고1', 'a2', 3)$$, 'WC077');
select pg_temp.expect_detail('update: 번호 중복 에러도 쓰는 학생 이름을 DETAIL 로 알려준다',
  $$select pg_temp.upd('s3', 1, '고1', 'a2', 3)$$, 'WC077', 't9-s2@t.local');
select pg_temp.expect_error('update: 다른 기관 학급 거부(FK)',
  $$select pg_temp.upd('s3', 1, '고1', 'b1', 3)$$, '23503');
select pg_temp.expect_error('update: 학년과 맞지 않는 학급 거부(FK)',
  $$select pg_temp.upd('s3', 1, '고1', 'a_g2', 3)$$, '23503');
select pg_temp.expect_text('update: 실패한 시도는 이력을 남기지 않는다',
  pg_temp.chg_s('s3', 'homeroom_edit'), '0:');

select pg_temp.expect_text('update: 학년 변경(admin_direct)', pg_temp.upd('s3', 1, '고2', 'a_g2', 2, 'admin_direct', 'correction'), '2');
select pg_temp.expect_text('update: 올해 학적 학년 변경은 student_profiles.grade 로 동기화', pg_temp.sp_grade('s3'), '고2');
select pg_temp.expect_text('update: admin_direct 이력', pg_temp.chg_s('s3', 'admin_direct'), '1:applied/correction');

select pg_temp.expect_text('update: 학급을 비우는 pool_assign 도 가능(학급 null, 번호 null)',
  pg_temp.upd('s3', 2, '고2', null, null, 'pool_assign', 'transfer'), '3');

-- 학년도는 올해 또는 다음 해만 고칠 수 있다(P16)
select pg_temp.expect_error('update: 작년 학년도는 거부(22023)',
  $$select pg_temp.upd('s1', 1, '고2', null, null, 'admin_direct', 'correction', pg_temp.year() - 1)$$, '22023');
select pg_temp.expect_error('update: 내후년 학년도는 거부(22023)',
  $$select pg_temp.upd('s1', 1, '고2', null, null, 'admin_direct', 'correction', pg_temp.year() + 2)$$, '22023');
-- 다음 해 행이 없으면 만든다(올해 학적이 있는 학생만, version 은 비교하지 않는다)
select pg_temp.expect_text('update: 다음 해 행이 없으면 새로 만든다',
  pg_temp.upd('s1', 0, '고2', null, null, 'admin_direct', 'promotion', pg_temp.year() + 1), '1');
select pg_temp.expect_text('update: 만든 행의 학년도와 학년',
  (select school_year - pg_temp.year() || '/' || grade || '/' || status from public.student_enrollments
    where student_id = pg_temp.fx('s1') and school_year = pg_temp.year() + 1), '1/고2/active');
select pg_temp.expect_text('update: 다음 해 행은 student_profiles.grade 를 바꾸지 않는다', pg_temp.sp_grade('s1'), '고1');
select pg_temp.expect_text('update: 올해 행은 그대로', pg_temp.enr_s('s1'), '고1/1/1/v1');
select pg_temp.expect_int('update: 다음 해 행 생성도 이력이 남는다',
  (select count(*) from public.enrollment_changes where student_id = pg_temp.fx('s1') and kind = 'admin_direct'
     and school_year = pg_temp.year() + 1 and to_grade = '고2' and from_grade is null), 1);
select pg_temp.expect_text('update: 이미 있는 다음 해 행은 version 을 비교해 고친다',
  pg_temp.upd('s1', 1, '고3', null, null, 'admin_direct', 'correction', pg_temp.year() + 1), '2');
select pg_temp.expect_error('update: 올해 학적이 없는 학생의 다음 해 행은 만들 수 없다(WC081)',
  $$select pg_temp.upd('actor', 0, '고2', null, null, 'admin_direct', 'promotion', pg_temp.year() + 1)$$, 'WC081');
select pg_temp.expect_error('update: 다른 기관 기준이면 다음 해 행도 만들 수 없다(WC081)',
  $$select pg_temp.upd('s2', 0, '고2', null, null, 'admin_direct', 'promotion', pg_temp.year() + 1, 'tb')$$, 'WC081');

select pg_temp.expect_error('update: 학적 없음(WC081)',
  $$select pg_temp.upd('actor', 1, '고1', null, null)$$, 'WC081');
select pg_temp.expect_error('update: kind 는 세 가지만(rollover 거부)',
  $$select pg_temp.upd('s2', 2, '고1', 'a2', 3, 'rollover', 'promotion')$$, '22023');

-- 기관 범위: 다른 기관의 학생은 없는 것처럼 WC081, 담임이면 현재 학급이 담당 학급 목록에 있어야 한다
select pg_temp.expect_error('update: 다른 기관 기준이면 학적 없음(WC081)',
  $$select pg_temp.upd('s2', 2, '고1', 'a2', 9, 'admin_direct', 'correction', null, 'tb')$$, 'WC081');
select pg_temp.expect_text('update: 기관이 달라 거부되면 그대로', pg_temp.enr_s('s2'), '고1/2/3/v2');
select pg_temp.expect_error('update: 담당 학급이 아니면 학적 없음(WC081)',
  $$select pg_temp.upd('s2', 2, '고1', 'a2', 9, 'homeroom_edit', 'correction', null, 'ta', array['a1'])$$, 'WC081');
select pg_temp.expect_error('update: 학급 없는 학생은 담임 범위가 아니다(WC081)',
  $$select pg_temp.upd('s4', 1, '고1', 'a2', 9, 'homeroom_edit', 'correction', null, 'ta', array['a2'])$$, 'WC081');
select pg_temp.expect_text('update: 담당 학급이면 수정된다',
  pg_temp.upd('s2', 2, '고1', 'a2', 3, 'homeroom_edit', 'number_change', null, 'ta', array['a2']), '3');

-- 대행 중인 본사 관리자가 고치면 이력에 세션이 남는다
update public.profiles set role = 'admin' where id = pg_temp.fx('actor');
-- 대행은 teacherConsoleProxy edit 권한이 있어야 한다.
insert into public.admin_resources (key, group_title, label, sort_order, is_active)
  values ('teacherConsoleProxy', '서비스 관리', '교사 콘솔 대리 접속', 603, true)
  on conflict (key) do nothing;
insert into public.admin_members (profile_id, status) values (pg_temp.fx('actor'), 'active');
insert into public.admin_member_permissions (profile_id, resource_key, level)
  values (pg_temp.fx('actor'), 'teacherConsoleProxy', 'edit');
select public.fn_proxy_start(pg_temp.fx('actor'), pg_temp.fx('ta'), 'roster_proxy');
select pg_temp.expect_text('update: 대행 중 수정', pg_temp.upd('s2', 3, '고1', 'a2', 4, 'admin_direct', 'number_change'), '4');
select pg_temp.expect_bool('update: 대행 세션 id 가 이력에 남는다',
  (select proxy_session_id is not null from public.enrollment_changes
    where student_id = pg_temp.fx('s2') and kind = 'admin_direct'), true);

-- 함수는 service_role 만
grant execute on function pg_temp.expect_error(text, text, text) to anon, authenticated;
set local role anon;
select pg_temp.expect_error('anon 은 fn_enrollment_join 실행 불가',
  $$select * from public.fn_enrollment_join(gen_random_uuid(), gen_random_uuid(), '고1', null, null, null)$$, '42501');
select pg_temp.expect_error('anon 은 fn_enrollment_update 실행 불가',
  $$select * from public.fn_enrollment_update(gen_random_uuid(), 1, null, null, null, 'admin_direct', null, null, gen_random_uuid(), gen_random_uuid(), null)$$, '42501');
reset role;
set local role authenticated;
select pg_temp.expect_error('authenticated 는 fn_enrollment_join 실행 불가',
  $$select * from public.fn_enrollment_join(gen_random_uuid(), gen_random_uuid(), '고1', null, null, null)$$, '42501');
select pg_temp.expect_error('authenticated 는 fn_enrollment_update 실행 불가',
  $$select * from public.fn_enrollment_update(gen_random_uuid(), 1, null, null, null, 'admin_direct', null, null, gen_random_uuid(), gen_random_uuid(), null)$$, '42501');
reset role;

do $$ begin raise notice '=== b2b-enrollments.spec: 전체 통과 ==='; end $$;

rollback;
