-- 목적: profiles.last_seen_at 처음 한 번 채우기 (계획 7a, 결정 105 1번)
--   기존 사용자가 "기록 없음"으로 시작하지 않게 Auth 마지막 로그인 시각으로 채운다.
--   값이 이미 있으면 건드리지 않아 다시 돌려도 바뀌지 않는다.
--
-- 대상 DB: dev (gjowqdiopinhixfivnkx), Winning prod (ykrpjcsubmbenfcnwlzd),
--   Schoolmentor prod (aalujumpwlnwlemnqrus). 소유자가 수동으로 실행한다.
-- 전제: 20261109061211_profiles_last_seen_at.sql 마이그레이션이 먼저 적용되어 있어야 한다.
update public.profiles p
set last_seen_at = u.last_sign_in_at
from auth.users u
where u.id = p.id
  and p.last_seen_at is null
  and u.last_sign_in_at is not null;

-- 실행 기록 (행 수: last_seen_at 비어 있음 / 채워짐 / 채울 수 있음)
-- 2026-11-09 dev (gjowqdiopinhixfivnkx)
--   실행 전: 59 / 1 / 49
--   실행 후: 10 / 50 / 0 (남은 10행은 로그인 기록이 없는 계정)
--   재실행: 변경 없음
-- 2026-11-09 Winning prod (ykrpjcsubmbenfcnwlzd)
--   실행 전: 44 / 1 / 44
--   실행 후: 0 / 45 / 0
--   재실행: 변경 없음
-- 2026-11-09 Schoolmentor prod (aalujumpwlnwlemnqrus)
--   실행 전: 12 / 0 / 10
--   실행 후: 2 / 10 / 0 (남은 2행은 로그인 기록이 없는 계정)
--   재실행: 변경 없음
