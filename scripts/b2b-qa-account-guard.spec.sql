-- =====================================================================
-- QA 계정 보호 SQL 스펙: qa_accounts, fn_is_qa_account, QA 본사 관리자 쓰기 차단 트리거
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-qa-account-guard.spec.sql
--
-- 전체가 한 트랜잭션이고 마지막에 ROLLBACK 한다. 어떤 데이터도 남기지
-- 않는다. 단언 실패는 예외로 터져 psql 이 비정상 종료(ON_ERROR_STOP)한다.
-- =====================================================================
begin;

create function pg_temp.expect_bool(t text, got boolean, want boolean) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '[FAIL] %: got %, want %', t, got, want;
  end if;
  raise notice '[PASS] % = %', t, want;
end $$;

-- p_uid 가 있으면 그 사용자의 authenticated 세션으로, 없으면 현재 롤(postgres)로 실행한다.
create function pg_temp.run_as(p_uid uuid, p_sql text) returns void
language plpgsql as $$
begin
  if p_uid is not null then
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    set local role authenticated;
  end if;
  execute p_sql;
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.expect_ok(t text, p_uid uuid, p_sql text) returns void
language plpgsql as $$
begin
  perform pg_temp.run_as(p_uid, p_sql);
  raise notice '[PASS] % 성공', t;
end $$;

create function pg_temp.expect_error(t text, p_uid uuid, p_sql text, want text) returns void
language plpgsql as $$
declare
  v_state text;
begin
  begin
    perform pg_temp.run_as(p_uid, p_sql);
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    if v_state is distinct from want then
      raise exception '[FAIL] %: sqlstate %, want %', t, v_state, want;
    end if;
    raise notice '[PASS] % = %', t, want;
    return;
  end;
  raise exception '[FAIL] %: 예외가 나지 않았다, want %', t, want;
end $$;

create function pg_temp.mk_user(p_email text, p_role text) returns uuid
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
  values (v_id, p_email, p_role, p_email, case when p_role = 'admin' then null else 'student' end)
  on conflict (id) do update set role = excluded.role;
  return v_id;
end $$;

create temp table fx (k text primary key, v uuid);
grant select on fx to authenticated;
insert into fx values
  ('qa_admin', pg_temp.mk_user('qa-admin@t.local', 'admin')),
  ('qa_member_admin', pg_temp.mk_user('qa-member-admin@t.local', 'user')),
  ('real_admin', pg_temp.mk_user('real-admin@t.local', 'admin')),
  ('qa_student', pg_temp.mk_user('qa-student@t.local', 'user')),
  ('real_student', pg_temp.mk_user('real-student@t.local', 'user'));

insert into public.qa_accounts (profile_id)
  select v from fx where k in ('qa_admin', 'qa_member_admin', 'qa_student');
insert into public.admin_members (profile_id, status)
  select v, 'active' from fx where k = 'qa_member_admin';

-- fn_is_qa_account
select pg_temp.expect_bool('QA 계정이면 true',
  public.fn_is_qa_account((select v from fx where k = 'qa_student')), true);
select pg_temp.expect_bool('QA 아닌 계정이면 false',
  public.fn_is_qa_account((select v from fx where k = 'real_student')), false);
select pg_temp.expect_bool('모르는 uuid 도 false',
  public.fn_is_qa_account(gen_random_uuid()), false);
select pg_temp.expect_bool('인자가 null 이면 false',
  public.fn_is_qa_account(null), false);

-- qa_accounts 는 브라우저(anon, authenticated)가 읽지도 쓰지도 못한다
select pg_temp.expect_bool('authenticated 는 qa_accounts 에 권한이 없다',
  has_table_privilege('authenticated', 'public.qa_accounts', 'select')
    or has_table_privilege('authenticated', 'public.qa_accounts', 'insert'),
  false);
select pg_temp.expect_bool('anon 은 fn_is_qa_account 를 실행할 수 없다',
  has_function_privilege('anon', 'public.fn_is_qa_account(uuid)', 'execute'), false);

-- QA 본사 관리자(profiles.role = admin): 브라우저 쓰기 차단 WC102
select pg_temp.expect_error('QA 관리자의 UPDATE 차단', (select v from fx where k = 'qa_admin'),
  $q$update public.profiles set address = 'x' where false$q$, 'WC102');
select pg_temp.expect_error('QA 관리자의 DELETE 차단', (select v from fx where k = 'qa_admin'),
  $q$delete from public.profiles where false$q$, 'WC102');
select pg_temp.expect_error('QA 관리자의 INSERT 차단', (select v from fx where k = 'qa_admin'),
  $q$insert into public.profiles (id, name) select gen_random_uuid(), 'x' where false$q$, 'WC102');
select pg_temp.expect_ok('QA 관리자의 SELECT 는 된다', (select v from fx where k = 'qa_admin'),
  $q$select count(*) from public.profiles$q$);

-- admin_members 활성 행만 있는 QA 관리자도 차단
select pg_temp.expect_error('admin_members 활성 QA 관리자의 UPDATE 차단',
  (select v from fx where k = 'qa_member_admin'),
  $q$update public.profiles set address = 'x' where false$q$, 'WC102');

-- 영향 없는 호출자
select pg_temp.expect_ok('QA 아닌 관리자의 UPDATE 는 된다', (select v from fx where k = 'real_admin'),
  $q$update public.profiles set address = 'x' where false$q$);
select pg_temp.expect_ok('QA 학생(관리자 아님)의 본인 UPDATE 는 된다', (select v from fx where k = 'qa_student'),
  format($q$update public.profiles set address = 'x' where id = %L$q$,
    (select v from fx where k = 'qa_student')));

-- service_role 과 JWT 없는 postgres 롤은 통과(서버 라우트는 코드에서 막는다)
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select pg_temp.expect_ok('JWT 에 sub 가 없는 service_role 은 통과', null,
  $q$update public.profiles set address = 'x' where false$q$);
select set_config('request.jwt.claims', '', true);
select pg_temp.expect_ok('JWT 없는 postgres 롤의 UPDATE 는 된다', null,
  $q$update public.profiles set address = 'x' where false$q$);

-- 앞으로 만드는 테이블이 트리거를 빼먹으면 이 단언이 CI 에서 잡는다
select pg_temp.expect_bool('qa_accounts 를 뺀 모든 public 테이블에 차단 트리거가 있다',
  not exists (
    select 1
      from pg_tables t
     where t.schemaname = 'public'
       and t.tablename <> 'qa_accounts'
       and not exists (
         select 1 from pg_trigger g
          where g.tgrelid = format('public.%I', t.tablename)::regclass
            and g.tgname = 'trg_qa_admin_write_block'
            and not g.tgisinternal)),
  true);

do $$ begin raise notice '=== b2b-qa-account-guard.spec: 전체 통과 ==='; end $$;

rollback;
