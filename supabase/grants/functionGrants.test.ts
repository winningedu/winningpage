// public 함수 EXECUTE 권한 정리 마이그레이션의 최종 권한 상태 검증.
// 마이그레이션 텍스트를 순서대로 적용한 결과만 본다. 실DB 검증은
// scripts/check-function-grants.sql 이 CI 에서 맡는다.
import { describe, expect, test } from "vitest";
import { grantRevokeLines, hasExecute } from "./migrationGrants";

describe("서버 전용 함수는 service_role 만 실행한다", () => {
  test.each(["fn_delete_account", "fn_finalize_paid_order"])("%s", (fn) => {
    const acl = grantRevokeLines(fn);
    expect(hasExecute(acl, "public")).toBe(false);
    expect(hasExecute(acl, "anon")).toBe(false);
    expect(hasExecute(acl, "authenticated")).toBe(false);
    expect(hasExecute(acl, "service_role")).toBe(true);
  });
});
