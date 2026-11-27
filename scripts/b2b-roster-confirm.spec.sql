-- =====================================================================
-- 명단 적용이 "확인 필요" 학생을 확인한다 SQL 스펙
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-roster-confirm.spec.sql
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
  values ('TRCAAAAA', 'trc-a', '서울', '학교', 'B');
insert into fx select 'ta', id from public.tenants where code = 'TRCAAAAA';
insert into fx values
  ('s1', pg_temp.mk_user('trc-s1@t.local')), ('s2', pg_temp.mk_user('trc-s2@t.local')),
  ('s3', pg_temp.mk_user('trc-s3@t.local')), ('s4', pg_temp.mk_user('trc-s4@t.local')),
  ('s5', pg_temp.mk_user('trc-s5@t.local')),
  ('actor', pg_temp.mk_user('trc-actor@t.local'));
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;
create function pg_temp.year() returns integer language sql as $$
  select school_year from public.tenants where code = 'TRCAAAAA'
$$;
create function pg_temp.needs(p_student text) returns boolean language sql as $$
  select needs_confirm from public.student_enrollments
   where student_id = pg_temp.fx(p_student) and school_year = pg_temp.year()
$$;
create function pg_temp.ver(p_student text) returns integer language sql as $$
  select version from public.student_enrollments
   where student_id = pg_temp.fx(p_student) and school_year = pg_temp.year()
$$;
create function pg_temp.confirms(p_student text) returns bigint language sql as $$
  select count(*) from public.enrollment_changes
   where student_id = pg_temp.fx(p_student) and kind = 'confirm' and status = 'applied'
$$;
create function pg_temp.pending_n(p_name text) returns bigint language sql as $$
  select count(*) from public.roster_pending_students where tenant_id = pg_temp.fx('ta') and name = p_name
$$;
create function pg_temp.row_of(p_student text, p_class text, p_number integer) returns jsonb
language sql as $$
  select jsonb_build_object('student_id', pg_temp.fx(p_student), 'class_name', p_class, 'number', p_number,
    'version', pg_temp.ver(p_student))
$$;
create function pg_temp.pend(p_name text, p_class text, p_number integer) returns jsonb
language sql as $$
  select jsonb_build_object('name', p_name, 'grade', '고1', 'class_name', p_class, 'number', p_number)
$$;
create function pg_temp.midyear(p_rows jsonb, p_pending jsonb default '[]') returns text language sql as $$
  select r.updated_count || '/' || r.skipped_count || '/' || r.pending_stored
    from public.fn_roster_midyear(pg_temp.fx('ta'), p_rows, p_pending, pg_temp.fx('actor')) r
$$;

-- 명단 없이 스스로 반을 적어 가입한 학생은 모두 확인 필요다.
select public.fn_enrollment_join(pg_temp.fx('s1'), pg_temp.fx('ta'), '고1', null, '1', 3::smallint);
select public.fn_enrollment_join(pg_temp.fx('s2'), pg_temp.fx('ta'), '고1', null, '1', 4::smallint);
select public.fn_enrollment_join(pg_temp.fx('s3'), pg_temp.fx('ta'), '고1', null, '2', 5::smallint);
select public.fn_enrollment_join(pg_temp.fx('s4'), pg_temp.fx('ta'), '고1', null, '2', 6::smallint);
select public.fn_enrollment_join(pg_temp.fx('s5'), pg_temp.fx('ta'), '고1', null, '2', 7::smallint);
select pg_temp.expect_bool('준비: s1 확인 필요', pg_temp.needs('s1'), true);

-- ---------------------------------------------------------------------
-- 학기 중 명단 적용: 같은 반과 번호로 명단에 나오면 바뀌지 않아도 확인된다
-- ---------------------------------------------------------------------
select pg_temp.expect_text('같은 자리 줄은 바뀐 학생 0, 건너뜀 1',
  pg_temp.midyear(jsonb_build_array(pg_temp.row_of('s1', '1', 3))), '0/1/0');
select pg_temp.expect_bool('명단과 같은 자리면 확인됨', pg_temp.needs('s1'), false);
select pg_temp.expect_int('확인하면 version 이 오른다', pg_temp.ver('s1'), 2);
select pg_temp.expect_int('확인 이력 한 줄(kind confirm)', pg_temp.confirms('s1'), 1);
select pg_temp.expect_int('확인 이력의 결정자는 적용한 교사',
  (select count(*) from public.enrollment_changes
    where student_id = pg_temp.fx('s1') and kind = 'confirm' and decided_by = pg_temp.fx('actor')
      and base_version = 1 and to_number = 3), 1);

select pg_temp.expect_text('같은 명단을 다시 적용해도 그대로',
  pg_temp.midyear(jsonb_build_array(pg_temp.row_of('s1', '1', 3))), '0/1/0');
select pg_temp.expect_int('다시 적용하면 version 그대로', pg_temp.ver('s1'), 2);
select pg_temp.expect_int('다시 적용해도 확인 이력은 한 줄', pg_temp.confirms('s1'), 1);

select pg_temp.expect_text('다른 자리 줄은 배치를 바꾼다',
  pg_temp.midyear(jsonb_build_array(pg_temp.row_of('s2', '2', 8))), '1/0/0');
select pg_temp.expect_bool('배치가 바뀌면 확인됨', pg_temp.needs('s2'), false);

-- ---------------------------------------------------------------------
-- 가입 전 명단 저장: 이미 그 반에 있는 학생과 맞는 줄은 남기지 않고, 확인 필요 학생이면 확인한다
-- ---------------------------------------------------------------------
select pg_temp.expect_text('가입 전 줄 두 개(s3 와 맞음, 번호 비움 / 아무와도 안 맞음)',
  pg_temp.midyear('[]', jsonb_build_array(pg_temp.pend('trc-s3@t.local', '2', null), pg_temp.pend('미가입', '2', 9))),
  '0/0/2');
select pg_temp.expect_bool('명단 번호가 비면 이름과 반만 맞아도 확인됨', pg_temp.needs('s3'), false);
select pg_temp.expect_int('가입 전 줄로 확인해도 이력 한 줄', pg_temp.confirms('s3'), 1);
select pg_temp.expect_int('맞은 가입 전 줄은 남지 않는다', pg_temp.pending_n('trc-s3@t.local'), 0);
select pg_temp.expect_int('맞지 않은 가입 전 줄은 남는다', pg_temp.pending_n('미가입'), 1);

select pg_temp.midyear('[]', jsonb_build_array(pg_temp.pend('trc-s3@t.local', '2', null), pg_temp.pend('미가입', '2', 9)));
select pg_temp.expect_int('다시 적용해도 확인 이력은 한 줄', pg_temp.confirms('s3'), 1);
select pg_temp.expect_int('다시 적용해도 확인된 학생과 맞는 줄은 남지 않는다', pg_temp.pending_n('trc-s3@t.local'), 0);
select pg_temp.expect_int('version 은 첫 확인 뒤 그대로', pg_temp.ver('s3'), 2);

select pg_temp.midyear('[]', jsonb_build_array(pg_temp.pend('trc-s4@t.local', '2', 1)));
select pg_temp.expect_bool('번호가 다르면 확인되지 않는다', pg_temp.needs('s4'), true);
select pg_temp.expect_int('번호가 다른 줄은 가입 전 명단에 남는다', pg_temp.pending_n('trc-s4@t.local'), 1);

select pg_temp.expect_bool('명단에 없는 s5 는 그대로 확인 필요', pg_temp.needs('s5'), true);

-- 새 함수는 service_role 만
grant execute on function pg_temp.expect_error(text, text, text) to anon, authenticated;
set local role authenticated;
select pg_temp.expect_error('authenticated 는 fn_enrollment_mark_confirmed 실행 불가',
  $$select public.fn_enrollment_mark_confirmed(gen_random_uuid(), gen_random_uuid())$$, '42501');
reset role;

do $$ begin raise notice '=== b2b-roster-confirm.spec: 전체 통과 ==='; end $$;

rollback;
