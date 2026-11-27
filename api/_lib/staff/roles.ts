// 권한 묶음(admin_roles) 라우트가 같이 쓰는 칼럼.

// 응답에 싣는 칼럼. 쓰기는 name, description 두 칸뿐이다.
export const ROLE_COLUMNS =
  "id, name, description, is_super, is_system, created_at, updated_at";
