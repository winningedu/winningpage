-- 자기평가서 v4.2 리뷰 보완(스키마만).
-- 리포트 선점 시각. 만드는 중인 요청이 하나만 되도록 claimed_at 이 비었거나 단계 예산보다 오래됐을 때만 선점한다.
alter table public.selfeval_report_views
  add column if not exists claimed_at timestamptz null;

comment on column public.selfeval_report_views.claimed_at is '리포트 만들기 선점 시각. 끝내면 null. 신선한 값이 있으면 다른 요청은 선점하지 못하고, 단계 예산(50초)보다 오래되면 다시 선점할 수 있다.';
