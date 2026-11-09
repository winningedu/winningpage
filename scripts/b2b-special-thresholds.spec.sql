-- =====================================================================
-- 특이학생 감지 기준 열 SQL 스펙(사 #147, 결정 106 6번)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-special-thresholds.spec.sql
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

create function pg_temp.expect_bool(t text, got boolean, want boolean) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '[FAIL] %: got %, want %', t, got, want;
  end if;
  raise notice '[PASS] % = %', t, want;
end $$;

insert into public.tenants (code, name, region, org_type, tier)
  values ('STAAAAAA', 'st-a', '서울', '학교', 'B');

-- 새 열은 비어 있다(null 이면 코드의 기본값 7일, 14일을 쓴다)
select pg_temp.expect_bool('미접속 기준은 기본으로 null',
  (select special_inactive_days is null from public.tenants where code = 'STAAAAAA'), true);
select pg_temp.expect_bool('피드백 대기 기준은 기본으로 null',
  (select special_feedback_wait_days is null from public.tenants where code = 'STAAAAAA'), true);

-- 두 기준은 1 이상 365 이하이고 비워 둘 수 있다
select pg_temp.expect_ok('미접속 기준 비움(null)',
  $$update public.tenants set special_inactive_days = null where code = 'STAAAAAA'$$);
select pg_temp.expect_ok('미접속 기준 7',
  $$update public.tenants set special_inactive_days = 7 where code = 'STAAAAAA'$$);
select pg_temp.expect_ok('미접속 기준 365',
  $$update public.tenants set special_inactive_days = 365 where code = 'STAAAAAA'$$);
select pg_temp.expect_error('미접속 기준 0 은 23514',
  $$update public.tenants set special_inactive_days = 0 where code = 'STAAAAAA'$$, '23514');
select pg_temp.expect_error('미접속 기준 366 은 23514',
  $$update public.tenants set special_inactive_days = 366 where code = 'STAAAAAA'$$, '23514');

select pg_temp.expect_ok('피드백 대기 기준 비움(null)',
  $$update public.tenants set special_feedback_wait_days = null where code = 'STAAAAAA'$$);
select pg_temp.expect_ok('피드백 대기 기준 14',
  $$update public.tenants set special_feedback_wait_days = 14 where code = 'STAAAAAA'$$);
select pg_temp.expect_ok('피드백 대기 기준 365',
  $$update public.tenants set special_feedback_wait_days = 365 where code = 'STAAAAAA'$$);
select pg_temp.expect_error('피드백 대기 기준 0 은 23514',
  $$update public.tenants set special_feedback_wait_days = 0 where code = 'STAAAAAA'$$, '23514');
select pg_temp.expect_error('피드백 대기 기준 366 은 23514',
  $$update public.tenants set special_feedback_wait_days = 366 where code = 'STAAAAAA'$$, '23514');

rollback;
