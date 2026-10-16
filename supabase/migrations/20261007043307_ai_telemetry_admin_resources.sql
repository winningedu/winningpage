-- AI 호출 계기판 어드민 메뉴 등록.
--
-- 이유: AI 호출 계기판 관리자 화면이 생겨 권한 화면(AdminRolesAdmin)에 같은 키로 메뉴가 떠야 한다.
--   key 는 코드의 ADMIN_SECTION_KEYS 와 같은 문자열이어야 한다(코드가 정본, 이 테이블은 사본).
-- 그룹: 서비스 관리 그룹의 마지막이 600 이라 그 뒤인 610 을 쓴다.
-- 권한: admin_role_permissions 행은 넣지 않는다. 최고 관리자는 판정 함수가 전 메뉴 edit 으로
--   단락하므로 자동 포함이고, 실무 관리자는 접근 불가로 시작해 필요한 묶음에 권한 화면에서 준다.
-- 재실행 안전(on conflict do update).

insert into public.admin_resources (key, group_title, label, sort_order) values
  ('aiTelemetry', '서비스 관리', 'AI 호출 계기판', 610)
on conflict (key) do update
  set group_title = excluded.group_title,
      label       = excluded.label,
      sort_order  = excluded.sort_order,
      is_active   = true;
