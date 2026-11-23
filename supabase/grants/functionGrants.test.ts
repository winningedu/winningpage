// public 함수 EXECUTE 권한 정리 마이그레이션의 최종 권한 상태 검증.
// 마이그레이션 텍스트를 순서대로 적용한 결과만 본다. 실DB 검증은
// scripts/check-function-grants.sql 이 CI 에서 맡는다.
import { describe, expect, test } from "vitest";
import {
  grantRevokeLines,
  hasExecute,
  MIGRATIONS_SQL,
  revokesPublic,
} from "./migrationGrants";

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

describe("baseline 재생으로 열린 서버, 로그인 전용 함수에서 anon 을 회수한다", () => {
  test.each([
    "consume_growth_credit",
    "fn_admin_can",
    "fn_growth_claim_step",
    "fn_parent_create_enrollment",
    "fn_respond_enrollment",
  ])("%s", (fn) => {
    const acl = grantRevokeLines(fn);
    expect(revokesPublic(acl)).toBe(true);
    // pg_dump 는 최종 권한만 남기므로 anon 에 대한 GRANT 가 없다는 사실로 확인한다.
    expect(hasExecute(acl, "anon")).toBe(false);
  });
});

describe("앞으로 만드는 함수는 닫힌 채로 시작한다", () => {
  // pg_dump 는 default privileges 를 인용부호 식별자로 한 문장씩 적어 둔다.
  const statements = MIGRATIONS_SQL.replace(/"/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(";")
    .map((statement) => statement.trim());
  const functionDefaults = statements.filter(
    (statement) =>
      statement.startsWith(
        "alter default privileges for role postgres in schema public",
      ) && statement.includes(" on functions "),
  );

  test("public 스키마 함수의 default privileges 에 anon, authenticated 가 없다", () => {
    expect(functionDefaults.length).toBeGreaterThan(0);
    for (const statement of functionDefaults) {
      expect(statement).not.toMatch(/\b(anon|authenticated)\b/);
    }
    expect(functionDefaults).toContain(
      "alter default privileges for role postgres in schema public grant all on functions to service_role",
    );
  });

  test("함수 default privileges 의 PUBLIC EXECUTE 를 회수한다", () => {
    expect(statements).toContain(
      "alter default privileges for role postgres revoke all on functions from public",
    );
  });
});
