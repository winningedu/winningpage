-- =====================================================================
-- B2B 기반 5: 로그인 시도 횟수 제한 테이블과 begin/end 함수 SQL 스펙 (T5)
--
-- 실행: 마이그레이션이 전부 적용된 스택에서
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/b2b-login-attempts.spec.sql
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

-- 식별자 해시: 앞뒤 공백과 대소문자를 무시하는 sha256 (API 가 같은 방식으로 만든다)
create function pg_temp.h(p_id text) returns bytea language sql as $$
  select extensions.digest(lower(btrim(p_id)), 'sha256')
$$;

-- begin 을 부르고 (outcome, attempt_no, retry_after_s) 를 "outcome:no:retry" 로 돌려준다.
create function pg_temp.begin_s(p_id text) returns text language sql as $$
  select outcome || ':' || attempt_no || ':' || retry_after_s
  from public.fn_login_attempt_begin(pg_temp.h(p_id))
$$;

create function pg_temp.row_s(p_id text) returns text language sql as $$
  select coalesce((select failed_count || ':' || (locked_until is not null)
    from public.login_attempts where identifier_hash = pg_temp.h(p_id)), 'none')
$$;

-- ---------------------------------------------------------------------
-- 실패 4번은 1..4, 5번째가 10분 잠금을 건다
-- ---------------------------------------------------------------------
select pg_temp.expect_text('1번째 시도', pg_temp.begin_s('u1'), 'proceed:1:0');
select pg_temp.expect_text('2번째 시도', pg_temp.begin_s('u1'), 'proceed:2:0');
select pg_temp.expect_text('3번째 시도', pg_temp.begin_s('u1'), 'proceed:3:0');
select pg_temp.expect_text('4번째 시도', pg_temp.begin_s('u1'), 'proceed:4:0');
select pg_temp.expect_text('4번째까지는 잠금 없음', pg_temp.row_s('u1'), '4:false');
select pg_temp.expect_text('5번째 시도는 통과시키되 600초 잠금', pg_temp.begin_s('u1'), 'proceed:5:600');
select pg_temp.expect_text('5번째 이후 잠금이 걸린 행', pg_temp.row_s('u1'), '5:true');
select pg_temp.expect_bool('잠금은 지금부터 10분',
  (select locked_until = now() + interval '10 minutes' from public.login_attempts where identifier_hash = pg_temp.h('u1')), true);

-- 잠금 중에는 locked, 횟수는 늘지 않는다
select pg_temp.expect_text('잠금 중 begin 은 locked', pg_temp.begin_s('u1'), 'locked:5:600');
select pg_temp.expect_text('잠금 중 반복해도 횟수 그대로', pg_temp.row_s('u1'), '5:true');
select pg_temp.expect_text('잠금 중 end(success) 가 아니면 행 유지', pg_temp.row_s('u1'), '5:true');

-- 식별자는 대소문자, 앞뒤 공백을 무시한다
select pg_temp.expect_text('대소문자와 공백을 무시해 같은 키', pg_temp.begin_s('  U1 '), 'locked:5:600');

-- 다른 식별자는 서로 영향이 없다
select pg_temp.expect_text('다른 식별자는 1부터', pg_temp.begin_s('u2'), 'proceed:1:0');

-- 잠금이 끝나면 1부터 다시 센다
update public.login_attempts set locked_until = now() - interval '1 second'
  where identifier_hash = pg_temp.h('u1');
select pg_temp.expect_text('잠금 만료 후 다시 1', pg_temp.begin_s('u1'), 'proceed:1:0');
select pg_temp.expect_text('만료 후 잠금 해제', pg_temp.row_s('u1'), '1:false');

-- end(success) 는 행을 지운다
select public.fn_login_attempt_end(pg_temp.h('u1'), 'success');
select pg_temp.expect_text('success 는 행 삭제', pg_temp.row_s('u1'), 'none');
select pg_temp.expect_text('success 후 다시 1', pg_temp.begin_s('u1'), 'proceed:1:0');

-- end(invalid) 는 아무것도 하지 않는다
select public.fn_login_attempt_end(pg_temp.h('u1'), 'invalid');
select pg_temp.expect_text('invalid 는 그대로', pg_temp.row_s('u1'), '1:false');

-- end(error) 는 이번 시도를 취소한다
select pg_temp.begin_s('u1');
select pg_temp.begin_s('u1');
select pg_temp.expect_text('error 전 3회', pg_temp.row_s('u1'), '3:false');
select public.fn_login_attempt_end(pg_temp.h('u1'), 'error');
select pg_temp.expect_text('error 는 1회 되돌림', pg_temp.row_s('u1'), '2:false');

-- 5번째 시도가 인증 서버 오류로 끝나면 잠금도 되돌린다
select pg_temp.begin_s('u1');
select pg_temp.begin_s('u1');
select pg_temp.expect_text('error 취소 뒤 다시 쌓아 4회', pg_temp.row_s('u1'), '4:false');
select pg_temp.begin_s('u1');
select pg_temp.expect_text('5회 잠금 상태', pg_temp.row_s('u1'), '5:true');
select public.fn_login_attempt_end(pg_temp.h('u1'), 'error');
select pg_temp.expect_text('잠금을 만든 시도의 error 는 4회와 잠금 해제', pg_temp.row_s('u1'), '4:false');

-- 없는 행이나 0회에서 error 는 아무 일도 없다
select public.fn_login_attempt_end(pg_temp.h('nobody'), 'error');
select pg_temp.expect_text('없는 행 error 는 무시', pg_temp.row_s('nobody'), 'none');
select pg_temp.begin_s('u3');
select public.fn_login_attempt_end(pg_temp.h('u3'), 'error');
select public.fn_login_attempt_end(pg_temp.h('u3'), 'error');
select pg_temp.expect_text('error 는 0 아래로 내려가지 않는다', pg_temp.row_s('u3'), '0:false');

select pg_temp.expect_error('알 수 없는 outcome 거부',
  $$select public.fn_login_attempt_end(pg_temp.h('u1'), 'bogus')$$, '22023');

-- 하루 지난 행은 begin 이 정리한다
update public.login_attempts set updated_at = now() - interval '2 days'
  where identifier_hash = pg_temp.h('u2');
select pg_temp.begin_s('u4');
select pg_temp.expect_text('오래된 행은 정리된다', pg_temp.row_s('u2'), 'none');
select pg_temp.expect_text('최근 행은 남는다', pg_temp.row_s('u4'), '1:false');

-- ---------------------------------------------------------------------
-- 클라이언트 role 은 테이블을 읽을 수 없고 함수를 실행할 수 없다
-- ---------------------------------------------------------------------
grant execute on function pg_temp.expect_error(text, text, text) to anon, authenticated;
set local role anon;
select pg_temp.expect_error('anon 은 login_attempts 조회 불가',
  $$select count(*) from public.login_attempts$$, '42501');
select pg_temp.expect_error('anon 은 begin 실행 불가',
  $$select * from public.fn_login_attempt_begin('\x00'::bytea)$$, '42501');
select pg_temp.expect_error('anon 은 end 실행 불가',
  $$select public.fn_login_attempt_end('\x00'::bytea, 'success')$$, '42501');
reset role;
set local role authenticated;
select pg_temp.expect_error('authenticated 는 login_attempts 조회 불가',
  $$select count(*) from public.login_attempts$$, '42501');
select pg_temp.expect_error('authenticated 는 begin 실행 불가',
  $$select * from public.fn_login_attempt_begin('\x00'::bytea)$$, '42501');
select pg_temp.expect_error('authenticated 는 end 실행 불가',
  $$select public.fn_login_attempt_end('\x00'::bytea, 'success')$$, '42501');
reset role;

do $$ begin raise notice '=== b2b-login-attempts.spec: 전체 통과 ==='; end $$;

rollback;
