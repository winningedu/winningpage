-- 옛 메뉴 「일일 입장」(dailyEntries)과 「이용 현황」(usageStatus)의 권한 행을 끈다(분석 grill Q13).
-- 화면은 코드에서 지웠다. 행이 켜져 있으면 관리자 권한 관리 화면에 화면 없는 항목이 뜬다.
-- 행은 지우지 않는다. admin_role_permissions 등이 key 를 참조할 수 있고, 테이블 daily_entries, usage_status 도 남긴다.
-- 대상 DB: dev gjowqdiopinhixfivnkx / Winning prod ykrpjcsubmbenfcnwlzd / Schoolmentor prod aalujumpwlnwlemnqrus
-- 멱등: 이미 꺼진 행은 건드리지 않는다.

update public.admin_resources
set is_active = false
where key in ('dailyEntries', 'usageStatus')
  and is_active is distinct from false;
