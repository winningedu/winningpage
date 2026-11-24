import { describe, expect, test } from "vitest";
import adminRoutes from "./adminRoutes";

const sectionPaths = () =>
  (adminRoutes[0]?.children ?? []).map((route) => route.path);

describe("adminRoutes", () => {
  test("회원 섹션은 하위 주소까지 받는 members/* 경로다", () => {
    expect(sectionPaths()).toContain("members/*");
    expect(sectionPaths()).not.toContain("members");
  });

  test("하위 주소가 없는 섹션은 키 그대로 둔다", () => {
    expect(sectionPaths()).toContain("coupons");
  });
});
