-- =====================================================================
-- B2B 기반 9: 특이학생 지정 테이블과 기관별 달성율 기준 SQL 스펙
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-student-flags.spec.sql
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
  return v_id;
end $$;

create temp table fx (k text primary key, v uuid);
insert into public.tenants (code, name, region, org_type, tier)
  values ('SFAAAAAA', 'sf-a', '서울', '학교', 'B');
insert into fx select 'ta', id from public.tenants where code = 'SFAAAAAA';
insert into public.tenants (code, name, region, org_type, tier)
  values ('SFBBBBBB', 'sf-b', '서울', '학교', 'B');
insert into fx select 'tb', id from public.tenants where code = 'SFBBBBBB';
insert into fx values ('s1', pg_temp.mk_user('sf-s1@t.local'));
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;

-- 기관과 학생당 한 행(결정 64): 같은 학생도 기관마다 따로 지정한다
select pg_temp.expect_ok('지정 insert',
  $$insert into public.student_flags (student_id, tenant_id)
    values (pg_temp.fx('s1'), pg_temp.fx('ta'))$$);
select pg_temp.expect_ok('같은 학생을 다른 기관에서도 지정할 수 있다',
  $$insert into public.student_flags (student_id, tenant_id)
    values (pg_temp.fx('s1'), pg_temp.fx('tb'))$$);
select pg_temp.expect_error('같은 기관에서 같은 학생을 두 번 지정하면 23505',
  $$insert into public.student_flags (student_id, tenant_id)
    values (pg_temp.fx('s1'), pg_temp.fx('ta'))$$, '23505');
select pg_temp.expect_error('없는 학생은 23503',
  $$insert into public.student_flags (student_id, tenant_id)
    values (gen_random_uuid(), pg_temp.fx('ta'))$$, '23503');

-- 달성율 기준은 1 이상 100 이하이고 비워 둘 수 있다
select pg_temp.expect_ok('기준 비움(null)',
  $$update public.tenants set special_exec_rate_pct = null where id = pg_temp.fx('ta')$$);
select pg_temp.expect_ok('기준 40',
  $$update public.tenants set special_exec_rate_pct = 40 where id = pg_temp.fx('ta')$$);
select pg_temp.expect_error('기준 0 은 23514',
  $$update public.tenants set special_exec_rate_pct = 0 where id = pg_temp.fx('ta')$$, '23514');
select pg_temp.expect_error('기준 101 은 23514',
  $$update public.tenants set special_exec_rate_pct = 101 where id = pg_temp.fx('ta')$$, '23514');

-- anon, authenticated 는 읽지도 쓰지도 못한다
select pg_temp.expect_bool('anon 은 student_flags 를 읽을 수 없다',
  has_table_privilege('anon', 'public.student_flags', 'select'), false);
select pg_temp.expect_bool('authenticated 는 student_flags 에 쓸 수 없다',
  has_table_privilege('authenticated', 'public.student_flags', 'insert'), false);
select pg_temp.expect_bool('RLS 가 켜져 있다',
  (select relrowsecurity from pg_class where oid = 'public.student_flags'::regclass), true);

-- 학생 프로필을 지우면 지정도 사라진다
delete from public.profiles where id = pg_temp.fx('s1');
select pg_temp.expect_int('프로필 삭제는 모든 기관의 지정을 지운다',
  (select count(*) from public.student_flags where student_id = pg_temp.fx('s1')), 0);

rollback;
