// 스쿨멘토 홈 구성(W1): 합격생 섹션은 디자인에 없어 렌더하지 않고, 위닝은 지금 그대로다.
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  b2b: true,
  rows: {} as Record<string, unknown[]>,
}));

vi.mock("@/config/site", () => ({
  site: {
    brandName: "스쿨멘토",
    columnTitle: "칼럼-교육청소식",
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
  const makeChain = (table: string): Promise<{ data: unknown; error: null }> =>
    Object.assign(
      Promise.resolve({ data: state.rows[table] ?? [], error: null }),
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
  useHomeMentors: () => ({ mentors: [], status: "ready" }),
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
  state.rows = {
    program_categories: [
      {
        id: "s1",
        name: "학습진단",
        link: "/services/learning-diagnosis",
        sort_order: 1,
      },
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
});
