// 회사소개 페이지의 프리미엄 노출 게이트 - 프리미엄을 숨기는 사이트(스쿨멘토)는
// 히어로 프리미엄 카드와 입시 컨설팅(프리미엄) 사업영역 카드를 렌더하지 않는다.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";

const siteState = vi.hoisted(() => ({
  premium: true,
  hidden: [] as string[],
}));
vi.mock("@/config/site", () => ({
  site: {
    company: {},
    features: {
      get premium() {
        return siteState.premium;
      },
      get hiddenPrograms() {
        return siteState.hidden;
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

describe("CompanyNews - 프리미엄 노출(winning)", () => {
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

describe("CompanyNews - 프리미엄 숨김(schoolmentor)", () => {
  test("프리미엄 히어로 카드와 입시 컨설팅 사업영역 카드를 렌더하지 않는다", () => {
    siteState.premium = false;
    const { container } = renderPage();

    expect(screen.queryByText("프리미엄")).not.toBeInTheDocument();
    expect(screen.queryByText("입시 컨설팅 서비스")).not.toBeInTheDocument();
    expect(container.querySelector('a[href^="/page/premium"]')).toBeNull();
    expect(screen.getByText("성장설계")).toBeInTheDocument();
  });
});

describe("CompanyNews - 숨김 프로그램", () => {
  const PLATFORM_DESC =
    "학습진단, 목표관리, 수행평가, 성장설계, 콜멘토, 자기평가, 심화탐구";

  test("숨김 목록이 비어 있으면 히어로 카드와 학습 플랫폼 설명이 그대로다", () => {
    siteState.premium = true;
    siteState.hidden = [];
    renderPage();

    expect(screen.getByText("성장설계")).toBeInTheDocument();
    expect(screen.getByText("자기평가")).toBeInTheDocument();
    expect(screen.getByText("심화탐구")).toBeInTheDocument();
    expect(screen.getByText(PLATFORM_DESC)).toBeInTheDocument();
  });

  test("성장설계를 숨기면 히어로 카드와 학습 플랫폼 설명에서 빠진다", () => {
    siteState.premium = true;
    siteState.hidden = ["growth"];
    const { container } = renderPage();

    expect(container.querySelector('a[href="/services/growth"]')).toBeNull();
    expect(screen.queryByText(PLATFORM_DESC)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "학습진단, 목표관리, 수행평가, 콜멘토, 자기평가, 심화탐구",
      ),
    ).toBeInTheDocument();
    siteState.hidden = [];
  });
});
