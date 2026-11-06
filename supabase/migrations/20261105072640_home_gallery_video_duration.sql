-- 홈 칼럼 박스(W1)의 영상 재생 시간. 관리자가 직접 넣는 선택 칸이고(결정 24, 유튜브 자동 채우기 없음)
-- 값이 있을 때만 홈 박스에 시간 칩이 보인다. 스키마만 바꾼다. 기존 행은 null로 남아 시간 칩이 없다.
-- 0 이하나 하루(86400초) 이상은 입력 실수라 CHECK로 막는다. RLS와 권한은 galleries 기존 정책을 그대로 따른다.
alter table public.galleries
  add column video_duration_seconds integer
  constraint galleries_video_duration_seconds_check
    check (video_duration_seconds is null or (video_duration_seconds > 0 and video_duration_seconds < 86400));

comment on column public.galleries.video_duration_seconds is
  '영상 재생 시간(초). 관리자 입력 선택 값, 비어 있으면 홈 박스에 시간을 보이지 않는다.';
