// public 함수 EXECUTE 권한 정리 마이그레이션의 최종 권한 상태 검증.
// 마이그레이션 텍스트를 순서대로 적용한 결과만 본다. 실DB 검증은
// scripts/check-function-grants.sql 이 CI 에서 맡는다.
import { describe, expect, test } from "vitest";
import { grantRevokeLines, hasExecute, revokesPublic } from "./migrationGrants";

describe("서버 전용 함수는 service_role 만 실행한다", () => {
  test.each(["fn_delete_account", "fn_finalize_paid_order"])("%s", (fn) => {
    const acl = grantRevokeLines(fn);
    expect(revokesPublic(acl)).toBe(true);
    expect(hasExecute(acl, "anon")).toBe(false);
    expect(hasExecute(acl, "authenticated")).toBe(false);
    expect(hasExecute(acl, "service_role")).toBe(true);
  });
});

describe("로그인한 브라우저가 부르는 함수는 authenticated 를 유지하고 anon 을 막는다", () => {
  test.each([
    "fn_complete_refund",
    "fn_refund_quote",
    "complete_signup_profile",
    "fn_is_linked_pair",
    "performance_owns_session",
  ])("%s", (fn) => {
    const acl = grantRevokeLines(fn);
    expect(revokesPublic(acl)).toBe(true);
    expect(hasExecute(acl, "anon")).toBe(false);
    expect(hasExecute(acl, "authenticated")).toBe(true);
    expect(hasExecute(acl, "service_role")).toBe(true);
  });
});

describe("로그인 전 흐름과 공개 RLS 정책이 쓰는 함수는 anon 을 유지하고 PUBLIC 만 닫는다", () => {
  test.each([
    "is_admin",
    "is_winning_admin",
    "check_email_signup_state",
    "increment_board_view",
  ])("%s", (fn) => {
    const acl = grantRevokeLines(fn);
    expect(revokesPublic(acl)).toBe(true);
    expect(hasExecute(acl, "anon")).toBe(true);
    expect(hasExecute(acl, "authenticated")).toBe(true);
    expect(hasExecute(acl, "service_role")).toBe(true);
  });
});
