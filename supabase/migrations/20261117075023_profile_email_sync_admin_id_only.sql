-- profiles.email 은 auth.users.email 의 복사본이다. 지금까지는 브라우저(ChangeEmailModal)가 직접 고쳐 왔다.
-- 1) auth.users.email 이 바뀌면 트리거가 profiles.email 을 소문자로 맞춘다.
--    선생님(member_type = 'teacher')과 합성 주소(@teacher.schoolmentor.kr)는 건드리지 않는다(선생님 profiles.email 은 NULL 이 정상).
--    이 트리거가 실패하면 auth 이메일 변경 자체가 막히므로 절대 예외를 던지지 않는다.
--    다른 행과 겹치면(profiles_email_unique_idx) 이 행의 복사본만 NULL 로 비우고 warning 을 남긴다.
create or replace function public.fn_auth_users_sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(coalesce(new.email, '')));
begin
  if v_email = '' or v_email like '%@teacher.schoolmentor.kr' then
    return new;
  end if;

  begin
    update public.profiles p
       set email = v_email
     where p.id = new.id
       and p.member_type is distinct from 'teacher'
       and p.email is distinct from v_email;
  exception when unique_violation then
    update public.profiles p
       set email = null
     where p.id = new.id;
    raise warning 'profiles.email sync conflict, copy cleared for user %', new.id;
  end;

  return new;
exception when others then
  raise warning 'profiles.email sync failed for user %: %', new.id, sqlerrm;
  return new;
end $$;

comment on function public.fn_auth_users_sync_profile_email() is
  'auth.users.email 변경을 profiles.email 에 소문자로 복사한다. 선생님과 합성 주소는 건너뛴다. 중복이면 그 행만 NULL 로 비우고 warning. 예외를 던지지 않는다.';

revoke execute on function public.fn_auth_users_sync_profile_email() from public, anon, authenticated;

drop trigger if exists trg_auth_users_sync_profile_email on auth.users;
create trigger trg_auth_users_sync_profile_email
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.fn_auth_users_sync_profile_email();

-- 2) is_winning_admin: 어드민은 profiles.id = auth.uid() 로만 판정한다.
--    예전에는 JWT 이메일이 어드민 profiles.email 과 같아도 통과했다. profiles.email 은 회원이 고칠 수 있던 복사본이라 권한 근거가 될 수 없다.
create or replace function public.is_winning_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'admin_basic', 'admin_manager', 'admin_master')
  );
$$;

-- 3) profiles.email 잠금. profiles_update_own, profiles_insert_own 때문에 로그인 회원이 본인 email 을 아무 값으로나 쓸 수 있었다.
--    fn_profiles_lock_member_type 과 같은 예외 원칙: authenticated 이면서 is_admin() 이 아닌 세션만 게이트를 탄다.
--    그 세션은 NULL 이거나 그 행 계정의 auth.users.email 과 같은 값만 쓸 수 있다.
--    GoTrue(JWT 없음), service_role, postgres, 위 동기화 트리거는 이 게이트를 안 탄다.
--    complete_signup_profile 은 security definer 라도 auth.role() 이 호출자 JWT 라 게이트를 탄다. 가입 화면은 auth 이메일만 보낸다.
create or replace function public.fn_profiles_lock_email()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.role() = 'authenticated' and not public.is_admin() and new.email is not null then
    if lower(btrim(new.email)) is distinct from (
      select lower(btrim(u.email)) from auth.users u where u.id = new.id
    ) then
      raise exception using errcode = 'WC106',
        message = '이메일은 이메일 변경 절차로만 바꿀 수 있습니다.';
    end if;
  end if;

  return new;
end $$;

comment on function public.fn_profiles_lock_email() is
  'profiles.email 잠금 트리거 함수. authenticated 세션(어드민 제외)이 그 행 계정의 auth.users.email 과 다른 값을 쓰면 WC106. NULL 은 통과. service_role, postgres, GoTrue, 어드민은 예외(fn_profiles_lock_member_type 과 동일).';

revoke execute on function public.fn_profiles_lock_email() from public, anon, authenticated;

drop trigger if exists trg_profiles_lock_email on public.profiles;
create trigger trg_profiles_lock_email
  before insert or update of email on public.profiles
  for each row execute function public.fn_profiles_lock_email();
