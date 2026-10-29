import { describe, expect, it } from "vitest";
import { resolvePublicMemberType } from "./memberAccess";

describe("resolvePublicMemberType", () => {
  it("관리자는 member_type 과 상관없이 학생 경로로 통과한다", () => {
    expect(resolvePublicMemberType({ memberType: "", role: "admin" })).toBe(
      "student",
    );
    expect(
      resolvePublicMemberType({ memberType: "mentor", role: " Admin " }),
    ).toBe("student");
  });

  it("일반 회원은 member_type 그대로 판정한다", () => {
    expect(
      resolvePublicMemberType({ memberType: "parent", role: "user" }),
    ).toBe("parent");
    expect(resolvePublicMemberType({ memberType: "", role: null })).toBe("");
  });

  it("미로그인(memberType null)은 null 로 남아 통과하지 못한다", () => {
    expect(
      resolvePublicMemberType({ memberType: null, role: null }),
    ).toBeNull();
  });
});
