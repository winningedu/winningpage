-- admin_resources 에 「메인화면 관리 > 푸터관리」 메뉴 행을 넣는다.
-- key 는 ADMIN_SECTION_KEYS(src/pages/admin/adminSectionKeys.ts)의 footerImages 와 같아야 한다.
-- 역할별 접근 권한은 이 파일에 없다. 소유자가 정한 뒤 따로 실행한다.
-- 대상 DB: dev gjowqdiopinhixfivnkx / Winning prod ykrpjcsubmbenfcnwlzd / Schoolmentor prod aalujumpwlnwlemnqrus
-- 멱등: admin_resources_pkey(key) 충돌이면 아무것도 바꾸지 않는다.

insert into public.admin_resources (key, group_title, label, sort_order, is_active)
values ('footerImages', '메인화면 관리', '푸터관리', 170, true)
on conflict (key) do nothing;

-- 실행 기록
-- 2026-11-14 dev(gjowqdiopinhixfivnkx), Winning prod(ykrpjcsubmbenfcnwlzd), Schoolmentor prod(aalujumpwlnwlemnqrus) 실행.
--   세 DB 모두 실행 전 admin_resources 56행(footerImages 0), 실행 후 57행(footerImages 1).
--   재실행: 세 DB 모두 57행 그대로.
--   역할별 권한은 넣지 않았다. 최고 관리자만 메뉴가 보인다.
