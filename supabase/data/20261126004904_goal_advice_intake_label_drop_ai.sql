-- 목표관리 대시보드 입시조언 캐시의 첫 섹션 라벨에서 AI 문구를 뺀다.
--
-- 목적: 고객사 요청으로 코드 라벨이 "[AI 입시조언]"에서 "[입시조언]"으로 바뀌었다
-- (api/_lib/goal/advice.ts SECTION_LABELS.intake.today). 이미 저장된 캐시 행
-- goal_advice_cache.payload.sections[0].label 은 옛 라벨을 그대로 들고 있어 화면에 남는다.
-- source = 'intake' 이고 첫 섹션 라벨이 정확히 '[AI 입시조언]'인 행만 고친다.
-- 다시 실행하면 대상 행이 0건이라 아무것도 바뀌지 않는다(멱등).
--
-- 대상 DB: dev(gjowqdiopinhixfivnkx) 먼저, 다음 Winning prod(ykrpjcsubmbenfcnwlzd),
-- Schoolmentor prod(aalujumpwlnwlemnqrus). 실행 전 prod Winning 기준 대상 5건으로 파악됨.
--
-- 실행 전과 후 확인 쿼리(실행 후에는 old_label 0건, new_label 이 그만큼 늘어야 한다):
--   select
--     count(*) filter (where payload->'sections'->0->>'label' = '[AI 입시조언]') as old_label,
--     count(*) filter (where payload->'sections'->0->>'label' = '[입시조언]') as new_label
--   from public.goal_advice_cache
--   where source = 'intake';

update public.goal_advice_cache
set payload = jsonb_set(payload, '{sections,0,label}', to_jsonb('[입시조언]'::text))
where source = 'intake'
  and payload->'sections'->0->>'label' = '[AI 입시조언]';
