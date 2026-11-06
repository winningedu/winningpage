-- B2B 기본값 app_settings 두 키를 넣는다.
--   b2b_usage_defaults: HQ 이용 설정 화면이 미리 채우는 서비스별 월 한도와 학기 한도(설계 P20).
--     target(목표관리)은 한도 없음이라 넣지 않는다. term_limit 은 계약 기간(term_months) 별 값이다.
--   contract_grace_days: 계약 종료 후 유예 일수(사 결정 r15).
-- b2b_special_defaults(특별 관리 기준)는 해당 화면과 함께 후속 파일로 넣는다.
-- 대상 DB: Schoolmentor prod aalujumpwlnwlemnqrus 전용. dev gjowqdiopinhixfivnkx 는 테스트용으로 실행해도 무해하다.
--          Winning prod ykrpjcsubmbenfcnwlzd 에는 실행하지 않는다.
-- 멱등: app_settings.key 가 이미 있으면 값을 바꾸지 않는다(HQ 가 고친 값을 덮어쓰지 않는다).

insert into public.app_settings (key, value)
values (
  'b2b_usage_defaults',
  '{
    "diagnose": {"monthly_limit": 1},
    "growth":   {"monthly_limit": 1},
    "selfeval": {"monthly_limit": 2},
    "suhaeng":  {"monthly_limit": 10, "term_limit_by_term_months": {"6": 24, "3": 12}},
    "inquiry":  {"monthly_limit": 10, "term_limit_by_term_months": {"6": 24, "3": 12}}
  }'::jsonb
)
on conflict (key) do nothing;

insert into public.app_settings (key, value)
values ('contract_grace_days', '30'::jsonb)
on conflict (key) do nothing;

-- 실행 기록
-- 2026-11-06 dev gjowqdiopinhixfivnkx: 실행 전 두 키 2행(이미 있음), 실행 후 2행, 재실행 변경 없음
-- 2026-11-06 Schoolmentor prod aalujumpwlnwlemnqrus: 실행 전 0행, 실행 후 2행, 재실행 변경 없음
-- Winning prod: 실행하지 않음
