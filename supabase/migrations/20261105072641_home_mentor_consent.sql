-- 홈 선배 카드(M10, 사 #155)의 동의 확인 칸. 스쿨멘토 홈은 이 값이 true인 카드만 보인다(결정 25).
-- 개인정보 노출이라 기본값은 false(미확인)이다. 기존 행도 false가 되어 관리자가 동의를 확인하기 전까지 스쿨멘토 홈에 안 보인다.
-- 위닝 홈은 이 칸을 읽지 않아 그대로 노출된다. 스키마만 바꾼다. RLS와 권한은 기존 정책을 그대로 따른다.
alter table public.home_mentor_strategies
  add column consent_confirmed boolean not null default false;

comment on column public.home_mentor_strategies.consent_confirmed is
  '선배 카드 노출 동의 확인 여부. 스쿨멘토 홈은 true인 카드만 보인다.';
