import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { PREMIUM_GLOBAL_UNIVERSITY_PATH } from "@/components/premium/premiumRoutesPaths";
import CompanyNews from "./CompanyNews";

// 쿼리 체인의 어느 지점에서 await 해도 빈 결과가 나오게 하는 Promise 기반 체인.
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

describe("CompanyNews 히어로 서비스 카드", () => {
  test("성장설계 카드는 /services/growth 링크로 렌더된다", () => {
    render(
      <MemoryRouter>
        <CompanyNews />
      </MemoryRouter>,
    );
    const link = screen.getByText("성장설계").closest("a");
    expect(link?.getAttribute("href")).toBe("/services/growth");
  });
});

describe("CompanyNews 연계 협력기관 CEC Academy 카드", () => {
  const renderPage = () =>
    render(
      <MemoryRouter>
        <CompanyNews />
      </MemoryRouter>,
    );

  test("CEC Academy 카드와 설명이 렌더된다", () => {
    renderPage();
    expect(screen.getByText("CEC Academy")).toBeTruthy();
    expect(
      screen.getByText("(영국소재) 영국대학 입시의 명문 아카데미"),
    ).toBeTruthy();
  });

  test("런던센터 링크는 구글 지도 검색 URL을 새 창으로 연다", () => {
    renderPage();
    const link = screen.getByRole("link", { name: /CEC Academy 런던센터/ });
    expect(link.getAttribute("href")).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("CEC Academy London, 151 High Street, New Malden, London, Surrey, KT3 4BH")}`,
    );
    expect(link.getAttribute("target")).toBe("_blank");
  });

  test("캠브리지센터 링크는 구글 지도 검색 URL을 새 창으로 연다", () => {
    renderPage();
    const link = screen.getByRole("link", { name: /CEC Academy 캠브리지센터/ });
    expect(link.getAttribute("href")).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Cambridge Edu Centre, First & Second Floors, 85 Regent Street, Cambridge, CB2 1AW")}`,
    );
    expect(link.getAttribute("target")).toBe("_blank");
  });

  test("해외명문대 진학컨설팅 링크는 새 창 없이 내부 경로로 이동한다", () => {
    renderPage();
    const link = screen.getByRole("link", {
      name: /CEC Academy 해외명문대 진학컨설팅/,
    });
    expect(link.getAttribute("href")).toBe(PREMIUM_GLOBAL_UNIVERSITY_PATH);
    expect(link.getAttribute("target")).toBeNull();
  });
});
