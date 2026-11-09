-- 최근 접속일 (계획 7a, 결정 105 1번).
-- /api/session-check 가 앱을 열거나 창으로 돌아올 때 30분에 한 번 적는다.
-- 서비스 롤만 쓴다. 클라이언트는 이 열을 직접 고치지 않는다.
alter table public.profiles
  add column if not exists last_seen_at timestamptz;

comment on column public.profiles.last_seen_at is
  '최근 접속 시각. /api/session-check 가 30분에 한 번 적는다. 기록이 없으면 null(미접속 판정 규칙을 건너뜀)';

-- profiles_update_own 정책과 테이블 권한 때문에 클라이언트가 이 열을 직접 고칠 수 있다.
-- authenticated 세션의 UPDATE 는 이 열을 옛 값으로 되돌린다. service_role 은 그대로 적는다.
create or replace function public.fn_profiles_lock_last_seen_at()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.role() = 'authenticated' then
    new.last_seen_at := old.last_seen_at;
  end if;
  return new;
end $$;

comment on function public.fn_profiles_lock_last_seen_at() is
  'profiles.last_seen_at 잠금 트리거 함수. authenticated 세션의 UPDATE 는 이 열을 바꾸지 못하고 옛 값이 유지된다. service_role 은 예외.';

create or replace trigger trg_profiles_lock_last_seen_at
  before update on public.profiles
  for each row execute function public.fn_profiles_lock_last_seen_at();
