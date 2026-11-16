-- 스쿨멘토 정식 오픈 2: 가입을 연다.
--   app_settings.signup_enabled 를 true 로 바꾼다. QA 계정 차단을 켠 뒤에 실행한다.
-- 대상 DB: Schoolmentor prod aalujumpwlnwlemnqrus 전용.
--          dev 와 Winning prod 에는 실행하지 않는다.
-- 멱등: 이미 true 이면 바뀌는 행이 없다.

update public.app_settings
   set value = 'true'::jsonb
 where key = 'signup_enabled'
   and value is distinct from 'true'::jsonb;

-- 실행 기록
-- 2026-11-16 Schoolmentor prod aalujumpwlnwlemnqrus: 실행 전 false, 실행 후 true, 재실행 변경 없음
-- dev, Winning prod: 실행하지 않음
