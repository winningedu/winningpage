-- =====================================================================
-- B2B 기반 10: 입시 상담코칭 상담 상태 테이블 SQL 스펙
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-counsel-statuses.spec.sql
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
  values ('CSAAAAAA', 'cs-a', '서울', '학교', 'B');
insert into fx select 'ta', id from public.tenants where code = 'CSAAAAAA';
insert into fx values ('s1', pg_temp.mk_user('cs-s1@t.local'));
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;

-- 학생당 한 행, 상태 4가지
select pg_temp.expect_ok('상담예정 insert',
  $$insert into public.counsel_statuses (student_id, tenant_id, status)
    values (pg_temp.fx('s1'), pg_temp.fx('ta'), 'scheduled')$$);
select pg_temp.expect_error('같은 학생을 두 번 넣으면 23505',
  $$insert into public.counsel_statuses (student_id, tenant_id, status)
    values (pg_temp.fx('s1'), pg_temp.fx('ta'), 'done')$$, '23505');
select pg_temp.expect_ok('상담완료로 갱신',
  $$update public.counsel_statuses set status = 'done' where student_id = pg_temp.fx('s1')$$);
select pg_temp.expect_ok('상담필요로 갱신',
  $$update public.counsel_statuses set status = 'needed' where student_id = pg_temp.fx('s1')$$);
select pg_temp.expect_ok('미지정으로 갱신',
  $$update public.counsel_statuses set status = 'unset' where student_id = pg_temp.fx('s1')$$);
select pg_temp.expect_error('4가지 밖의 상태는 23514',
  $$update public.counsel_statuses set status = 'later' where student_id = pg_temp.fx('s1')$$, '23514');
select pg_temp.expect_error('상태가 비면 23502',
  $$update public.counsel_statuses set status = null where student_id = pg_temp.fx('s1')$$, '23502');
select pg_temp.expect_error('없는 학생은 23503',
  $$insert into public.counsel_statuses (student_id, tenant_id, status)
    values (gen_random_uuid(), pg_temp.fx('ta'), 'done')$$, '23503');
select pg_temp.expect_error('없는 기관은 23503',
  $$update public.counsel_statuses set tenant_id = gen_random_uuid() where student_id = pg_temp.fx('s1')$$, '23503');

-- anon, authenticated 는 읽지도 쓰지도 못한다
select pg_temp.expect_bool('anon 은 counsel_statuses 를 읽을 수 없다',
  has_table_privilege('anon', 'public.counsel_statuses', 'select'), false);
select pg_temp.expect_bool('authenticated 는 counsel_statuses 에 쓸 수 없다',
  has_table_privilege('authenticated', 'public.counsel_statuses', 'insert'), false);
select pg_temp.expect_bool('RLS 가 켜져 있다',
  (select relrowsecurity from pg_class where oid = 'public.counsel_statuses'::regclass), true);

-- 학생 프로필을 지우면 상태도 사라진다
delete from public.profiles where id = pg_temp.fx('s1');
select pg_temp.expect_int('프로필 삭제는 상태를 지운다',
  (select count(*) from public.counsel_statuses where student_id = pg_temp.fx('s1')), 0);

rollback;
