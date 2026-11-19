-- 프로젝트 사이트 표식: app_settings.site_key 에 이 프로젝트가 위닝에듀인지 스쿨멘토인지 적는다.
--   complete_signup_profile 이 읽는다. "schoolmentor" 이면 위닝식 학생 가입 RPC 를 WC107 로 거절하고,
--   "winning" 일 때만 가입 학생에게 학적을 만든다. 표식이 없으면 소속만 정한다(마이그레이션을 먼저 배포해도 안전하다).
-- 프로젝트마다 값이 다르므로 아래 value 를 대상 DB 에 맞게 한 곳만 바꿔서 실행한다.
--   Winning prod ykrpjcsubmbenfcnwlzd : "winning"
--   dev gjowqdiopinhixfivnkx          : "winning" (dev 는 위닝 데이터다)
--   Schoolmentor prod aalujumpwlnwlemnqrus : "schoolmentor"
-- 멱등: 행이 없으면 넣고, 값이 다르면 맞추고, 같으면 바뀌는 행이 없다.

-- 1) 실행 전 확인 (읽기 전용): 행이 없으면 0행
select key, value, jsonb_typeof(value) as value_type from public.app_settings where key = 'site_key';

-- 2) 반영
insert into public.app_settings (key, value)
values ('site_key', '"winning"'::jsonb) -- 스쿨멘토 프로젝트는 '"schoolmentor"'::jsonb
on conflict (key) do update set value = excluded.value, updated_at = now()
  where public.app_settings.value is distinct from excluded.value;

-- 3) 실행 후 확인 (읽기 전용): 1행이고 value 가 대상 DB 에 맞는 문자열이어야 한다
select key, value, jsonb_typeof(value) as value_type from public.app_settings where key = 'site_key';

-- 실행 기록
-- (아직 어느 DB에도 실행하지 않았다)
