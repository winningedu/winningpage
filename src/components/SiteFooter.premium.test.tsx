// 푸터의 프리미엄 노출 게이트 — 푸터 메뉴 컬럼은 useNavGroups(실제 구현)를 공유하므로
// 프리미엄을 숨기는 사이트(스쿨멘토)는 프리미엄 컬럼과 '프리미엄 이용' 링크가 없어야 한다.
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

const siteState = vi.hoisted(() => ({ premium: true }));
vi.mock("@/config/site", () => ({
  site: {
    brandName: "스쿨멘토",
    logo: { horizontal: "/h.png", stacked: "/s.png" },
    company: {
      name: "주식회사 위닝로직",
      ceo: "강원석",
      corpRegNo: "1",
      bizRegNo: "2",
      address: "세종",
    },
    features: {
      get premium() {
        return siteState.premium;
      },
    },
  },
}));

// 실 Supabase 조회가 테스트에 영향을 주지 않게 빈 결과 + no-op 채널로 대체한다.
vi.mock("@/lib/supabase", () => {
  const makeChain = (): Promise<{ data: null; error: null }> =>
    Object.assign(Promise.resolve({ data: null, error: null }), {
      select: makeChain,
      eq: makeChain,
      order: makeChain,
    });
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    supabase: {
      from: makeChain,
      channel: () => channel,
      removeChannel: vi.fn(),
    },
  };
});

const { default: SiteFooter } = await import("./SiteFooter");

function renderFooter() {
  return render(
    <MemoryRouter>
      <SiteFooter />
    </MemoryRouter>,
  );
}

describe("SiteFooter — 프리미엄 노출(winning)", () => {
  it("프리미엄 컬럼과 프리미엄 이용 링크를 렌더한다", () => {
    siteState.premium = true;
    renderFooter();

    expect(screen.getAllByText("프리미엄").length).toBeGreaterThan(0);
    expect(screen.getAllByText("프리미엄 이용").length).toBeGreaterThan(0);
  });
});

describe("SiteFooter — 프리미엄 숨김(schoolmentor)", () => {
  it("프리미엄 컬럼과 프리미엄 링크를 렌더하지 않는다", () => {
    siteState.premium = false;
    const { container } = renderFooter();

    expect(screen.queryByText("프리미엄")).not.toBeInTheDocument();
    expect(screen.queryByText("프리미엄 이용")).not.toBeInTheDocument();
    expect(container.querySelector('a[href*="premium"]')).toBeNull();
    expect(screen.getAllByText("서비스").length).toBeGreaterThan(0);
  });
});
