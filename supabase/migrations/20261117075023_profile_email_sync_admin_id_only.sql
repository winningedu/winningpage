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
