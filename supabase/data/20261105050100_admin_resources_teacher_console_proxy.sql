-- admin_resources 에 「교사 콘솔 대리 접속」 권한 행을 넣는다.
-- key 는 api/_lib/console/proxy.ts 의 PROXY_RESOURCE_KEY(teacherConsoleProxy)와 같아야 한다.
-- 이 행은 권한 부여용 리소스다. 전용 관리자 화면은 없어 ADMIN_SECTION_KEYS 에는 넣지 않는다.
-- 어느 HQ 역할에 edit 를 줄지는 소유자가 정한다. 이 파일은 리소스 행만 만들고 역할 권한은 건드리지 않는다.
-- 대상 DB: dev gjowqdiopinhixfivnkx / Winning prod ykrpjcsubmbenfcnwlzd / Schoolmentor prod aalujumpwlnwlemnqrus
-- 멱등: admin_resources_pkey(key) 충돌이면 아무것도 바꾸지 않는다.

insert into public.admin_resources (key, group_title, label, sort_order, is_active)
values ('teacherConsoleProxy', '서비스 관리', '교사 콘솔 대리 접속', 603, true)
on conflict (key) do nothing;

-- 실행 기록
-- (미실행) dev / Winning prod / Schoolmentor prod: 실행 후 이 줄에 날짜, 대상 DB, 전후 행 수를 적는다.
