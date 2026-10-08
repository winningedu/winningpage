// 회사소개 페이지의 프리미엄 노출 게이트 — 프리미엄을 숨기는 사이트(스쿨멘토)는
// 히어로 프리미엄 카드와 입시 컨설팅(프리미엄) 사업영역 카드를 렌더하지 않는다.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";

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

vi.mock("@/lib/supabase", () => {
  const makeChain = (): Promise<{ data: null; error: null }> =>
    Object.assign(Promise.resolve({ data: null, error: null }), {
      select: makeChain,
      eq: makeChain,
      order: makeChain,
      maybeSingle: makeChain,
    });
  return { supabase: { from: makeChain } };
});

const { default: CompanyNews } = await import("./CompanyNews");

function renderPage() {
  return render(
    <MemoryRouter>
      <CompanyNews />
    </MemoryRouter>,
  );
}

describe("CompanyNews — 프리미엄 노출(winning)", () => {
  test("프리미엄 히어로 카드와 입시 컨설팅 사업영역 카드를 렌더한다", () => {
    siteState.premium = true;
    renderPage();

    const premiumCard = screen.getByText("프리미엄").closest("a");
    expect(premiumCard?.getAttribute("href")).toBe(
      "/page/premium/admission-consulting/a",
    );
    expect(screen.getByText("입시 컨설팅 서비스")).toBeInTheDocument();
  });
});

describe("CompanyNews — 프리미엄 숨김(schoolmentor)", () => {
  test("프리미엄 히어로 카드와 입시 컨설팅 사업영역 카드를 렌더하지 않는다", () => {
    siteState.premium = false;
    const { container } = renderPage();

    expect(screen.queryByText("프리미엄")).not.toBeInTheDocument();
    expect(screen.queryByText("입시 컨설팅 서비스")).not.toBeInTheDocument();
    expect(container.querySelector('a[href^="/page/premium"]')).toBeNull();
    expect(screen.getByText("성장설계")).toBeInTheDocument();
  });
});
