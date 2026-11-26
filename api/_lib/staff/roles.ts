// 권한 묶음(admin_roles) 라우트가 같이 쓰는 본문 규칙과 칼럼.

// 응답에 싣는 칼럼. 쓰기는 name, description 두 칸뿐이다.
export const ROLE_COLUMNS =
  "id, name, description, is_super, is_system, created_at, updated_at";

// 본문 규칙은 브라우저와 나누는 계약(shared/roles/contract.ts)에 있다. roles/[id] 라우트가 계속 이 경로로 가져온다.
export { roleBody } from "../../../shared/roles/contract.js";
