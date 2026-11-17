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

-- success: 그 쌍 행과 계정 행을 지운다(맞는 비밀번호는 주인이라는 증거다). 같은 계정의 다른 쌍은 남긴다.
-- invalid: 이미 센 시도라 아무것도 안 한다.
-- error: 인증 서버 오류로 끝난 시도라 두 행에서 이번 시도를 취소한다. 행마다 begin 이 돌려준 번호가 아직
-- 현재 횟수일 때만 1 줄이고, 잠금은 그 시도가 직접 건 것(쌍 5번째, 계정 50번째)일 때만 푼다.
-- 번호 없이(null) 부르면 그 행은 건드리지 않는다. 두 행은 begin 과 같은 순서로 먼저 잠근다.
create function public.fn_login_lock_end(
  p_account_hash bytea,
  p_pair_hash bytea,
  p_outcome text,
  p_attempt_no smallint default null,
  p_account_attempt_no smallint default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_outcome not in ('success', 'invalid', 'error') then
    raise exception 'unknown login attempt outcome' using errcode = 'invalid_parameter_value';
  end if;

  perform 1 from public.login_attempts a
   where a.identifier_hash in (p_account_hash, p_pair_hash)
   order by a.identifier_hash
     for update;

  if p_outcome = 'success' then
    delete from public.login_attempts where identifier_hash in (p_account_hash, p_pair_hash);
  elsif p_outcome = 'error' then
    update public.login_attempts
       set failed_count = failed_count - 1,
           locked_until = case when p_attempt_no = 5 then null else locked_until end,
           updated_at = now()
     where identifier_hash = p_pair_hash and failed_count = p_attempt_no and failed_count > 0;
    update public.login_attempts
       set failed_count = failed_count - 1,
           locked_until = case when p_account_attempt_no = 50 then null else locked_until end,
           updated_at = now()
     where identifier_hash = p_account_hash and failed_count = p_account_attempt_no and failed_count > 0;
  end if;
end;
$$;

-- 비밀번호가 바뀌면(휴대폰 재설정, 교사 재설정, 이메일 링크 재설정, 콘솔과 마이페이지 변경) 그 계정의 계정 행과
-- 모든 쌍 행을 지운다. 열쇠는 앱과 같은 sha256(lower(btrim(인증 이메일))) 이다(api/_lib/auth/login.ts hashParam).
-- 어떤 오류도 비밀번호 변경을 막지 않도록 잡아서 경고만 남긴다(이메일은 남기지 않는다).
create function public.fn_login_attempts_clear_on_password_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash bytea;
begin
  if new.email is not null and btrim(new.email) <> '' then
    v_hash := extensions.digest(lower(btrim(new.email)), 'sha256');
    delete from public.login_attempts where identifier_hash = v_hash or account_hash = v_hash;
  end if;
  return null;
exception when others then
  raise warning 'login_attempts clear on password change failed: %', sqlstate;
  return null;
end;
$$;

revoke all on function public.fn_login_attempts_clear_on_password_change() from public, anon, authenticated;

create trigger login_attempts_clear_on_password_change
  after update of encrypted_password on auth.users
  for each row
  when (old.encrypted_password is distinct from new.encrypted_password)
  execute function public.fn_login_attempts_clear_on_password_change();

revoke all on function public.fn_login_lock_begin(bytea, bytea) from public, anon, authenticated;
grant execute on function public.fn_login_lock_begin(bytea, bytea) to service_role;
revoke all on function public.fn_login_lock_end(bytea, bytea, text, smallint, smallint) from public, anon, authenticated;
grant execute on function public.fn_login_lock_end(bytea, bytea, text, smallint, smallint) to service_role;
