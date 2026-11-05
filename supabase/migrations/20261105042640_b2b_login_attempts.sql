-- B2B 기반 5: 로그인 시도 횟수 제한(잠금) 테이블과 begin/end 함수.
-- 새 테이블은 비어 있고 어디서도 참조하지 않아 위닝 사이트 DB 에서는 쓰이지 않는다.
-- tenant_code_attempts 와 같은 방식: RLS 를 켜고 정책 없이 anon, authenticated 권한을 모두 회수하고
-- service_role 만 부르는 SECURITY DEFINER 함수로만 접근한다.

create table public.login_attempts (
  identifier_hash bytea primary key,
  failed_count smallint not null default 0 check (failed_count between 0 and 5),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create index login_attempts_updated_at_idx on public.login_attempts (updated_at);

alter table public.login_attempts enable row level security;
revoke all on table public.login_attempts from anon, authenticated;
grant all on table public.login_attempts to service_role;

comment on table public.login_attempts is '로그인 식별자별 연속 실패 횟수와 잠금. identifier_hash = sha256(lower(btrim(식별자))). fn_login_attempt_begin 이 인증 전에 먼저 센다.';

-- 인증 전에 먼저 한 번 센다. 잠금 중이면 locked 만 돌려주고 센 값을 늘리지 않는다.
-- 잠금이 끝났으면 0부터 다시 센다. 5번째 시도는 proceed 로 통과시키되 10분 잠금을 건다
-- (5번째에 맞는 비밀번호를 넣으면 end(success) 가 행을 지운다).
-- 행 잠금 아래에서 한 번에 처리하므로 병렬 요청이 4회째 값을 같이 읽고 통과하지 못한다.
-- 하루 지난 행은 호출 때마다 정리한다(fn_resolve_tenant_code 와 같은 방식).
create function public.fn_login_attempt_begin(p_hash bytea)
returns table (outcome text, attempt_no smallint, retry_after_s integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.login_attempts;
  v_count smallint;
  v_locked_until timestamptz;
begin
  delete from public.login_attempts where updated_at < now() - interval '1 day';

  insert into public.login_attempts (identifier_hash) values (p_hash)
  on conflict (identifier_hash) do nothing;

  select * into v_row from public.login_attempts a where a.identifier_hash = p_hash for update;

  if v_row.locked_until is not null and v_row.locked_until > now() then
    return query select 'locked'::text, v_row.failed_count,
      ceil(extract(epoch from v_row.locked_until - now()))::integer;
    return;
  end if;

  -- 잠금이 끝난 행은 0부터 다시 센다.
  v_count := case when v_row.locked_until is not null then 1 else v_row.failed_count + 1 end;
  v_locked_until := case when v_count >= 5 then now() + interval '10 minutes' end;

  update public.login_attempts a
     set failed_count = v_count, locked_until = v_locked_until, updated_at = now()
   where a.identifier_hash = p_hash;

  return query select 'proceed'::text, v_count,
    case when v_locked_until is null then 0
         else ceil(extract(epoch from v_locked_until - now()))::integer end;
end;
$$;

-- success: 행 삭제(성공하면 초기화). invalid: 이미 센 시도라 아무것도 안 한다.
-- error: 인증 서버 오류(429, 5xx, 시간 초과)로 끝난 시도라 이번 시도를 취소한다
-- (횟수 1 감소, 잠금은 풀린다. 횟수가 5 미만이 되므로 잠금과 모순되지 않는다).
create function public.fn_login_attempt_end(p_hash bytea, p_outcome text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_outcome = 'success' then
    delete from public.login_attempts where identifier_hash = p_hash;
  elsif p_outcome = 'error' then
    update public.login_attempts
       set failed_count = greatest(failed_count - 1, 0), locked_until = null, updated_at = now()
     where identifier_hash = p_hash;
  elsif p_outcome <> 'invalid' then
    raise exception 'unknown login attempt outcome' using errcode = 'invalid_parameter_value';
  end if;
end;
$$;

revoke all on function public.fn_login_attempt_begin(bytea) from public, anon, authenticated;
grant execute on function public.fn_login_attempt_begin(bytea) to service_role;
revoke all on function public.fn_login_attempt_end(bytea, text) from public, anon, authenticated;
grant execute on function public.fn_login_attempt_end(bytea, text) to service_role;
