-- =====================================================================
-- B2B 기반 12: 보관 기간 정리 함수 SQL 스펙 (T23)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-retention-purge.spec.sql
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

create temp table fx (k text primary key, v uuid);
insert into public.tenants (code, name, region, org_type, tier)
  values ('RPAAAAAA', 't23-a', '서울', '학교', 'B');
insert into fx select 'ta', id from public.tenants where code = 'RPAAAAAA';
insert into fx values
  ('old', pg_temp.mk_user('t23-old@t.local')),       -- 3년 전 졸업
  ('edge_out', pg_temp.mk_user('t23-eo@t.local')),   -- 2년 하루 전 졸업
  ('edge_in', pg_temp.mk_user('t23-ei@t.local')),    -- 2년 하루 안 됨
  ('recent', pg_temp.mk_user('t23-rc@t.local')),     -- 1년 전 졸업
  ('back', pg_temp.mk_user('t23-bk@t.local')),       -- 옛 졸업 기록이 있지만 지금 재학 중
  ('active', pg_temp.mk_user('t23-ac@t.local'));
create function pg_temp.fx(p_k text) returns uuid language sql as $$ select v from fx where k = p_k $$;

create function pg_temp.enr(p_student text, p_year integer, p_graduated interval) returns void
language sql as $$
  insert into public.student_enrollments (tenant_id, student_id, school_year, status, graduated_at)
  values (pg_temp.fx('ta'), pg_temp.fx(p_student), p_year,
    case when p_graduated is null then 'active' else 'graduated' end,
    case when p_graduated is null then null else now() - p_graduated end)
$$;
create function pg_temp.chg(p_student text, p_year integer) returns void
language sql as $$
  insert into public.enrollment_changes (tenant_id, student_id, school_year, kind, status)
  values (pg_temp.fx('ta'), pg_temp.fx(p_student), p_year, 'rollover', 'applied')
$$;

select pg_temp.enr('old', 2022, interval '3 years');
select pg_temp.enr('old', 2021, interval '4 years');
select pg_temp.chg('old', 2022);
select pg_temp.enr('edge_out', 2023, interval '2 years 1 day');
select pg_temp.chg('edge_out', 2023);
select pg_temp.enr('edge_in', 2023, interval '1 year 364 days');
select pg_temp.chg('edge_in', 2023);
select pg_temp.enr('recent', 2025, interval '1 year');
select pg_temp.chg('recent', 2025);
select pg_temp.enr('back', 2020, interval '5 years');
select pg_temp.enr('back', 2026, null);
select pg_temp.chg('back', 2020);
select pg_temp.enr('active', 2026, null);
select pg_temp.chg('active', 2026);

create function pg_temp.log(p_action text, p_age interval) returns void
language sql as $$
  insert into public.admin_access_logs (actor_login_id, actor_kind, action, resource_key, tenant_id, created_at, target_id)
  values ('t23-spec', 'teacher', p_action, 't23.spec', pg_temp.fx('ta'), now() - p_age,
    pg_temp.fx('ta'))
$$;
select pg_temp.log('view', interval '3 years');
select pg_temp.log('update', interval '25 months');
select pg_temp.log('view', interval '1 year 6 months');
select pg_temp.log('member_purge', interval '13 months');
select pg_temp.log('member_purge', interval '6 months');
select pg_temp.log('view', interval '1 day');

create temp table purge_result as select * from public.fn_purge_b2b_retention();

create function pg_temp.enr_n(p_student text) returns bigint language sql as $$
  select count(*) from public.student_enrollments where student_id = pg_temp.fx(p_student)
$$;
create function pg_temp.chg_n(p_student text) returns bigint language sql as $$
  select count(*) from public.enrollment_changes where student_id = pg_temp.fx(p_student)
$$;
create function pg_temp.logs_n(p_action text, p_age_min interval, p_age_max interval) returns bigint
language sql as $$
  select count(*) from public.admin_access_logs
   where actor_login_id = 't23-spec' and action = p_action
     and created_at <= now() - p_age_min and created_at > now() - p_age_max
$$;

-- 졸업 2년이 지난 학생: 학적 이력과 학적이 모두 사라진다(모든 학년도).
select pg_temp.expect_int('3년 전 졸업생 학적', pg_temp.enr_n('old'), 0);
select pg_temp.expect_int('3년 전 졸업생 이력', pg_temp.chg_n('old'), 0);
select pg_temp.expect_int('2년 하루 지난 졸업생 학적', pg_temp.enr_n('edge_out'), 0);
select pg_temp.expect_int('2년 하루 지난 졸업생 이력', pg_temp.chg_n('edge_out'), 0);
-- 2년이 안 됐거나 재학 중이면 남는다.
select pg_temp.expect_int('2년 안 된 졸업생 학적', pg_temp.enr_n('edge_in'), 1);
select pg_temp.expect_int('2년 안 된 졸업생 이력', pg_temp.chg_n('edge_in'), 1);
select pg_temp.expect_int('1년 전 졸업생 학적', pg_temp.enr_n('recent'), 1);
select pg_temp.expect_int('1년 전 졸업생 이력', pg_temp.chg_n('recent'), 1);
select pg_temp.expect_int('옛 졸업 기록이 있어도 재학 중이면 학적 보존', pg_temp.enr_n('back'), 2);
select pg_temp.expect_int('옛 졸업 기록이 있어도 재학 중이면 이력 보존', pg_temp.chg_n('back'), 1);
select pg_temp.expect_int('재학생 학적', pg_temp.enr_n('active'), 1);
select pg_temp.expect_int('재학생 이력', pg_temp.chg_n('active'), 1);

-- 접근 로그: 2년이 지난 일반 행, 1년이 지난 member_purge 행만 사라진다.
select pg_temp.expect_int('3년 된 view 삭제', pg_temp.logs_n('view', interval '2 years 1 day', interval '100 years'), 0);
select pg_temp.expect_int('25개월 된 update 삭제', pg_temp.logs_n('update', interval '0', interval '100 years'), 0);
select pg_temp.expect_int('1년 6개월 된 view 보존', pg_temp.logs_n('view', interval '1 year', interval '2 years'), 1);
select pg_temp.expect_int('최근 view 보존', pg_temp.logs_n('view', interval '0', interval '2 days'), 1);
select pg_temp.expect_int('13개월 된 member_purge 삭제', pg_temp.logs_n('member_purge', interval '1 year', interval '100 years'), 0);
select pg_temp.expect_int('6개월 된 member_purge 보존', pg_temp.logs_n('member_purge', interval '0', interval '1 year'), 1);

-- 반환 건수는 지운 행 수 이상이다(로컬 DB 에 다른 행이 있을 수 있다).
select pg_temp.expect_bool('반환 건수',
  (select enrollments_deleted >= 3 and enrollment_changes_deleted >= 2 and access_logs_deleted >= 3 from purge_result), true);

-- 다시 불러도 같다(지울 것이 없다).
select pg_temp.expect_int('재실행은 아무것도 지우지 않는다',
  (select enrollments_deleted + enrollment_changes_deleted + access_logs_deleted from public.fn_purge_b2b_retention()), 0);

-- ---------------------------------------------------------------------
-- 클라이언트 role 차단
-- ---------------------------------------------------------------------
grant execute on function pg_temp.expect_error(text, text, text) to anon, authenticated;
set local role anon;
select pg_temp.expect_error('anon 은 fn_purge_b2b_retention 실행 불가',
  $$select * from public.fn_purge_b2b_retention()$$, '42501');
reset role;
set local role authenticated;
select pg_temp.expect_error('authenticated 는 fn_purge_b2b_retention 실행 불가',
  $$select * from public.fn_purge_b2b_retention()$$, '42501');
reset role;

do $$ begin raise notice '=== b2b-retention-purge.spec: 전체 통과 ==='; end $$;

rollback;
