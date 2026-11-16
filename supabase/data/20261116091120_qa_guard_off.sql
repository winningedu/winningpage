-- 목적: QA 계정 차단 스위치를 다시 끈다(QA 계정을 연다).
--   app_settings.qa_account_guard_enabled 를 false 로 둔다. qa_accounts 목록은 그대로 둔다(스위치가 꺼져 있으면 쓰이지 않는다).
--   서버 쪽 스위치(Vercel 환경 변수 QA_ACCOUNT_GUARD_ENABLED)도 같은 날 false 로 바꾸고 다시 배포한다.
--
-- 근거: 2026-11-16 위닝 요청 "QA 계정 두 서비스 다 열어 달라"(사용자 전달).
--
-- 대상 DB: Schoolmentor prod (aalujumpwlnwlemnqrus), Winning prod (ykrpjcsubmbenfcnwlzd).
-- dev(gjowqdiopinhixfivnkx)에는 실행하지 않는다.
--
-- 멱등: 이미 false 이거나 행이 없으면 바뀌는 행이 없다. 삭제 없음.

update public.app_settings
   set value = 'false'::jsonb
 where key = 'qa_account_guard_enabled'
   and value is distinct from 'false'::jsonb;

-- 실행 기록
-- 2026-11-16 Schoolmentor prod aalujumpwlnwlemnqrus: 실행 전 true, 실행 후 false, 재실행 변경 없음. qa_accounts 15행 그대로
-- 2026-11-16 Winning prod ykrpjcsubmbenfcnwlzd: 실행 전 true, 실행 후 false, 재실행 변경 없음. qa_accounts 5행 그대로
-- 2026-11-16 Vercel schoolmentor, winningpage 프로젝트: QA_ACCOUNT_GUARD_ENABLED 를 true 에서 false 로 바꾸고(Production, Preview) 운영을 다시 배포함
-- 배경: QA 본사 관리자 계정의 본사 대행 시작(쓰기)이 차단되어 위닝이 학습관리자 화면에 들어가지 못했다
-- dev: 실행하지 않음
