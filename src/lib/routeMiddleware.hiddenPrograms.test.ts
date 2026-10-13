// 프로그램 게이트 미들웨어 회귀 테스트 - site.features.hiddenPrograms에 든
// 프로그램의 소개 페이지와 앱 경로는 직접 URL로 열어도 홈으로 되돌린다.
import { describe, expect, it, vi } from "vitest";

const siteState = vi.hoisted(() => ({ hidden: [] as string[] }));
vi.mock("@/config/site", () => ({
  site: {
    company: {},
    features: {
      premium: true,
      get hiddenPrograms() {
        return siteState.hidden;
      },
    },
  },
}));

const {
  requireGrowthAvailableMiddleware,
  requireSelfevalAvailableMiddleware,
  requireInquiryAvailableMiddleware,
} = await import("./routeMiddleware");

const gates = {
  growth: requireGrowthAvailableMiddleware,
  selfeval: requireSelfevalAvailableMiddleware,
  inquiry: requireInquiryAvailableMiddleware,
};

async function run(program: "growth" | "selfeval" | "inquiry") {
  try {
    await gates[program](
      // @ts-expect-error - 이 미들웨어는 인자를 쓰지 않아 테스트에서 빈 값을 넘긴다.
      {},
      () => {},
    );
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("프로그램 게이트 미들웨어", () => {
  it("숨김 목록에 없으면 통과한다", async () => {
    siteState.hidden = [];

    expect(await run("growth")).toBeUndefined();
  });

  it("숨김 목록에 든 프로그램이면 '/'로 redirect한다", async () => {
    siteState.hidden = ["growth"];

    const caught = await run("growth");

    expect(caught).toBeInstanceOf(Response);
    expect((caught as Response).status).toBe(302);
    expect((caught as Response).headers.get("Location")).toBe("/");
  });

  it("다른 프로그램만 숨기면 통과한다", async () => {
    siteState.hidden = ["growth"];

    expect(await run("inquiry")).toBeUndefined();
  });
});
