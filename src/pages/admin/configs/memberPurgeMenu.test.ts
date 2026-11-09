// 계약 종료 회원 삭제 메뉴 두 개의 등록(결정 102.8). 라우트 키, 설정, 사이트별 노출은 canAccessSection 별칭이 맡는다.

import { describe, expect, test } from "vitest";
import { ADMIN_SECTION_KEYS } from "@/pages/admin/adminSectionKeys";
import { memberConfigs } from "./member";

describe("계약 종료 회원 삭제 메뉴 등록", () => {
  test.each([
    ["memberPurge", "계약 종료 회원 삭제"],
    ["memberPurgeLogs", "삭제 로그"],
  ])("%s 는 라우트 키와 읽기 전용 custom 설정이 있다", (key, title) => {
    expect(ADMIN_SECTION_KEYS).toContain(key);
    expect(memberConfigs[key]).toMatchObject({
      title,
      readOnly: true,
      custom: true,
      customComponentKey: key,
    });
  });
});
