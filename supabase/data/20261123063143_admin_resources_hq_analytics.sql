-- admin_resources 에 「통계」 그룹 메뉴 행 2개(대시보드, 방문 분석)를 넣는다.
-- key 는 ADMIN_SECTION_KEYS(src/pages/admin/adminSectionKeys.ts)의 hqDashboard, webAnalytics 와 같아야 하고,
-- 서버 권한 판정(api/_lib/hq-dashboard/permission.ts, api/_lib/web-analytics/permission.ts)도 같은 키를 본다.
-- 정렬 값 10, 20 은 메인화면 관리(110부터) 앞이라 권한 화면에서도 사이드바처럼 맨 위에 온다.
-- 어느 HQ 역할에 view 나 edit 를 줄지는 소유자가 정한다. 이 파일은 리소스 행만 만들고 역할 권한은 건드리지 않는다.
-- 대상 DB: dev gjowqdiopinhixfivnkx / Winning prod ykrpjcsubmbenfcnwlzd / Schoolmentor prod aalujumpwlnwlemnqrus
-- 멱등: admin_resources_pkey(key) 충돌이면 아무것도 바꾸지 않는다.

insert into public.admin_resources (key, group_title, label, sort_order, is_active)
values
  ('hqDashboard', '통계', '대시보드', 10, true),
  ('webAnalytics', '통계', '방문 분석', 20, true)
on conflict (key) do nothing;

-- 실행 기록
-- 2026-11-23 dev gjowqdiopinhixfivnkx: 실행 전 0행, 실행 후 2행(hqDashboard, webAnalytics). 재실행 변경 없음.
-- 2026-11-23 Winning prod ykrpjcsubmbenfcnwlzd: 실행 전 0행, 실행 후 2행. 재실행 변경 없음.
-- 2026-11-23 Schoolmentor prod aalujumpwlnwlemnqrus: 실행 전 0행, 실행 후 2행. 재실행 변경 없음.
