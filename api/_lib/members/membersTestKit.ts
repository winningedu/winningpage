// 회원 라우트 테스트용 시드. 테스트 파일에서만 import 한다.
// 관리자 로그인과 members 권한은 consoleTestKit 가짜가, 회원 테이블은 메모리 DB 가 맡는다.

import {
  createSectionDb,
  type SectionDb,
  seedAdmin,
} from "../admin-sections/sectionTestKit.js";
import type { KitState } from "../console/consoleTestKit.js";

export const ADMIN_ID = "admin-1";
export const MEMBER_ID = "5b1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
export const OTHER_ID = "6c2d3b4c-5e6f-4071-9b8c-0d1e2f3a4b5c";

type Row = Record<string, unknown>;

/** members 권한 등급을 심고, 관리자 본인 프로필(role admin)을 profiles 맨 앞에 둔 메모리 DB 를 만든다. */
export function seedMembersDb(
  state: KitState,
  level: "view" | "edit" | "none",
  tables: Record<string, Row[]> = {},
): SectionDb {
  seedAdmin(state, level, "members");
  return createSectionDb({
    ...tables,
    profiles: [
      { id: ADMIN_ID, role: "admin", created_at: "2026-01-01T00:00:00Z" },
      ...(tables.profiles ?? []),
    ],
  });
}
