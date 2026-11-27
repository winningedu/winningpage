-- =====================================================================
-- 미배정 목록 "확인 필요": 소속코드로 가입하며 스스로 반을 적었지만 명단과 맞지 않은 학생 SQL 스펙
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-enrollment-confirm.spec.sql
--
-- 전체가 한 트랜잭션이고 마지막에 ROLLBACK 한다. 단언 실패는 예외로 터져 psql 이 비정상 종료한다.
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
  values ('TCFAAAAA', 'tcf-a', '서울', '학교', 'B'),
         ('TCFBBBBB', 'tcf-b', '서울', '사기업', 'B');
insert into fx select 'ta', id from public.tenants where code = 'TCFAAAAA';
insert into fx select 'tb', id from public.tenants where code = 'TCFBBBBB';
insert into fx values
  ('s1', pg_temp.mk_user('tcf-s1@t.local')), ('s2', pg_temp.mk_user('tcf-s2@t.local')),
  ('s3', pg_temp.mk_user('tcf-s3@t.local')), ('s4', pg_temp.mk_user('tcf-s4@t.local')),
  ('s5', pg_temp.mk_user('tcf-s5@t.local')), ('s6', pg_temp.mk_user('tcf-s6@t.local')),
  ('s7', pg_temp.mk_user('tcf-s7@t.local')), ('s8', pg_temp.mk_user('tcf-s8@t.local')),
  ('actor', pg_temp.mk_user('tcf-actor@t.local'));
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;
create function pg_temp.year() returns integer language sql as $$
  select school_year from public.tenants where code = 'TCFAAAAA'
$$;

create temp table cls (k text primary key, v uuid);
insert into cls values
  ('a1', public.fn_class_ensure(pg_temp.fx('ta'), pg_temp.year(), '고1', null, '1')),
  ('a2', public.fn_class_ensure(pg_temp.fx('ta'), pg_temp.year(), '고1', null, '2'));
create function pg_temp.cls(p_k text) returns uuid language sql as $$ select v from cls where k = p_k $$;

create function pg_temp.needs(p_student text) returns boolean language sql as $$
  select needs_confirm from public.student_enrollments
   where student_id = pg_temp.fx(p_student) and school_year = pg_temp.year()
$$;
create function pg_temp.ver(p_student text) returns integer language sql as $$
  select version from public.student_enrollments
   where student_id = pg_temp.fx(p_student) and school_year = pg_temp.year()
$$;
create function pg_temp.pending(p_name text, p_class text, p_number integer) returns void
language sql as $$
  insert into public.roster_pending_students (tenant_id, school_year, name, grade, class_id, number)
  values (pg_temp.fx('ta'), pg_temp.year(), p_name, '고1', pg_temp.cls(p_class), p_number)
$$;

-- ---------------------------------------------------------------------
-- 기존 학적은 확인된 것으로 둔다(기본값 false)
-- ---------------------------------------------------------------------
insert into public.student_enrollments (tenant_id, student_id, school_year, grade, class_id, number)
  values (pg_temp.fx('ta'), pg_temp.fx('s8'), pg_temp.year(), '고1', pg_temp.cls('a1'), 30);
select pg_temp.expect_bool('직접 넣은 학적은 확인된 상태', pg_temp.needs('s8'), false);
select pg_temp.expect_error('반 없는 학적은 확인 필요가 될 수 없다',
  $$insert into public.student_enrollments (tenant_id, student_id, school_year, grade, needs_confirm)
    values (pg_temp.fx('ta'), pg_temp.fx('s7'), pg_temp.year(), '고1', true)$$, '23514');

-- ---------------------------------------------------------------------
-- fn_enrollment_join: 명단과 맞으면 확인됨, 맞지 않으면 확인 필요
-- ---------------------------------------------------------------------
select pg_temp.pending('tcf-s1@t.local', 'a1', 1);
select public.fn_enrollment_join(pg_temp.fx('s1'), pg_temp.fx('ta'), '고1', null, '1', 1::smallint);
select pg_temp.expect_bool('명단과 맞은 가입은 확인됨', pg_temp.needs('s1'), false);
select pg_temp.expect_int('맞은 명단 행은 지워진다',
  (select count(*) from public.roster_pending_students where name = 'tcf-s1@t.local'), 0);

select pg_temp.pending('tcf-s2@t.local', 'a1', null);
select public.fn_enrollment_join(pg_temp.fx('s2'), pg_temp.fx('ta'), '고1', null, '1', 7::smallint);
select pg_temp.expect_bool('명단 번호가 비어 있으면 이름과 반만 맞아도 확인됨', pg_temp.needs('s2'), false);

select pg_temp.pending('tcf-s3@t.local', 'a1', 3);
select public.fn_enrollment_join(pg_temp.fx('s3'), pg_temp.fx('ta'), '고1', null, '1', 4::smallint);
select pg_temp.expect_bool('번호가 다르면 확인 필요', pg_temp.needs('s3'), true);
select pg_temp.expect_int('맞지 않은 명단 행은 남는다',
  (select count(*) from public.roster_pending_students where name = 'tcf-s3@t.local'), 1);

select public.fn_enrollment_join(pg_temp.fx('s4'), pg_temp.fx('ta'), '고1', null, '2', 5::smallint);
select pg_temp.expect_bool('명단이 없는 기관 반 가입은 확인 필요', pg_temp.needs('s4'), true);

select public.fn_enrollment_join(pg_temp.fx('s5'), pg_temp.fx('ta'), '고1', null, null, null);
select pg_temp.expect_bool('반 없이 가입하면 확인 필요가 아니다(기존 미배정)', pg_temp.needs('s5'), false);
select public.fn_enrollment_join(pg_temp.fx('s5'), pg_temp.fx('ta'), '고1', null, '2', 6::smallint);
select pg_temp.expect_bool('나중에 스스로 반을 정해도 명단이 없으면 확인 필요', pg_temp.needs('s5'), true);

select public.fn_enrollment_join(pg_temp.fx('s6'), pg_temp.fx('tb'), '고1', null, '1', 1::smallint);
select pg_temp.expect_bool('학원도 같은 규칙(기관 유형으로 나누지 않는다)',
  (select needs_confirm from public.student_enrollments where student_id = pg_temp.fx('s6')), true);

-- ---------------------------------------------------------------------
-- fn_enrollment_confirm: 확인하면 빠지고, version 과 이력을 남긴다
-- ---------------------------------------------------------------------
select pg_temp.expect_error('version 이 다르면 WC078',
  format($$select * from public.fn_enrollment_confirm(%L, %s, %L, %L, null)$$,
    pg_temp.fx('s3'), pg_temp.ver('s3') + 5, pg_temp.fx('actor'), pg_temp.fx('ta')), 'WC078');
select pg_temp.expect_error('담임 담당 반이 아니면 WC081',
  format($$select * from public.fn_enrollment_confirm(%L, %s, %L, %L, %L::uuid[])$$,
    pg_temp.fx('s3'), pg_temp.ver('s3'), pg_temp.fx('actor'), pg_temp.fx('ta'), array[pg_temp.cls('a2')]), 'WC081');
select pg_temp.expect_error('다른 기관 학생이면 WC081',
  format($$select * from public.fn_enrollment_confirm(%L, %s, %L, %L, null)$$,
    pg_temp.fx('s6'), 1, pg_temp.fx('actor'), pg_temp.fx('ta')), 'WC081');
select pg_temp.expect_error('학적이 없으면 WC081',
  format($$select * from public.fn_enrollment_confirm(%L, 1, %L, %L, null)$$,
    pg_temp.fx('s7'), pg_temp.fx('actor'), pg_temp.fx('ta')), 'WC081');

create temp table confirmed as
  select * from public.fn_enrollment_confirm(pg_temp.fx('s3'), pg_temp.ver('s3'), pg_temp.fx('actor'), pg_temp.fx('ta'),
    array[pg_temp.cls('a1')]);
select pg_temp.expect_bool('담당 반 담임은 확인할 수 있다', pg_temp.needs('s3'), false);
select pg_temp.expect_int('확인하면 version 이 오른다', pg_temp.ver('s3'), 2);
select pg_temp.expect_bool('확인 결과는 changed true', (select changed from confirmed), true);
select pg_temp.expect_int('돌려준 version', (select version from confirmed), 2);
select pg_temp.expect_int('확인 이력 한 줄',
  (select count(*) from public.enrollment_changes
    where student_id = pg_temp.fx('s3') and kind = 'confirm' and status = 'applied'
      and to_class_id = pg_temp.cls('a1') and to_number = 4 and base_version = 1
      and decided_by = pg_temp.fx('actor')), 1);

create temp table again as
  select * from public.fn_enrollment_confirm(pg_temp.fx('s3'), 1, pg_temp.fx('actor'), pg_temp.fx('ta'), null);
select pg_temp.expect_bool('이미 확인된 학생은 version 과 상관없이 changed false', (select changed from again), false);
select pg_temp.expect_int('다시 확인해도 version 은 그대로', pg_temp.ver('s3'), 2);
select pg_temp.expect_int('다시 확인해도 이력은 늘지 않는다',
  (select count(*) from public.enrollment_changes where student_id = pg_temp.fx('s3') and kind = 'confirm'), 1);

-- ---------------------------------------------------------------------
-- 교사가 배치를 바꾸면 확인된다
-- ---------------------------------------------------------------------
select public.fn_enrollment_update(pg_temp.fx('s4'), pg_temp.ver('s4'), '고1', pg_temp.cls('a1'), 9::smallint,
  'admin_direct', null, null, pg_temp.fx('actor'), pg_temp.fx('ta'), null);
select pg_temp.expect_bool('학적 수정으로 반을 바꾸면 확인됨', pg_temp.needs('s4'), false);

select pg_temp.expect_bool('s5 는 아직 확인 필요', pg_temp.needs('s5'), true);
select public.fn_enrollment_update(pg_temp.fx('s5'), pg_temp.ver('s5'), '고1', pg_temp.cls('a2'), 6::smallint,
  'admin_direct', null, null, pg_temp.fx('actor'), pg_temp.fx('ta'), null);
select pg_temp.expect_bool('같은 자리로 저장해도 교사가 저장하면 확인됨', pg_temp.needs('s5'), false);

update public.student_enrollments set needs_confirm = true
 where student_id = pg_temp.fx('s5') and school_year = pg_temp.year();
update public.student_enrollments set number = 11, version = version + 1
 where student_id = pg_temp.fx('s5') and school_year = pg_temp.year();
select pg_temp.expect_bool('명단 적용이나 학년도 전환처럼 배치를 쓰면 확인됨', pg_temp.needs('s5'), false);

-- ---------------------------------------------------------------------
-- 본사 학생 이동은 교사 배치와 같게 확인된 상태로 만든다
-- ---------------------------------------------------------------------
select pg_temp.expect_bool('이동 전 s6 은 확인 필요',
  (select needs_confirm from public.student_enrollments where student_id = pg_temp.fx('s6')), true);
select * from public.fn_admin_move_student_tenant(pg_temp.fx('actor'), pg_temp.fx('s6'), pg_temp.fx('ta'),
  '고1', null, '2', 12::smallint);
select pg_temp.expect_bool('본사 이동으로 반을 정하면 확인됨', pg_temp.needs('s6'), false);

-- 함수는 service_role 만
grant execute on function pg_temp.expect_error(text, text, text) to anon, authenticated;
set local role anon;
select pg_temp.expect_error('anon 은 fn_enrollment_confirm 실행 불가',
  $$select * from public.fn_enrollment_confirm(gen_random_uuid(), 1, gen_random_uuid(), gen_random_uuid(), null)$$, '42501');
reset role;
set local role authenticated;
select pg_temp.expect_error('authenticated 는 fn_enrollment_confirm 실행 불가',
  $$select * from public.fn_enrollment_confirm(gen_random_uuid(), 1, gen_random_uuid(), gen_random_uuid(), null)$$, '42501');
reset role;

do $$ begin raise notice '=== b2b-enrollment-confirm.spec: 전체 통과 ==='; end $$;

rollback;
