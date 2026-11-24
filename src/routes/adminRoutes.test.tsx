import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/routeMiddleware", () => ({ requireAdminMiddleware: vi.fn() }));
vi.mock("@/components/routeGuards/RouteGuardUi", () => ({
  AdminAccessBoundary: () => null,
}));

import adminRoutes from "./adminRoutes";

const children = adminRoutes[0]?.children ?? [];
const paths = children.map((route) => route.path);

describe("adminRoutes 하위 주소가 있는 섹션", () => {
  test.each([
    "tenants",
    "memberPurge",
    "coupons",
    "members",
    "adminMembers",
    "adminRoles",
  ])("%s 는 하위 주소를 받는 splat 경로 하나로 등록된다", (key) => {
    expect(paths).toContain(`${key}/*`);
    expect(paths).not.toContain(key);
  });

  test("나머지 섹션은 리터럴 경로 그대로다", () => {
    expect(paths).toContain("serviceCreditAdjust");
    expect(paths).toContain("revenue");
    expect(paths.filter((path) => path?.endsWith("/*"))).toEqual([
      "tenants/*",
      "members/*",
      "memberPurge/*",
      "coupons/*",
      "adminMembers/*",
      "adminRoles/*",
    ]);
  });
});
