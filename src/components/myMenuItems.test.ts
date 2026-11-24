import { describe, expect, it } from "vitest";
import { buildMyMenu, toMyMenuRole } from "./myMenuItems";

describe("buildMyMenu admin", () => {
  it("관리자 메뉴에 나의 서비스와 관리자 메뉴가 함께 있다", () => {
    const labels = buildMyMenu("admin").map((i) => i.label);
    expect(labels).toContain("나의 서비스");
    expect(labels).toContain("신청 내역");
    expect(labels).toContain("관리자 메뉴");
  });

  it("관리자 메뉴에 중복 항목이 없다", () => {
    const tos = buildMyMenu("admin").map((i) => i.to);
    expect(new Set(tos).size).toBe(tos.length);
  });
});

describe("buildMyMenu teacher", () => {
  it("선생님은 선생님 화면 하나만 본다", () => {
    expect(buildMyMenu("teacher")).toEqual([
      { label: "선생님 화면", to: "/teacher" },
    ]);
  });
});

describe("toMyMenuRole", () => {
  it.each([
    ["admin", "admin"],
    ["parent", "parent"],
    ["student", "student"],
    ["teacher", "teacher"],
    ["mentor", "student"],
    ["other", "student"],
    ["unset", "student"],
  ])("%s 는 MY 메뉴 역할 %s 다", (kind, expected) => {
    expect(toMyMenuRole(kind)).toBe(expected);
  });
});
