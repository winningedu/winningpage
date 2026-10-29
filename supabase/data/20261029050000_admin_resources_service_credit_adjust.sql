-- admin_resources 에 「서비스 관리 > 서비스이용횟수조정」 메뉴 행을 넣는다.
-- key 는 ADMIN_SECTION_KEYS(src/pages/admin/adminSectionKeys.ts)의 serviceCreditAdjust 와 같아야 한다.
-- 대상 DB: dev gjowqdiopinhixfivnkx / Winning prod ykrpjcsubmbenfcnwlzd / Schoolmentor prod aalujumpwlnwlemnqrus
-- 멱등: admin_resources_pkey(key) 충돌이면 아무것도 바꾸지 않는다.

insert into public.admin_resources (key, group_title, label, sort_order, is_active)
values ('serviceCreditAdjust', '서비스 관리', '서비스이용횟수조정', 602, true)
on conflict (key) do nothing;

-- 실행 기록
-- 2026-10-29 dev gjowqdiopinhixfivnkx: key serviceCreditAdjust 실행 전 0행, 실행 후 1행. 재실행 변경 없음.
-- 2026-10-29 Winning prod ykrpjcsubmbenfcnwlzd: 실행 전 0행, 실행 후 1행. 재실행 변경 없음.
-- 2026-10-29 Schoolmentor prod aalujumpwlnwlemnqrus: 실행 전 0행, 실행 후 1행. 재실행 변경 없음.
