-- 스쿨멘토 정식 오픈 1: QA 계정 차단 스위치를 켠다.
--   app_settings.qa_account_guard_enabled 를 true 로 둔다(fn_is_qa_account 가 읽는다).
--   서버 쪽 스위치(Vercel 환경 변수 QA_ACCOUNT_GUARD_ENABLED)도 같은 날 true 로 바꾸고 다시 배포한다.
-- 대상 DB: Schoolmentor prod aalujumpwlnwlemnqrus 전용.
--          dev 와 Winning prod 에는 실행하지 않는다(Winning prod 는 qa_accounts 가 비어 있다).
-- 멱등: 행이 없으면 넣고, 있으면 true 로 맞춘다. 이미 true 이면 바뀌는 행이 없다.

insert into public.app_settings (key, value)
values ('qa_account_guard_enabled', 'true'::jsonb)
on conflict (key) do update set value = excluded.value
  where public.app_settings.value is distinct from excluded.value;

-- 실행 기록
-- 2026-11-16 Schoolmentor prod aalujumpwlnwlemnqrus: 실행 전 0행(스위치 꺼짐), 실행 후 1행(true), 재실행 변경 없음
-- 2026-11-16 Vercel schoolmentor 프로젝트: QA_ACCOUNT_GUARD_ENABLED 를 false 에서 true 로 바꾸고(Production, Preview) 운영을 다시 배포함
-- dev, Winning prod: 실행하지 않음
