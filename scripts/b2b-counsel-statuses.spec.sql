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
  return v_id;
end $$;

create temp table fx (k text primary key, v uuid);
insert into public.tenants (code, name, region, org_type, tier)
  values ('CSAAAAAA', 'cs-a', '서울', '학교', 'B');
insert into fx select 'ta', id from public.tenants where code = 'CSAAAAAA';
insert into public.tenants (code, name, region, org_type, tier)
  values ('CSBBBBBB', 'cs-b', '서울', '학교', 'B');
insert into fx select 'tb', id from public.tenants where code = 'CSBBBBBB';
insert into fx values ('s1', pg_temp.mk_user('cs-s1@t.local'));
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;

-- 기관, 학생, 학년도당 한 행(결정 64), 상태 4가지
select pg_temp.expect_ok('상담예정 insert',
  $$insert into public.counsel_statuses (student_id, tenant_id, school_year, status)
    values (pg_temp.fx('s1'), pg_temp.fx('ta'), 2026, 'scheduled')$$);
select pg_temp.expect_ok('같은 학생의 다른 학년도는 따로 둔다',
  $$insert into public.counsel_statuses (student_id, tenant_id, school_year, status)
    values (pg_temp.fx('s1'), pg_temp.fx('ta'), 2027, 'done')$$);
select pg_temp.expect_ok('같은 학생의 다른 기관은 따로 둔다',
  $$insert into public.counsel_statuses (student_id, tenant_id, school_year, status)
    values (pg_temp.fx('s1'), pg_temp.fx('tb'), 2026, 'needed')$$);
select pg_temp.expect_error('같은 기관, 학생, 학년도를 두 번 넣으면 23505',
  $$insert into public.counsel_statuses (student_id, tenant_id, school_year, status)
    values (pg_temp.fx('s1'), pg_temp.fx('ta'), 2026, 'done')$$, '23505');
delete from public.counsel_statuses where school_year = 2027 or tenant_id = pg_temp.fx('tb');
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
  $$insert into public.counsel_statuses (student_id, tenant_id, school_year, status)
    values (gen_random_uuid(), pg_temp.fx('ta'), 2026, 'done')$$, '23503');
select pg_temp.expect_error('없는 기관은 23503',
  $$update public.counsel_statuses set tenant_id = gen_random_uuid() where student_id = pg_temp.fx('s1')$$, '23503');

-- fn_set_counsel_status: 한 문장으로 이전 값을 읽고 바꾼다(동시 요청이 같은 이전 값을 읽지 않는다)
delete from public.counsel_statuses where student_id = pg_temp.fx('s1');
create function pg_temp.setcs(p_status text, p_year integer default 2026)
returns table (previous_status text, current_status text, status_changed_at timestamptz)
language sql as $$
  select * from public.fn_set_counsel_status(pg_temp.fx('ta'), pg_temp.fx('s1'), p_year, p_status, null)
$$;
select pg_temp.expect_text('행이 없을 때 미지정은 이전 값 unset 이고 행을 만들지 않는다',
  (select previous_status || '>' || current_status from pg_temp.setcs('unset')), 'unset>unset');
select pg_temp.expect_int('미지정만 보내면 행이 없다',
  (select count(*) from public.counsel_statuses where student_id = pg_temp.fx('s1')), 0);
select pg_temp.expect_text('처음 상담예정은 unset 에서 scheduled',
  (select previous_status || '>' || current_status from pg_temp.setcs('scheduled')), 'unset>scheduled');
update public.counsel_statuses set changed_at = '2026-01-01T00:00:00Z' where student_id = pg_temp.fx('s1');
select pg_temp.expect_text('같은 상태는 이전 값이 같고 변경 일자가 움직이지 않는다',
  (select previous_status || '>' || current_status || '@' || status_changed_at::date from pg_temp.setcs('scheduled')),
  'scheduled>scheduled@2026-01-01');
select pg_temp.expect_text('상담완료로 바꾸면 이전 값은 scheduled',
  (select previous_status || '>' || current_status from pg_temp.setcs('done')), 'scheduled>done');
select pg_temp.expect_bool('바뀌면 변경 일자가 움직인다',
  (select changed_at > '2026-01-01T00:00:00Z' from public.counsel_statuses where student_id = pg_temp.fx('s1')), true);
select pg_temp.expect_text('다른 학년도는 따로 시작한다',
  (select previous_status || '>' || current_status from pg_temp.setcs('needed', 2027)), 'unset>needed');
select pg_temp.expect_error('4가지 밖의 상태는 23514',
  $$select * from pg_temp.setcs('later')$$, '23514');
select pg_temp.expect_bool('service_role 만 함수를 실행한다',
  has_function_privilege('anon', 'public.fn_set_counsel_status(uuid, uuid, integer, text, uuid)', 'execute')
  or has_function_privilege('authenticated', 'public.fn_set_counsel_status(uuid, uuid, integer, text, uuid)', 'execute'), false);

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
