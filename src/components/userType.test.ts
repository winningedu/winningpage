import { describe, expect, it } from "vitest";
import { resolveUserType } from "./userType";

describe("resolveUserType", () => {
  it("role이 admin이면 member_type과 상관없이 관리자다", () => {
    expect(resolveUserType({ role: "admin", memberType: "student" })).toBe(
      "admin",
    );
    expect(resolveUserType({ role: " Admin ", memberType: "parent" })).toBe(
      "admin",
    );
  });

  it.each(["parent", "parents", "학부모", "학부모회원"])(
    "member_type %s 는 학부모다",
    (memberType) => {
      expect(resolveUserType({ role: "user", memberType })).toBe("parent");
    },
  );

  it.each(["mentor", "teacher", "멘토", "교사", "멘토회원"])(
    "member_type %s 는 멘토(선생님)다",
    (memberType) => {
      expect(resolveUserType({ role: "user", memberType })).toBe("teacher");
    },
  );

  it.each(["student", "학생회원", null, "알수없음"])(
    "member_type %s 는 학생으로 본다",
    (memberType) => {
      expect(resolveUserType({ role: "user", memberType })).toBe("student");
    },
  );
});
