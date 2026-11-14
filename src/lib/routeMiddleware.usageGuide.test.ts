// requireUsageGuideAvailableMiddleware 회귀 테스트 - 이용안내를 열지 않는 사이트
// (site.features.usageGuide=false, 위닝에듀)에서 /usage-guide를 직접 URL로 열어도
// 홈으로 되돌린다. site는 빌드타임 상수라 동기 판정한다.
import { describe, expect, it, vi } from "vitest";

const siteState = vi.hoisted(() => ({ usageGuide: true }));
vi.mock("@/config/site", () => ({
  site: {
    company: {},
    features: {
      get usageGuide() {
        return siteState.usageGuide;
      },
    },
  },
}));

const { requireUsageGuideAvailableMiddleware } = await import(
  "./routeMiddleware"
);

describe("requireUsageGuideAvailableMiddleware", () => {
  it("이용안내를 여는 사이트(schoolmentor)는 통과한다", async () => {
    siteState.usageGuide = true;

    await expect(
      // @ts-expect-error - 이 미들웨어는 인자를 쓰지 않아 테스트에서 빈 값을 넘긴다.
      requireUsageGuideAvailableMiddleware({}, () => {}),
    ).resolves.toBeUndefined();
  });

  it("이용안내를 닫는 사이트(winning)는 '/'로 redirect한다", async () => {
    siteState.usageGuide = false;

    let caught: unknown;
    try {
      // @ts-expect-error - 위와 동일.
      await requireUsageGuideAvailableMiddleware({}, () => {});
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Response);
    expect((caught as Response).status).toBe(302);
    expect((caught as Response).headers.get("Location")).toBe("/");
  });
});
