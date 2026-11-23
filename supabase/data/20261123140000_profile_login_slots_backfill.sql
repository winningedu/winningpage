-- UTC 이전 D6: profile_login_days 의 옛 로그인 기록을 profile_login_slots(15분 칸)로 옮긴다.
-- 목적: 본사 DAU, MAU 가 보는 사람 시간대로 묶이도록 날짜 기록(KST)을 순간 기록으로 바꾼다.
--       날마다 하나뿐인 first_seen_at 을 15분 칸(date_bin, 기준 2000-01-01 UTC)으로 내려 한 줄씩 넣는다.
-- 실행 순서: 마이그레이션 20261123134344_profile_login_slots.sql 적용 뒤에 실행한다. dev 먼저, 검증 뒤 prod.
-- 대상 DB: dev gjowqdiopinhixfivnkx, Winning prod ykrpjcsubmbenfcnwlzd, Schoolmentor prod aalujumpwlnwlemnqrus
-- 멱등: 기본 키 (profile_id, slot_start) 충돌은 건너뛰므로 다시 실행해도 행이 늘지 않는다.
-- 검증은 scripts/b2b-hq-login-days.spec.sql 이 같은 본문으로 한다(본문을 바꾸면 스펙도 같이 바꾼다).
insert into public.profile_login_slots (profile_id, slot_start)
select d.profile_id, date_bin('15 minutes', d.first_seen_at, timestamptz '2000-01-01 00:00:00+00')
  from public.profile_login_days d
on conflict (profile_id, slot_start) do nothing;
