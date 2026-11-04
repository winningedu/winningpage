-- admin_resources 에 「입시정보 관리 > 칼럼 카테고리」 메뉴 행을 넣는다.
-- key 는 ADMIN_SECTION_KEYS(src/pages/admin/adminSectionKeys.ts)의 columnCategories 와 같아야 한다.
-- 대상 DB: dev gjowqdiopinhixfivnkx / Winning prod ykrpjcsubmbenfcnwlzd / Schoolmentor prod aalujumpwlnwlemnqrus
-- 멱등: admin_resources_pkey(key) 충돌이면 아무것도 바꾸지 않는다.

insert into public.admin_resources (key, group_title, label, sort_order, is_active)
values ('columnCategories', '입시정보 관리', '칼럼 카테고리', 275, true)
on conflict (key) do nothing;
