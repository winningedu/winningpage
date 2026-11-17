-- 로그인 잠금을 (계정, 요청 IP) 쌍마다 센다. 주소만 알면 남의 계정을 계속 잠글 수 있던 문제를 막는다.
-- 쌍: 5회 실패하면 그 쌍만 10분 잠긴다. 계정: 모든 IP 를 합쳐 50회 실패하면 계정 전체가 10분 잠긴다.
-- 계정 행은 identifier_hash = 계정 해시(sha256(lower(btrim(인증 이메일)))), account_hash 는 비워 둔다.
-- 쌍 행은 identifier_hash = sha256(0xff || 계정 해시 || IP), account_hash = 계정 해시.
-- expand 단계: 배포 중인 앱이 부르는 fn_login_attempt_begin/end 는 그대로 둔다(다음 마이그레이션에서 지운다).

alter table public.login_attempts add column account_hash bytea;
alter table public.login_attempts drop constraint login_attempts_failed_count_check;
alter table public.login_attempts add constraint login_attempts_failed_count_check
  check (failed_count between 0 and 50);

create index login_attempts_account_hash_idx on public.login_attempts (account_hash);

comment on table public.login_attempts is '로그인 실패 횟수와 잠금. 계정 행(identifier_hash = sha256(lower(btrim(인증 이메일))), 50회 잠금)과 (계정, IP) 쌍 행(identifier_hash = sha256(0xff || 계정 해시 || IP), account_hash = 계정 해시, 5회 잠금). fn_login_lock_begin 이 인증 전에 먼저 센다.';

-- 인증 전에 쌍 행과 계정 행을 함께 한 번 센다. 둘 중 하나라도 잠겨 있으면 locked 만 돌려주고 늘리지 않는다
-- (어느 쪽이 잠겼는지는 알리지 않고 남은 시간이 긴 쪽을 준다). 잠금이 끝난 행은 0부터 다시 센다.
-- 두 행은 identifier_hash 순서로 FOR UPDATE 잠가 병렬 요청끼리 교착되지 않는다.
create function public.fn_login_lock_begin(p_account_hash bytea, p_pair_hash bytea)
returns table (outcome text, attempt_no smallint, account_attempt_no smallint, retry_after_s integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pair public.login_attempts;
  v_account public.login_attempts;
  v_pair_count smallint;
  v_account_count smallint;
  v_pair_locked_until timestamptz;
  v_account_locked_until timestamptz;
  v_until timestamptz;
begin
  delete from public.login_attempts where updated_at < now() - interval '1 day';

  insert into public.login_attempts (identifier_hash, account_hash)
  values (p_account_hash, null), (p_pair_hash, p_account_hash)
  on conflict (identifier_hash) do nothing;

  perform 1 from public.login_attempts a
   where a.identifier_hash in (p_account_hash, p_pair_hash)
   order by a.identifier_hash
     for update;

  select * into v_pair from public.login_attempts a where a.identifier_hash = p_pair_hash;
  select * into v_account from public.login_attempts a where a.identifier_hash = p_account_hash;

  v_until := greatest(
    case when v_pair.locked_until > now() then v_pair.locked_until end,
    case when v_account.locked_until > now() then v_account.locked_until end);
  if v_until is not null then
    return query select 'locked'::text, v_pair.failed_count, v_account.failed_count,
      ceil(extract(epoch from v_until - now()))::integer;
    return;
  end if;

  v_pair_count := case when v_pair.locked_until is not null then 1 else v_pair.failed_count + 1 end;
  v_account_count := case when v_account.locked_until is not null then 1 else v_account.failed_count + 1 end;
  v_pair_locked_until := case when v_pair_count >= 5 then now() + interval '10 minutes' end;
  v_account_locked_until := case when v_account_count >= 50 then now() + interval '10 minutes' end;

  update public.login_attempts a
     set failed_count = v_pair_count, locked_until = v_pair_locked_until, updated_at = now()
   where a.identifier_hash = p_pair_hash;
  update public.login_attempts a
     set failed_count = v_account_count, locked_until = v_account_locked_until, updated_at = now()
   where a.identifier_hash = p_account_hash;

  v_until := greatest(v_pair_locked_until, v_account_locked_until);
  return query select 'proceed'::text, v_pair_count, v_account_count,
    case when v_until is null then 0
         else ceil(extract(epoch from v_until - now()))::integer end;
end;
$$;

revoke all on function public.fn_login_lock_begin(bytea, bytea) from public, anon, authenticated;
grant execute on function public.fn_login_lock_begin(bytea, bytea) to service_role;
