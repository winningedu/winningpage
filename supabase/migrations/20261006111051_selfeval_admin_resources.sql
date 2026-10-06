-- 자기평가서 운영 도구 어드민 메뉴 등록.
--
-- 이유: 자기평가서 세션 조회, 이용권 수동 부여, 실패 세션 복구를 하는 어드민 화면이 생겨
--   권한 화면(AdminRolesAdmin)에 같은 키로 메뉴가 떠야 한다. key 는 코드의 ADMIN_SECTION_KEYS
--   와 같은 문자열이어야 한다(코드가 정본, 이 테이블은 사본).
-- 그룹: 세션과 이용 현황 성격이라 서비스 관리에 둔다. 성장설계 회차(590) 바로 뒤인 600 을 쓴다.
-- 권한: admin_role_permissions 행은 넣지 않는다. 최고 관리자는 판정 함수가 전 메뉴 edit 으로
--   단락하므로 자동 포함이고, 실무 관리자는 접근 불가로 시작한다. 이 화면은 이용권을 무상으로
--   부여하는 기능을 포함해서 필요한 묶음에 권한 화면에서 따로 주는 편이 안전하다.
-- 재실행 안전(on conflict do update).

insert into public.admin_resources (key, group_title, label, sort_order) values
  ('selfevalSessions', '서비스 관리', '자기평가서 세션', 600)
on conflict (key) do update
  set group_title = excluded.group_title,
      label       = excluded.label,
      sort_order  = excluded.sort_order,
      is_active   = true;
