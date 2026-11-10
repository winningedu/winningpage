import { describe, expect, it } from "vitest";
import {
  classifyMember,
  getMemberLabel,
  resolvePublicMemberType,
} from "./memberAccess";

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

describe("classifyMember", () => {
  it("role이 admin이면 member_type과 상관없이 관리자다", () => {
    expect(classifyMember({ memberType: "student", role: "admin" })).toBe(
      "admin",
    );
    expect(classifyMember({ memberType: "parent", role: " Admin " })).toBe(
      "admin",
    );
  });

  it.each([
    ["parent", "parent"],
    ["parents", "parent"],
    [" 학부모 ", "parent"],
    ["학부모회원", "parent"],
    ["teacher", "teacher"],
    ["교사", "teacher"],
    ["mentor", "mentor"],
    ["멘토", "mentor"],
    ["멘토회원", "mentor"],
    ["student", "student"],
    ["학생", "student"],
    ["학생회원", "student"],
    ["", "unset"],
    [null, "unset"],
    ["   ", "unset"],
    ["알수없음", "unknown"],
  ])("member_type %j 는 %s 다", (memberType, expected) => {
    expect(classifyMember({ memberType, role: "user" })).toBe(expected);
  });

  it("role이 없어도 member_type으로 판정한다", () => {
    expect(classifyMember({ memberType: "parent" })).toBe("parent");
  });
});

describe("getMemberLabel", () => {
  it.each([
    [{ memberType: "student", role: "admin" }, "관리자"],
    [{ memberType: "학생", role: "user" }, "학생회원"],
    [{ memberType: "parents", role: "user" }, "학부모회원"],
    [{ memberType: "교사", role: "user" }, "선생님"],
    [{ memberType: "멘토", role: "user" }, "멘토회원"],
    [{ memberType: "", role: "user" }, ""],
    [{ memberType: " Alumni ", role: "user" }, "alumni회원"],
    [{ memberType: "졸업생회원", role: "user" }, "졸업생회원"],
  ])("%j 의 라벨은 %s 다", (input, expected) => {
    expect(getMemberLabel(input)).toBe(expected);
  });
});
