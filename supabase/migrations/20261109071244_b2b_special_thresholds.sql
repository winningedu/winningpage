-- B2B 특이학생 감지 기준 열(사 #147, 결정 106 6번). 새 열은 비어 있고 위닝 사이트 DB 동작은 바뀌지 않는다.
-- special_inactive_days 는 "마지막 접속이 이 일수 이상 지나면 특이학생", special_feedback_wait_days 는
-- "수행평가 제출이 평가 리포트를 이 일수 이상 기다리면 특이학생" 기준이다.
-- null 이면 코드의 기본값(미접속 7일, 피드백 대기 14일)을 쓴다. special_exec_rate_pct(기본 40%)와 같은 방식이다.

alter table public.tenants
  add column special_inactive_days smallint check (special_inactive_days between 1 and 365),
  add column special_feedback_wait_days smallint check (special_feedback_wait_days between 1 and 365);

comment on column public.tenants.special_inactive_days is '마지막 접속이 이 일수 이상 지나면 특이학생 사유가 된다. null 이면 기본값 7일을 쓴다.';
comment on column public.tenants.special_feedback_wait_days is '수행평가 제출이 평가 리포트를 이 일수 이상 기다리면 특이학생 사유가 된다. null 이면 기본값 14일을 쓴다.';
