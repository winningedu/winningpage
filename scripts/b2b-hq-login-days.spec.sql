-- =====================================================================
-- 본사 통계 공통 기반 SQL 스펙: 기본 제외 판정 fn_hq_stat_included, 로그인 기록 profile_login_days
-- (분석 grill Q1, Q3, Q13)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-hq-login-days.spec.sql
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

create function pg_temp.expect_int(t text, got bigint, want bigint) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '[FAIL] %: got %, want %', t, got, want;
  end if;
  raise notice '[PASS] % = %', t, want;
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
insert into fx values
  ('student', pg_temp.mk_user('hq-student@t.local', 'user')),
  ('qa', pg_temp.mk_user('hq-qa@t.local', 'user')),
  ('member', pg_temp.mk_user('hq-member@t.local', 'user')),
  ('suspended', pg_temp.mk_user('hq-suspended@t.local', 'user')),
  ('role_admin', pg_temp.mk_user('hq-role-admin@t.local', 'admin'));
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;

insert into public.qa_accounts (profile_id) values (pg_temp.fx('qa'));
insert into public.admin_members (profile_id, status) values
  (pg_temp.fx('member'), 'active'), (pg_temp.fx('suspended'), 'suspended');
-- admin_members 와 profiles.role 을 따로 보려고 동기화 트리거가 바꾼 role 을 되돌린다.
update public.profiles set role = 'user' where id in (pg_temp.fx('member'), pg_temp.fx('suspended'));

-- ---------------------------------------------------------------------
-- fn_hq_stat_included: 기본 제외는 qa_accounts, admin_members(상태 무관), profiles.role admin 뿐이다(Q3)
-- ---------------------------------------------------------------------
select pg_temp.expect_bool('일반 회원은 기본으로 포함', public.fn_hq_stat_included(pg_temp.fx('student'), false), true);
select pg_temp.expect_bool('qa_accounts 행은 기본 제외', public.fn_hq_stat_included(pg_temp.fx('qa'), false), false);
select pg_temp.expect_bool('admin_members 행은 기본 제외', public.fn_hq_stat_included(pg_temp.fx('member'), false), false);
select pg_temp.expect_bool('정지된 admin_members 행도 기본 제외', public.fn_hq_stat_included(pg_temp.fx('suspended'), false), false);
select pg_temp.expect_bool('profiles.role admin 은 기본 제외', public.fn_hq_stat_included(pg_temp.fx('role_admin'), false), false);
select pg_temp.expect_bool('포함 스위치를 켜면 모두 포함',
  (select bool_and(public.fn_hq_stat_included(v, true)) from fx), true);

-- QA 차단 스위치(app_settings.qa_account_guard_enabled)가 꺼져 있어도 qa_accounts 를 직접 읽어 뺀다.
delete from public.app_settings where key = 'qa_account_guard_enabled';
select pg_temp.expect_bool('QA 차단 스위치가 꺼져 있어도 qa_accounts 행은 기본 제외',
  public.fn_hq_stat_included(pg_temp.fx('qa'), false), false);

select pg_temp.expect_bool('fn_hq_stat_included 는 security definer 가 아니다(통계 함수 안에서 펼쳐진다)',
  (select not prosecdef from pg_proc where oid = 'public.fn_hq_stat_included(uuid, boolean)'::regprocedure), true);
select pg_temp.expect_bool('anon, authenticated 는 fn_hq_stat_included 를 실행할 수 없다',
  not has_function_privilege('anon', 'public.fn_hq_stat_included(uuid, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.fn_hq_stat_included(uuid, boolean)', 'execute'), true);
select pg_temp.expect_bool('service_role 은 fn_hq_stat_included 를 실행할 수 있다',
  has_function_privilege('service_role', 'public.fn_hq_stat_included(uuid, boolean)', 'execute'), true);

-- ---------------------------------------------------------------------
-- profile_login_days: 회원별 KST 하루 1행(Q1, Q13)
-- ---------------------------------------------------------------------
insert into public.profile_login_days (profile_id, kst_date) values (pg_temp.fx('student'), date '2026-11-23');
select pg_temp.expect_bool('first_seen_at 은 기본값으로 지금이 들어간다',
  (select first_seen_at = now() from public.profile_login_days where profile_id = pg_temp.fx('student')), true);
select pg_temp.expect_error('같은 회원, 같은 날 두 번째 행은 기본 키 위반',
  $$insert into public.profile_login_days (profile_id, kst_date) values (pg_temp.fx('student'), date '2026-11-23')$$, '23505');
insert into public.profile_login_days (profile_id, kst_date) values (pg_temp.fx('student'), date '2026-11-23')
  on conflict (profile_id, kst_date) do nothing;
insert into public.profile_login_days (profile_id, kst_date) values (pg_temp.fx('student'), date '2026-11-24')
  on conflict (profile_id, kst_date) do nothing;
select pg_temp.expect_int('on conflict do nothing 은 같은 날을 한 줄로 두고 다음 날은 새 줄이다',
  (select count(*) from public.profile_login_days where profile_id = pg_temp.fx('student')), 2);
select pg_temp.expect_error('kst_date 는 비울 수 없다',
  $$insert into public.profile_login_days (profile_id) values (pg_temp.fx('qa'))$$, '23502');
select pg_temp.expect_error('없는 프로필은 넣을 수 없다',
  $$insert into public.profile_login_days (profile_id, kst_date) values (gen_random_uuid(), date '2026-11-23')$$, '23503');

select pg_temp.expect_bool('기본 키는 (profile_id, kst_date) 순서다',
  (select pg_get_constraintdef(oid) = 'PRIMARY KEY (profile_id, kst_date)'
     from pg_constraint where conrelid = 'public.profile_login_days'::regclass and contype = 'p'), true);
select pg_temp.expect_bool('기간 조회용 인덱스는 kst_date 가 맨 앞이다',
  exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'profile_login_days'
           and indexdef like '%(kst_date, profile_id)%'), true);

select pg_temp.expect_bool('RLS 가 켜져 있다',
  (select relrowsecurity from pg_class where oid = 'public.profile_login_days'::regclass), true);
select pg_temp.expect_int('정책이 없다',
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'profile_login_days'), 0);
select pg_temp.expect_bool('anon, authenticated 는 읽기와 쓰기 권한이 없다',
  not has_table_privilege('anon', 'public.profile_login_days', 'select')
  and not has_table_privilege('anon', 'public.profile_login_days', 'insert')
  and not has_table_privilege('authenticated', 'public.profile_login_days', 'select')
  and not has_table_privilege('authenticated', 'public.profile_login_days', 'insert'), true);
select pg_temp.expect_bool('service_role 은 읽고 쓴다',
  has_table_privilege('service_role', 'public.profile_login_days', 'select')
  and has_table_privilege('service_role', 'public.profile_login_days', 'insert')
  and has_table_privilege('service_role', 'public.profile_login_days', 'delete'), true);
select pg_temp.expect_bool('QA 본사 관리자 쓰기 차단 트리거가 걸려 있다',
  exists (select 1 from pg_trigger where tgrelid = 'public.profile_login_days'::regclass
           and tgname = 'trg_qa_admin_write_block'), true);

delete from auth.users where id = pg_temp.fx('student');
select pg_temp.expect_int('프로필이 지워지면 로그인 기록도 지워진다',
  (select count(*) from public.profile_login_days where profile_id = pg_temp.fx('student')), 0);

do $$ begin raise notice '=== b2b-hq-login-days.spec: 전체 통과 ==='; end $$;

rollback;
