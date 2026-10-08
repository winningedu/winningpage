-- AI 호출 계기판 호출 키 컬럼.
--
-- 이유: 성장설계 리포트는 한 단계 안에서 묶음과 섹션 호출을 동시에 부른다. 같은 trace 와 step
--   안에서 어느 호출의 행인지 구분해야 검증 결과와 잘림을 호출별로 볼 수 있다.
-- 기존 행은 null 로 둔다. 병렬 호출이 없는 서비스도 null 이다.

alter table public.ai_model_calls add column call_key text;

comment on column public.ai_model_calls.call_key is
  '한 단계 안 병렬 호출을 구분하는 키. 예 batch:0, section:2-1, match, planDraft, step';
