import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { PREMIUM_GLOBAL_UNIVERSITY_PATH } from "@/components/premium/premiumRoutesPaths";
import CompanyNews from "./CompanyNews";

// 사이트별 게시판 문구와 Location 노출은 테스트마다 state 로 바꾼다. 기본값은 위닝이다.
const siteState = vi.hoisted(() => ({
  schoolmentor: false,
  newsRows: null as Record<string, unknown>[] | null,
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
        get b2bMenu() {
          return siteState.schoolmentor;
        },
        get premium() {
          return !siteState.schoolmentor;
        },
      },
    },
  };
});

// 쿼리 체인의 어느 지점에서 await 해도 결과가 나오게 하는 Promise 기반 체인.
// company_news 만 테스트가 정한 행을 돌려주고, 나머지는 빈 결과다.
vi.mock("@/lib/supabase", () => {
  const makeChain = (data: unknown): Promise<{ data: unknown; error: null }> =>
    Object.assign(Promise.resolve({ data, error: null }), {
      select: () => makeChain(data),
      eq: () => makeChain(data),
      order: () => makeChain(data),
      maybeSingle: () => makeChain(data),
    });
  return {
    supabase: {
      from: (table: string) =>
        makeChain(table === "company_news" ? siteState.newsRows : null),
    },
  };
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

  test.each([
    [false, "회사소식 목록으로"],
    [true, "공지-회사소개 목록으로"],
  ])(
    "상세 뒤로가기 버튼은 게시판 이름을 따른다 (스쿨멘토=%s)",
    async (schoolmentor, label) => {
      siteState.schoolmentor = schoolmentor;
      siteState.newsRows = [{ id: 1, title: "글 제목", content: "본문" }];
      render(
        <MemoryRouter initialEntries={["/company-news?id=1"]}>
          <CompanyNews />
        </MemoryRouter>,
      );
      expect(await screen.findByRole("button", { name: label })).toBeTruthy();
      siteState.newsRows = null;
    },
  );
});

describe("CompanyNews Mission 문구의 브랜드", () => {
  const renderPage = () =>
    render(
      <MemoryRouter>
        <CompanyNews />
      </MemoryRouter>,
    );

  test("위닝은 위닝에듀 문구를 그대로 보인다", () => {
    siteState.schoolmentor = false;
    const { container } = renderPage();
    expect(container.textContent).toContain(
      "데이터와 전문성으로 증명하는 위닝에듀입니다",
    );
    expect(container.textContent).not.toContain("위닝로직입니다");
  });

  test("스쿨멘토는 위닝로직으로 바꿔 보인다", () => {
    siteState.schoolmentor = true;
    const { container } = renderPage();
    expect(container.textContent).toContain(
      "데이터와 전문성으로 증명하는 위닝로직입니다",
    );
    expect(container.textContent).not.toContain(
      "데이터와 전문성으로 증명하는 위닝에듀입니다",
    );
  });
});

describe("CompanyNews 사업영역 구역", () => {
  const renderPage = () =>
    render(
      <MemoryRouter>
        <CompanyNews />
      </MemoryRouter>,
    );

  const businessSection = () => {
    const section = screen.getByText("사업영역").closest("section");
    if (!section) throw new Error("사업영역 구역이 없습니다");
    return section;
  };

  test("위닝은 기존 제목과 카드 구성을 그대로 보인다", () => {
    siteState.schoolmentor = false;
    renderPage();
    const section = businessSection();
    expect(
      screen.getByRole("heading", { level: 2, name: /위닝에듀는 기술을/ })
        .textContent,
    ).toBe("위닝에듀는 기술을 기반으로 경계없는 입시지원을 제공합니다");
    expect(section.textContent).toContain("입시 컨설팅 서비스");
    expect(section.textContent).not.toContain("1:1 콜멘토링");
    expect(section.textContent).toContain(
      "학습진단, 목표관리, 수행평가, 성장설계, 콜멘토, 자기평가, 심화탐구",
    );
    expect(section.textContent).not.toContain("CEC Academy (영국)");
  });

  test("스쿨멘토는 위닝로직 제목을 두 줄로 보인다", () => {
    siteState.schoolmentor = true;
    renderPage();
    const heading = screen.getByRole("heading", {
      level: 2,
      name: /위닝로직은 기술을/,
    });
    expect(heading.textContent).toBe(
      "위닝로직은 기술을 기반으로 경계없는 진로진학 및 학습지원을 제공합니다",
    );
  });

  test("스쿨멘토는 카드 3장을 학습 플랫폼, 연계 협력 네트워크, 1:1 콜멘토링 순서로 보인다", () => {
    siteState.schoolmentor = true;
    renderPage();
    const titles = Array.from(
      businessSection().querySelectorAll("p.font-semibold"),
    ).map((node) => node.textContent);
    expect(titles).toEqual([
      "학습 플랫폼",
      "연계 협력 네트워크",
      "1:1 콜멘토링",
    ]);
  });

  test("스쿨멘토 학습 플랫폼 본문은 콜멘토 없이 두 줄이다", () => {
    siteState.schoolmentor = true;
    renderPage();
    expect(businessSection().textContent).toContain(
      "학습진단, 목표관리, 수행평가,\n성장설계, 자기평가, 심화탐구",
    );
  });

  test("스쿨멘토 연계 협력 네트워크 본문은 CEC Academy (영국) 줄을 더한다", () => {
    siteState.schoolmentor = true;
    renderPage();
    expect(businessSection().textContent).toContain(
      "클로이위닝 미술학원\nCEC Academy (영국)",
    );
  });

  test("스쿨멘토 1:1 콜멘토링 본문은 시안 세 줄이다", () => {
    siteState.schoolmentor = true;
    renderPage();
    expect(businessSection().textContent).toContain(
      "학업・진로 상담\n공부습관 코칭, 학교생활 관리\n학습진단・액션노트 제공",
    );
  });
});
