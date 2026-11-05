// requireCallmentorAvailableMiddleware 회귀 테스트 - 콜멘토를 닫는 사이트
// (site.features.callmentor=false, 스쿨멘토)에서 /services/callmentor를 직접 열어도 홈으로 되돌린다.
import { describe, expect, it, vi } from "vitest";

const siteState = vi.hoisted(() => ({ callmentor: true }));
vi.mock("@/config/site", () => ({
  site: {
    company: {},
    features: {
      get callmentor() {
        return siteState.callmentor;
      },
    },
  },
}));

const { requireCallmentorAvailableMiddleware } = await import(
  "./routeMiddleware"
);

describe("requireCallmentorAvailableMiddleware", () => {
  it("콜멘토를 여는 사이트(winning)는 통과한다", async () => {
    siteState.callmentor = true;

    await expect(
      // @ts-expect-error - 이 미들웨어는 인자를 쓰지 않아 테스트에서 빈 값을 넘긴다.
      requireCallmentorAvailableMiddleware({}, () => {}),
    ).resolves.toBeUndefined();
  });

  it("콜멘토를 닫는 사이트(schoolmentor)는 '/'로 redirect한다", async () => {
    siteState.callmentor = false;

    let caught: unknown;
    try {
      // @ts-expect-error - 위와 동일.
      await requireCallmentorAvailableMiddleware({}, () => {});
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Response);
    expect((caught as Response).headers.get("Location")).toBe("/");
  });
});
