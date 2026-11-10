import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { PREMIUM_GLOBAL_UNIVERSITY_PATH } from "@/components/premium/premiumRoutesPaths";
import CompanyNews from "./CompanyNews";

// 사이트별 게시판 문구와 Location 노출은 테스트마다 state 로 바꾼다. 기본값은 위닝이다.
const siteState = vi.hoisted(() => ({
  schoolmentor: false,
}));

vi.mock("@/config/site", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/site")>();
  return {
    site: {
      ...actual.site,
      get news() {
        return siteState.schoolmentor
          ? {
              ...actual.site.news,
              companyTitle: "공지-회사소개",
              companyEmpty: "작성된 글이 없어요",
            }
          : {
              ...actual.site.news,
              companyTitle: "회사소식",
              companyEmpty: "등록된 회사소식이 없습니다.",
            };
      },
      features: {
        ...actual.site.features,
        get companyLocation() {
          return !siteState.schoolmentor;
        },
      },
    },
  };
});

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

describe("CompanyNews 사이트별 게시판과 Location", () => {
  const renderPage = () =>
    render(
      <MemoryRouter>
        <CompanyNews />
      </MemoryRouter>,
    );

  test("위닝은 Location 영역과 회사소식 제목, 기존 빈 안내를 보인다", async () => {
    siteState.schoolmentor = false;
    renderPage();
    expect(screen.getByText("Location")).toBeTruthy();
    expect(screen.getByText("연계 협력기관")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "회사소식" }),
    ).toBeTruthy();
    expect(await screen.findByText("등록된 회사소식이 없습니다.")).toBeTruthy();
  });

  test("스쿨멘토는 Location 영역을 숨기고 공지-회사소개 게시판은 남긴다", async () => {
    siteState.schoolmentor = true;
    renderPage();
    expect(screen.queryByText("Location")).toBeNull();
    expect(screen.queryByText("연계 협력기관")).toBeNull();
    expect(screen.queryByText(/캠퍼스/)).toBeNull();
    expect(
      screen.getByRole("heading", { level: 2, name: "공지-회사소개" }),
    ).toBeTruthy();
    expect(await screen.findByText("작성된 글이 없어요")).toBeTruthy();
  });
});
