-- =====================================================================
-- B2B 기반 1: 선생님 회원 종류와 중학년 값 SQL 스펙 (T1)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-member-type-grades.spec.sql
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
  insert into public.profiles (id, name, role, email)
  values (v_id, p_email, 'user', p_email)
  on conflict (id) do nothing;
  return v_id;
end $$;

-- member_type: teacher 추가, 기존 값 유지, 알 수 없는 값 거부
select pg_temp.expect_ok('member_type teacher',
  format($f$update public.profiles set member_type = 'teacher' where id = %L$f$,
    pg_temp.mk_user('t1-teacher@t.local')));
select pg_temp.expect_ok('member_type student',
  format($f$update public.profiles set member_type = 'student' where id = %L$f$,
    pg_temp.mk_user('t1-student@t.local')));
select pg_temp.expect_ok('member_type parent',
  format($f$update public.profiles set member_type = 'parent' where id = %L$f$,
    pg_temp.mk_user('t1-parent@t.local')));
select pg_temp.expect_ok('member_type mentor',
  format($f$update public.profiles set member_type = 'mentor' where id = %L$f$,
    pg_temp.mk_user('t1-mentor@t.local')));
select pg_temp.expect_ok('member_type null',
  format($f$update public.profiles set member_type = null where id = %L$f$,
    pg_temp.mk_user('t1-null@t.local')));
select pg_temp.expect_error('member_type admin 거부',
  format($f$update public.profiles set member_type = 'admin' where id = %L$f$,
    pg_temp.mk_user('t1-bad@t.local')), '23514');

-- student_profiles.grade: 중1~중3 추가, 기존 값 유지, 중4 거부
create function pg_temp.set_grade(p_grade text) returns void
language plpgsql as $$
declare
  v_id uuid := pg_temp.mk_user('t1-g' || gen_random_uuid() || '@t.local');
begin
  insert into public.student_profiles (profile_id, grade) values (v_id, p_grade);
end $$;

select pg_temp.expect_ok('grade 중1', $$select pg_temp.set_grade('중1')$$);
select pg_temp.expect_ok('grade 중2', $$select pg_temp.set_grade('중2')$$);
select pg_temp.expect_ok('grade 중3', $$select pg_temp.set_grade('중3')$$);
select pg_temp.expect_ok('grade 고1', $$select pg_temp.set_grade('고1')$$);
select pg_temp.expect_ok('grade 고2', $$select pg_temp.set_grade('고2')$$);
select pg_temp.expect_ok('grade 고3', $$select pg_temp.set_grade('고3')$$);
select pg_temp.expect_ok('grade 졸업', $$select pg_temp.set_grade('졸업')$$);
select pg_temp.expect_ok('grade N수', $$select pg_temp.set_grade('N수')$$);
select pg_temp.expect_error('grade 중4 거부', $$select pg_temp.set_grade('중4')$$, '23514');

do $$ begin raise notice '=== b2b-member-type-grades.spec: 전체 통과 ==='; end $$;

rollback;
