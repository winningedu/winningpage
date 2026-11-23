-- =====================================================================
-- UTC 전환 U0b: 시간대 인자를 받는 DB 헬퍼와 time_zone 컬럼 SQL 스펙
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/utc-time-helpers.spec.sql
--
-- 전체가 한 트랜잭션이고 마지막에 ROLLBACK 한다. 어떤 데이터도 남기지
-- 않는다. 단언 실패는 예외로 터져 psql 이 비정상 종료(ON_ERROR_STOP)한다.
-- =====================================================================
begin;

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

create function pg_temp.expect_ok(t text, p_sql text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise notice '[PASS] % 성공', t;
end $$;

create function pg_temp.expect_text(t text, got text, want text) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '[FAIL] %: got %, want %', t, got, want;
  end if;
  raise notice '[PASS] % = %', t, want;
end $$;

-- ---------------------------------------------------------------------
-- fn_is_valid_time_zone
-- ---------------------------------------------------------------------
select pg_temp.expect_text('유효: Asia/Seoul', public.fn_is_valid_time_zone('Asia/Seoul')::text, 'true');
select pg_temp.expect_text('유효: UTC', public.fn_is_valid_time_zone('UTC')::text, 'true');
select pg_temp.expect_text('유효: America/New_York', public.fn_is_valid_time_zone('America/New_York')::text, 'true');
select pg_temp.expect_text('무효: 빈 문자열', public.fn_is_valid_time_zone('')::text, 'false');
select pg_temp.expect_text('무효: null 은 null 이 아니라 false', public.fn_is_valid_time_zone(null)::text, 'false');
select pg_temp.expect_text('무효: KST', public.fn_is_valid_time_zone('KST')::text, 'false');
select pg_temp.expect_text('무효: +09:00', public.fn_is_valid_time_zone('+09:00')::text, 'false');
select pg_temp.expect_text('무효: UTC+9', public.fn_is_valid_time_zone('UTC+9')::text, 'false');
select pg_temp.expect_text('무효: Not/AZone', public.fn_is_valid_time_zone('Not/AZone')::text, 'false');

-- ---------------------------------------------------------------------
-- fn_local_date
-- ---------------------------------------------------------------------
select pg_temp.expect_text('local_date: 서울 15:00Z 는 다음 날',
  public.fn_local_date('2026-11-22 15:00:00+00', 'Asia/Seoul')::text, '2026-11-23');
select pg_temp.expect_text('local_date: 서울 14:59:59Z 는 같은 날',
  public.fn_local_date('2026-11-22 14:59:59+00', 'Asia/Seoul')::text, '2026-11-22');
select pg_temp.expect_text('local_date: LA 2026-11-23 07:59:59Z 는 전날',
  public.fn_local_date('2026-11-23 07:59:59+00', 'America/Los_Angeles')::text, '2026-11-22');
select pg_temp.expect_text('local_date: LA 2026-11-23 08:00:00Z 는 당일',
  public.fn_local_date('2026-11-23 08:00:00+00', 'America/Los_Angeles')::text, '2026-11-23');

-- ---------------------------------------------------------------------
-- fn_day_start
-- ---------------------------------------------------------------------
select pg_temp.expect_text('day_start: 서울 2026-11-23',
  (public.fn_day_start('2026-11-23', 'Asia/Seoul') at time zone 'UTC')::text, '2026-11-22 15:00:00');
select pg_temp.expect_text('day_start: 뉴욕 DST 시작일 2026-03-08 은 -05:00',
  (public.fn_day_start('2026-03-08', 'America/New_York') at time zone 'UTC')::text, '2026-03-08 05:00:00');

-- ---------------------------------------------------------------------
-- fn_add_months: Asia/Seoul 에서 fn_add_months_kst 와 같다
-- ---------------------------------------------------------------------
create function pg_temp.same_as_kst(t text, p_ts timestamptz, p_months int) returns void
language plpgsql as $$
declare
  v_new timestamptz := public.fn_add_months(p_ts, p_months, 'Asia/Seoul');
  v_old timestamptz := public.fn_add_months_kst(p_ts, p_months);
begin
  if v_new is distinct from v_old then
    raise exception '[FAIL] %: fn_add_months %, fn_add_months_kst %', t, v_new, v_old;
  end if;
  raise notice '[PASS] % = %', t, v_new;
end $$;

select pg_temp.same_as_kst('add_months: 1/31 + 1개월', '2026-01-30 15:00:00+00', 1);
select pg_temp.same_as_kst('add_months: 윤년 2/29 + 12개월', '2028-02-28 15:00:00+00', 12);
select pg_temp.same_as_kst('add_months: KST 하루 끝 14:59:59Z', '2026-01-31 14:59:59+00', 1);
select pg_temp.same_as_kst('add_months: KST 다음 날 첫 15:00:00Z', '2026-01-31 15:00:00+00', 1);
select pg_temp.expect_text('add_months: months null 은 null',
  (public.fn_add_months('2026-01-31 00:00:00+00', null, 'Asia/Seoul') is null)::text, 'true');
select pg_temp.expect_text('add_months: 뉴욕 2026-01-31 12:00-05 + 1개월 은 2/28 뉴욕 자정',
  (public.fn_add_months('2026-01-31 17:00:00+00', 1, 'America/New_York') at time zone 'UTC')::text,
  '2026-02-28 05:00:00');

-- ---------------------------------------------------------------------
-- 세션 TimeZone 설정과 무관하다
-- ---------------------------------------------------------------------
-- 출력 문자열은 세션 TimeZone 을 따르므로 UTC 로 고정해서 비교한다.
create function pg_temp.snapshot_utc() returns text
language sql as $$
  select concat_ws('|',
    public.fn_local_date('2026-11-22 15:00:00+00', 'Asia/Seoul')::text,
    (public.fn_day_start('2026-03-08', 'America/New_York') at time zone 'UTC')::text,
    (public.fn_add_months('2026-01-31 14:59:59+00', 1, 'Asia/Seoul') at time zone 'UTC')::text)
$$;

do $$
declare
  v_a text;
  v_b text;
begin
  set local time zone 'UTC';
  v_a := pg_temp.snapshot_utc();
  set local time zone 'America/New_York';
  v_b := pg_temp.snapshot_utc();
  if v_a is distinct from v_b then
    raise exception '[FAIL] 세션 TimeZone 에 따라 결과가 달라진다: % vs %', v_a, v_b;
  end if;
  raise notice '[PASS] 세션 TimeZone 이 달라도 같은 결과 %', v_a;
end $$;

rollback;
