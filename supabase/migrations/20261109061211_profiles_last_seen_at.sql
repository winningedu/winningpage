-- 최근 접속일 (계획 7a, 결정 105 1번).
-- /api/session-check 가 앱을 열거나 창으로 돌아올 때 30분에 한 번 적는다.
-- 서비스 롤만 쓴다. 클라이언트는 이 열을 직접 고치지 않는다.
alter table public.profiles
  add column if not exists last_seen_at timestamptz;

comment on column public.profiles.last_seen_at is
  '최근 접속 시각. /api/session-check 가 30분에 한 번 적는다. 기록이 없으면 null(미접속 판정 규칙을 건너뜀)';

-- 처음 한 번: 기존 사용자가 "기록 없음"으로 시작하지 않게 Auth 마지막 로그인 시각으로 채운다.
-- 값이 이미 있으면 건드리지 않아 다시 돌려도 바뀌지 않는다.
update public.profiles p
set last_seen_at = u.last_sign_in_at
from auth.users u
where u.id = p.id
  and p.last_seen_at is null
  and u.last_sign_in_at is not null;
