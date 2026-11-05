-- =====================================================================
-- B2B 기반 6: 접근 로그 확장(admin_access_logs 컬럼, CHECK, 뷰) SQL 스펙 (T8)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-access-log.spec.sql
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


create temp table fx (k text primary key, v uuid);
insert into public.tenants (code, name, region, org_type, tier)
  values ('T8AAAAAA', 't8-a', '서울', '학교', 'B');
insert into fx select 'tenant', id from public.tenants where code = 'T8AAAAAA';
insert into public.teachers (tenant_id, name, phone, role)
  values ((select v from fx where k = 'tenant'), '김교사', '01088880001', 'homeroom');
insert into fx select 'teacher', id from public.teachers where phone = '01088880001';

-- 로그 한 줄 insert 헬퍼. 지정하지 않은 값은 null.
create function pg_temp.log_row(
  p_action text, p_email text default null, p_reason text default null,
  p_kind text default null, p_login text default null,
  p_tenant boolean default false, p_teacher boolean default false
) returns void
language plpgsql as $$
begin
  insert into public.admin_access_logs
    (actor_email, action, resource_key, reason, actor_kind, actor_login_id, tenant_id, teacher_id)
  values (p_email, p_action, 'students', p_reason, p_kind, p_login,
    case when p_tenant then (select v from fx where k = 'tenant') end,
    case when p_teacher then (select v from fx where k = 'teacher') end);
end $$;

-- ---------------------------------------------------------------------
-- 기존 본사 행 규칙(이메일 + 사유)은 그대로
-- ---------------------------------------------------------------------
select pg_temp.expect_ok('본사 행: 이메일과 사유가 있으면 통과',
  $$select pg_temp.log_row('download', 'hq@example.com', '정산 확인')$$);
select pg_temp.expect_error('본사 행: 사유 없이 insert 거부',
  $$select pg_temp.log_row('download', 'hq@example.com')$$, '23514');
select pg_temp.expect_error('본사 행: 공백 사유 거부',
  $$select pg_temp.log_row('download', 'hq@example.com', '  ')$$, '23514');
select pg_temp.expect_error('이메일도 로그인 아이디도 없는 행 거부',
  $$select pg_temp.log_row('view', null, null, 'teacher')$$, '23514');

-- ---------------------------------------------------------------------
-- 교사 행: 사유 없이 로그인 아이디와 소속만으로 통과
-- ---------------------------------------------------------------------
select pg_temp.expect_ok('교사 행: 사유 null, 로그인 아이디, 소속, 교사 id',
  $$select pg_temp.log_row('view', null, null, 'teacher', 'T8AAAAAAAAAAAA', true, true)$$);
select pg_temp.expect_error('actor_kind 목록 밖 거부',
  $$select pg_temp.log_row('view', null, null, 'principal', 'T8AAAAAAAAAAAA')$$, '23514');
select pg_temp.expect_ok('hq_proxy 행: 이메일과 로그인 아이디 중 하나만 있어도 통과',
  $$select pg_temp.log_row('proxy_start', 'hq@example.com', null, 'hq_proxy', null, true)$$);

-- 새 action 이 모두 허용되고, 모르는 action 은 거부된다
do $$
declare
  v_action text;
begin
  foreach v_action in array array['download', 'unmask', 'view', 'report_view', 'update', 'export',
    'account_issue', 'account_reissue', 'account_status', 'account_delete', 'password_set',
    'teacher_import', 'proxy_start', 'proxy_end', 'settings_change', 'member_purge']
  loop
    perform pg_temp.log_row(v_action, null, null, 'school_admin', 'T8AAAAAAAAAAAA');
  end loop;
  raise notice '[PASS] 16개 action 모두 허용';
end $$;
select pg_temp.expect_error('모르는 action 거부',
  $$select pg_temp.log_row('delete_everything', null, null, 'school_admin', 'T8AAAAAAAAAAAA')$$, '23514');

-- meta 는 기본 빈 객체
select pg_temp.expect_text('meta 기본값은 빈 객체',
  (select meta::text from public.admin_access_logs where actor_kind = 'teacher' limit 1), '{}');

-- ---------------------------------------------------------------------
-- 열람 뷰: 기관 코드, 행위자 종류, 로그인 아이디, 대행 여부
-- ---------------------------------------------------------------------
select pg_temp.expect_text('뷰: 교사 행의 기관 코드, 종류, 로그인 아이디',
  (select tenant_code || '/' || actor_kind || '/' || actor_login_id || '/' || is_proxy
     from public.admin_access_log_entries
    where actor_kind = 'teacher' and actor_login_id = 'T8AAAAAAAAAAAA'),
  'T8AAAAAA/teacher/T8AAAAAAAAAAAA/false');
select pg_temp.expect_text('뷰: 대행 행은 is_proxy true',
  (select is_proxy::text from public.admin_access_log_entries where actor_kind = 'hq_proxy'), 'true');
select pg_temp.expect_text('뷰: 기존 본사 행은 새 컬럼이 비어 있다',
  (select coalesce(tenant_code, '-') || '/' || coalesce(actor_kind, '-') || '/' || is_proxy
     from public.admin_access_log_entries where reason = '정산 확인'),
  '-/-/false');

-- 기존 RLS 는 그대로: 일반 로그인 사용자는 로그를 읽을 수 없다
grant execute on function pg_temp.expect_int(text, bigint, bigint) to authenticated;
set local role authenticated;
select pg_temp.expect_int('authenticated 일반 사용자는 로그 0행',
  (select count(*) from public.admin_access_logs), 0);
reset role;

do $$ begin raise notice '=== b2b-access-log.spec: 전체 통과 ==='; end $$;

rollback;
