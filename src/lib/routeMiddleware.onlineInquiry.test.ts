// requireOnlineInquiryAvailableMiddleware 회귀 테스트 — /online-inquiry는
// 카카오톡 채널 상담 랜딩이다. site.company.kakaoChannelUrl이 없는 사이트
// (스쿨멘토)에서 직접 URL로 들어와도 안내만 남는 죽은 페이지가 되지 않도록
// 홈으로 되돌린다. site.company는 빌드타임 상수라 DB 조회 없이 동기 판정한다.
import { describe, expect, it, vi } from "vitest";

const siteState = vi.hoisted(() => ({
  kakaoChannelUrl: "https://pf.kakao.com/_test" as string | undefined,
}));
vi.mock("@/config/site", () => ({
  site: {
    company: {
      get kakaoChannelUrl() {
        return siteState.kakaoChannelUrl;
      },
    },
  },
}));

const { requireOnlineInquiryAvailableMiddleware } = await import(
  "./routeMiddleware"
);

describe("requireOnlineInquiryAvailableMiddleware — kakaoChannelUrl 있음(winning)", () => {
  it("통과한다(redirect하지 않는다)", async () => {
    siteState.kakaoChannelUrl = "https://pf.kakao.com/_test";

    await expect(
      // @ts-expect-error — 이 미들웨어는 인자를 쓰지 않아 테스트에서 빈 값을 넘긴다.
      requireOnlineInquiryAvailableMiddleware({}, () => {}),
    ).resolves.toBeUndefined();
  });
});

describe("requireOnlineInquiryAvailableMiddleware — kakaoChannelUrl 없음(schoolmentor)", () => {
  it("'/'로 redirect한다", async () => {
    siteState.kakaoChannelUrl = undefined;

    let caught: unknown;
    try {
      // @ts-expect-error — 위와 동일.
      await requireOnlineInquiryAvailableMiddleware({}, () => {});
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Response);
    expect((caught as Response).status).toBe(302);
    expect((caught as Response).headers.get("Location")).toBe("/");
  });
});
