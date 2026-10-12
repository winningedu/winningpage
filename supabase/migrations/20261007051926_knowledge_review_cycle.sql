-- 수행평가 지식 DB 자료 관리 주기.
--
-- 이유: 관리자가 카드 내용을 마지막으로 확인한 시점을 남겨, 오래 확인하지 않은 카드를
--   목록에서 골라 볼 수 있게 한다. 기존 행은 검토 기록이 없으므로 기본값과 백필을 두지
--   않는다. 쓰기는 기존 is_admin 정책(winning_assessment_knowledge_admin_all)이 허용한다.
alter table public.winning_assessment_knowledge_items
  add column if not exists last_reviewed_at timestamptz;

comment on column public.winning_assessment_knowledge_items.last_reviewed_at is
  '관리자가 이 카드를 마지막으로 검토 완료로 표시한 시각. 검토 기록이 없으면 null.';
