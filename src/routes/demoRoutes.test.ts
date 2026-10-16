import { describe, expect, test } from "vitest";
import { requireAdminMiddleware } from "@/lib/routeMiddleware";
import demoRoutes from "./demoRoutes";

describe("demoRoutes", () => {
  test("경로는 /demo 와 /demo/:demoKey 두 개뿐이고 /services/growth 는 없다", () => {
    expect(demoRoutes.map((r) => r.path)).toEqual(["/demo", "/demo/:demoKey"]);
  });

  test.each(["/demo", "/demo/:demoKey"])(
    "%s 는 어드민 미들웨어로 보호된다",
    (path) => {
      const route = demoRoutes.find((r) => r.path === path);
      expect(route?.middleware).toContain(requireAdminMiddleware);
    },
  );

  test.each(["/demo", "/demo/:demoKey"])("%s 는 lazy 로 로드한다", (path) => {
    const route = demoRoutes.find((r) => r.path === path);
    expect(route?.lazy).toBeTypeOf("function");
  });
});
