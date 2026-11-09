// 스쿨멘토 홈 구성(W1): 합격생 섹션은 디자인에 없어 렌더하지 않고, 위닝은 지금 그대로다.
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  b2b: true,
  failing: [] as string[],
  mentorStatus: "ready" as "ready" | "error",
  rows: {} as Record<string, unknown[]>,
}));

vi.mock("@/config/site", () => ({
  site: {
    brandName: "스쿨멘토",
    columnTitle: "칼럼-교육청소식",
    logo: { horizontal: "/images/schoolmentor-logo.png" },
    company: {},
    news: {
      maxRows: 4,
      companyTitle: "공지-회사소개",
      noticeTitle: "교육-정보안내",
      companyEmpty: "작성된 글이 없어요",
      noticeEmpty: "작성된 글이 없어요",
    },
    features: {
      premium: false,
      hiddenPrograms: [],
      bannerEmptyNotice: true,
      get b2bMenu() {
        return state.b2b;
      },
    },
  },
}));

vi.mock("@/lib/supabase", () => {
  const makeChain = (
    table: string,
  ): Promise<{ data: unknown; error: unknown }> =>
    Object.assign(
      Promise.resolve(
        state.failing.includes(table)
          ? { data: null, error: { message: "boom" } }
          : { data: state.rows[table] ?? [], error: null },
      ),
      {
        select: () => makeChain(table),
        eq: () => makeChain(table),
        or: () => makeChain(table),
        order: () => makeChain(table),
        limit: () => makeChain(table),
      },
    );
  return {
    supabase: {
      from: (table: string) => makeChain(table),
      auth: { getSession: async () => ({ data: { session: null } }) },
    },
  };
});

vi.mock("@/hooks/useHomeMentors", () => ({
  useHomeMentors: () => ({ mentors: [], status: state.mentorStatus }),
}));

const { default: Home } = await import("./Home");

function renderHome() {
  render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.b2b = true;
  state.mentorStatus = "ready";
  state.failing = [];
  state.rows = {
    program_categories: [
      {
        id: "s1",
        name: "학습진단",
        link: "/services/learning-diagnosis",
        sort_order: 1,
      },
    ],
    galleries: [
      { id: "g1", title: "칼럼 하나", created_at: "2026-10-05T00:00:00Z" },
      {
        id: "g2",
        title: "교육청 소식 글",
        category: "교육청소식",
        created_at: "2026-10-06T00:00:00Z",
      },
      {
        id: "g3",
        title: "영상 하나",
        link_url: "https://youtu.be/abcDEF12345",
        created_at: "2026-10-04T00:00:00Z",
      },
      { id: "g4", title: "넷", created_at: "2026-10-03T00:00:00Z" },
      { id: "g5", title: "다섯", created_at: "2026-10-02T00:00:00Z" },
    ],
    university_acceptances: [
      { id: "u-1", name: "서울대학교", track: "general", sort_order: 1 },
    ],
  };
});

describe("Home 스쿨멘토 구성", () => {
  test("합격생 섹션을 렌더하지 않는다", async () => {
    renderHome();
    expect(
      await screen.findByRole("region", { name: "핵심 서비스" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "합격생" })).toBeNull();
  });

  test("위닝은 합격생 섹션을 그대로 렌더한다", async () => {
    state.b2b = false;
    renderHome();
    expect(
      await screen.findByRole("region", { name: "합격생" }),
    ).toBeInTheDocument();
  });

  test("위닝 홈은 특허청 특허 조회 링크와 배지 이미지를 새 창으로 연다", async () => {
    state.b2b = false;
    renderHome();
    await screen.findByRole("region", { name: "핵심 서비스" });
    const link = screen.getByRole("link", { name: /특허 조회 새 창 열기/ });
    expect(link).toHaveAttribute(
      "href",
      "https://www.kipris.or.kr/khome/search/searchResult.do",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(
      within(link).getByAltText(
        "특허청 '학습코칭 장치 및 방법' 특허 등록 103038224",
      ),
    ).toHaveAttribute("src", "/images/landing/patent-badge.png");
  });

  test("스쿨멘토 홈에는 특허 배지 링크가 없다", async () => {
    renderHome();
    await screen.findByRole("region", { name: "핵심 서비스" });
    expect(screen.queryByRole("link", { name: /특허 조회/ })).toBeNull();
  });

  test("서비스, 새로운 소식, 칼럼-교육청소식 순서로 그린다", async () => {
    renderHome();
    const services = await screen.findByRole("region", { name: "핵심 서비스" });
    const news = screen.getByRole("region", { name: "스쿨멘토 소식" });
    const column = await screen.findByRole("region", {
      name: "칼럼-교육청소식",
    });
    const follows = (a: HTMLElement, b: HTMLElement) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(services, news)).toBe(true);
    expect(follows(news, column)).toBe(true);
  });

  test("칼럼 섹션은 교육청소식을 빼고 4개 박스만 보여준다", async () => {
    renderHome();
    const column = await screen.findByRole("region", {
      name: "칼럼-교육청소식",
    });
    await within(column).findByText("칼럼 하나");
    expect(within(column).getAllByRole("listitem")).toHaveLength(4);
    expect(within(column).queryByText("교육청 소식 글")).toBeNull();
    expect(
      within(column).getByRole("button", { name: "영상 하나 영상 재생" }),
    ).toBeInTheDocument();
  });

  test("위닝 홈에는 칼럼 섹션이 없다", async () => {
    state.b2b = false;
    renderHome();
    await screen.findByRole("region", { name: "핵심 서비스" });
    expect(
      screen.queryByRole("region", { name: "칼럼-교육청소식" }),
    ).toBeNull();
  });

  test("선배 카드 조회가 실패하면 그 영역에만 오류 안내를 보여주고 다른 영역은 그대로다", async () => {
    state.mentorStatus = "error";
    renderHome();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "선배 카드를 불러오지 못했어요. 잠시 뒤 새로고침해 주세요",
    );
    expect(
      screen.getByRole("region", { name: "핵심 서비스" }),
    ).toBeInTheDocument();
  });

  test("공지 조회만 실패하면 그 목록에만 오류 안내를 보여준다", async () => {
    state.failing = ["notices"];
    state.rows.company_news = [
      { id: "n1", title: "회사 글", created_at: "2026-10-01T00:00:00Z" },
    ];
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderHome();
    const news = await screen.findByRole("region", { name: "스쿨멘토 소식" });
    await within(news).findByRole("alert");
    expect(within(news).getByText("회사 글")).toBeInTheDocument();
    expect(within(news).getAllByRole("alert")).toHaveLength(1);
  });

  test("칼럼 조회가 실패하면 칼럼 영역에만 오류 안내를 보여준다", async () => {
    state.failing = ["galleries"];
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderHome();
    const column = await screen.findByRole("region", {
      name: "칼럼-교육청소식",
    });
    await within(column).findByRole("alert");
    expect(
      screen.getByRole("region", { name: "핵심 서비스" }),
    ).toBeInTheDocument();
  });

  test("큰 배너 조회가 실패하면 큰 배너 자리에만 오류 안내를 보여준다", async () => {
    state.failing = ["banners"];
    state.rows.home_side_banners = [
      { id: "s1", title: "이벤트 1", image_url: "/s1.png", sort_order: 1 },
    ];
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderHome();
    const main = await screen.findByRole("region", { name: "메인 배너" });
    await within(main).findByRole("alert");
    expect(screen.getByAltText("이벤트 1")).toBeInTheDocument();
  });

  test("배너가 모두 없으면 두 자리에 안내를 보여주고 점 줄은 투명하게 둔다", async () => {
    renderHome();
    expect(await screen.findAllByText("배너가 없어요")).toHaveLength(2);
    expect(screen.getByTestId("hero-dots-placeholder")).toBeInTheDocument();
  });

  test("본문을 투명하게 숨기지 않는다", async () => {
    renderHome();
    const main = await screen.findByRole("main");
    expect(main).not.toHaveClass("opacity-0");
  });
});
