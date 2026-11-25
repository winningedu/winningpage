import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/routeMiddleware", () => ({ requireAdminMiddleware: vi.fn() }));
vi.mock("@/components/routeGuards/RouteGuardUi", () => ({
  AdminAccessBoundary: () => null,
}));

import { ADMIN_ENGINE_SECTION_KEYS } from "@/pages/admin/adminSectionKeys";
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
    "growthReports",
    "inquirySessions",
    "selfevalSessions",
    "serviceCreditAdjust",
    "mentorApplications",
    "premiumBookPages",
  ])("%s 는 하위 주소를 받는 splat 경로 하나로 등록된다", (key) => {
    expect(paths).toContain(`${key}/*`);
    expect(paths).not.toContain(key);
  });

  test("나머지 섹션은 리터럴 경로 그대로다", () => {
    expect(paths).toContain("revenue");
    expect(paths.filter((path) => path?.endsWith("/*")).sort()).toEqual([
      "adminMembers/*",
      "adminRoles/*",
      "coupons/*",
      "growthReports/*",
      "inquirySessions/*",
      "memberPurge/*",
      "members/*",
      "mentorApplications/*",
      "premiumBookPages/*",
      "selfevalSessions/*",
      "serviceCreditAdjust/*",
      "tenants/*",
    ]);
  });
});

describe("adminRoutes 엔진 섹션 하위 주소", () => {
  test.each([...ADMIN_ENGINE_SECTION_KEYS])(
    "%s 는 목록, new, :id 경로를 각각 가진다",
    (key) => {
      expect(paths).toContain(key);
      expect(paths).toContain(`${key}/new`);
      expect(paths).toContain(`${key}/:id`);
    },
  );

  test("하위 주소는 엔진 섹션에만 생기고 goalStudents/:id 는 그대로다", () => {
    const sub = paths.filter(
      (path) => path?.includes("/") && !path.endsWith("/*"),
    );
    const expected = [
      "goalStudents/:id",
      ...ADMIN_ENGINE_SECTION_KEYS.flatMap((key) => [
        `${key}/new`,
        `${key}/:id`,
      ]),
    ].sort();
    expect(sub.sort()).toEqual(expected);
  });

  test("모르는 경로는 기본 섹션(popups)으로 되돌린다", () => {
    const star = children.find((route) => route.path === "*");
    if (!star?.Component) throw new Error("* 라우트가 없다");
    const element = (
      star.Component as unknown as () => {
        props: { to: string; replace: boolean };
      }
    )();
    expect(element.props.to).toBe("/admin/popups");
    expect(element.props.replace).toBe(true);
  });
});
