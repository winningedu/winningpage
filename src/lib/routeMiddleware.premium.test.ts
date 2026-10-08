// requirePremiumAvailableMiddleware 회귀 테스트 - 프리미엄을 숨기는 사이트
// (site.features.premium=false, 스쿨멘토)에서 /page/premium/*, /premium-apply를
// 직접 URL로 열어도 홈으로 되돌린다. site는 빌드타임 상수라 동기 판정한다.
import { describe, expect, it, vi } from "vitest";

const siteState = vi.hoisted(() => ({ premium: true }));
vi.mock("@/config/site", () => ({
  site: {
    company: {},
    features: {
      get premium() {
        return siteState.premium;
      },
    },
  },
}));

const { requirePremiumAvailableMiddleware } = await import("./routeMiddleware");

describe("requirePremiumAvailableMiddleware - 프리미엄 노출(winning)", () => {
  it("통과한다(redirect하지 않는다)", async () => {
    siteState.premium = true;

    await expect(
      // @ts-expect-error - 이 미들웨어는 인자를 쓰지 않아 테스트에서 빈 값을 넘긴다.
      requirePremiumAvailableMiddleware({}, () => {}),
    ).resolves.toBeUndefined();
  });
});

describe("requirePremiumAvailableMiddleware - 프리미엄 숨김(schoolmentor)", () => {
  it("'/'로 redirect한다", async () => {
    siteState.premium = false;

    let caught: unknown;
    try {
      // @ts-expect-error - 위와 동일.
      await requirePremiumAvailableMiddleware({}, () => {});
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Response);
    expect((caught as Response).status).toBe(302);
    expect((caught as Response).headers.get("Location")).toBe("/");
  });
});
