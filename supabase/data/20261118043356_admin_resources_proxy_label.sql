-- 목적: 권한 메뉴 teacherConsoleProxy 의 이름을 2026-11-17 표준 용어에 맞춘다.
--   "교사 콘솔 대리 접속" 을 "선생님 화면 대행" 으로 바꾼다.
--   표준 용어는 "선생님 화면"(버림: 교사 콘솔, 콘솔)이고, 대행 화면은 이미 "본사 대행", "대행 시작" 을 쓴다.
--   key(teacherConsoleProxy), group_title, sort_order, is_active 는 바꾸지 않는다.
--   api/_lib/console/proxy.ts 의 PROXY_RESOURCE_KEY 는 key 를 보므로 이름을 바꿔도 권한은 그대로다.
--
-- 대상 DB: dev gjowqdiopinhixfivnkx, Winning prod ykrpjcsubmbenfcnwlzd, Schoolmentor prod aalujumpwlnwlemnqrus
--   (20261105050100_admin_resources_teacher_console_proxy.sql 이 세 DB 모두에 이 행을 넣었다.)
--
-- 실행 전 조회:
--   select key, label from public.admin_resources where key = 'teacherConsoleProxy';
--     -- 기대: 1행, label '교사 콘솔 대리 접속'
-- 실행 후 확인: 같은 조회. 기대: 1행, label '선생님 화면 대행'.
--
-- 멱등: 옛 이름일 때만 바꾼다. 다시 실행하면 0행이 바뀐다.
--   관리자가 이미 다른 이름으로 고쳤다면 건드리지 않는다.

update public.admin_resources
   set label = '선생님 화면 대행'
 where key = 'teacherConsoleProxy'
   and label = '교사 콘솔 대리 접속';

-- 실행 기록
-- 2026-11-18 dev gjowqdiopinhixfivnkx: 실행 전 label '교사 콘솔 대리 접속', 실행 후 '선생님 화면 대행', 재실행 대상 0행
-- 2026-11-18 Winning prod ykrpjcsubmbenfcnwlzd: 실행 전 label '교사 콘솔 대리 접속', 실행 후 '선생님 화면 대행', 재실행 대상 0행
-- 2026-11-18 Schoolmentor prod aalujumpwlnwlemnqrus: 실행 전 label '교사 콘솔 대리 접속', 실행 후 '선생님 화면 대행', 재실행 대상 0행
