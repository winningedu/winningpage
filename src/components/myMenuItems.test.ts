import { describe, expect, it } from "vitest";
import { buildMyMenu } from "./myMenuItems";

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
