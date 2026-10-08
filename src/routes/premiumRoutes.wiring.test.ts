// 프리미엄 관련 라우트 전부에 requirePremiumAvailableMiddleware가 걸려 있는지 확인한다 —
// 라우트가 추가될 때 게이트가 빠지면 스쿨멘토에서 직접 URL로 열리기 때문이다.
import { describe, expect, it } from "vitest";
import { requirePremiumAvailableMiddleware } from "@/lib/routeMiddleware";
import applyRoutes from "./applyRoutes";
import premiumRoutes from "./premiumRoutes";

describe("프리미엄 라우트 게이트 배선", () => {
  it("/page/premium/* 6종 이상 라우트 모두 게이트를 가진다", () => {
    expect(premiumRoutes.length).toBeGreaterThanOrEqual(6);
    for (const route of premiumRoutes) {
      expect(
        route.middleware?.includes(requirePremiumAvailableMiddleware),
        route.path,
      ).toBe(true);
    }
  });

  it("/premium-apply 와 구 별칭 /page/premium-apply 가 게이트를 가진다", () => {
    const paths = ["/premium-apply", "/page/premium-apply"];
    for (const path of paths) {
      const route = applyRoutes.find((r) => r.path === path);
      expect(
        route?.middleware?.includes(requirePremiumAvailableMiddleware),
        path,
      ).toBe(true);
    }
  });

  it("멘토신청 라우트에는 게이트를 걸지 않는다", () => {
    const route = applyRoutes.find((r) => r.path === "/mentor-apply");
    expect(route?.middleware).toBeUndefined();
  });
});
