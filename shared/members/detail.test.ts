// 회원 상세 계약: 서버가 검증하는 요청 스키마.

import { describe, expect, test } from "vitest";
import { memberIdParams, memberPatchBody, memberTenantBody } from "./detail.js";

const ID = "5b1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

describe("memberIdParams", () => {
  test("uuid 만 받는다", () => {
    expect(memberIdParams.safeParse({ id: ID }).success).toBe(true);
    expect(memberIdParams.safeParse({ id: "x,a.eq.1" }).success).toBe(false);
  });
});

describe("memberPatchBody", () => {
  test("두 열 중 하나만 있어도 받는다", () => {
    expect(memberPatchBody.safeParse({ guardian_phone: null }).success).toBe(
      true,
    );
    expect(memberPatchBody.safeParse({ member_category: "VIP" }).success).toBe(
      true,
    );
  });

  test.each([
    ["빈 본문", {}],
    ["다른 열", { role: "admin" }],
    ["문자열이 아닌 값", { member_category: 3 }],
  ])("%s 은 거부한다", (_label, body) => {
    expect(memberPatchBody.safeParse(body).success).toBe(false);
  });
});

describe("memberTenantBody", () => {
  test("uuid 나 null 만 받고 모르는 키는 거부한다", () => {
    expect(memberTenantBody.safeParse({ tenantId: ID }).success).toBe(true);
    expect(memberTenantBody.safeParse({ tenantId: null }).success).toBe(true);
    expect(memberTenantBody.safeParse({}).success).toBe(false);
    expect(
      memberTenantBody.safeParse({ tenantId: ID, role: "a" }).success,
    ).toBe(false);
  });
});
