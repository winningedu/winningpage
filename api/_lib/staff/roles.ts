// 권한 묶음(admin_roles) 라우트가 같이 쓰는 본문 규칙과 칼럼.

import { z } from "zod";

// 응답에 싣는 칼럼. 쓰기는 name, description 두 칸뿐이다.
export const ROLE_COLUMNS =
  "id, name, description, is_super, is_system, created_at, updated_at";

const NAME_MESSAGE = "권한 묶음 이름을 입력해 주세요.";

// is_super, is_system 은 본문으로 받지 않는다(strict 라 400). 서비스 롤은 RLS 를 건너뛰므로 서버가 막는다.
export const roleBody = z.strictObject({
  name: z.string({ error: NAME_MESSAGE }).trim().min(1, NAME_MESSAGE),
  description: z
    .string()
    .trim()
    .nullable()
    .transform((value) => value || null),
});
