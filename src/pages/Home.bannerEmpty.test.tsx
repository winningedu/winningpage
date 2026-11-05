// 홈 배너 빈 상태(기획 #26): 노출 기간과 대상을 거른 뒤 큰 배너/작은 배너가 0건이면
// 스쿨멘토는 각 영역에 '배너가 없습니다'를 보여준다. 조회가 끝나기 전에는 보여주지 않고,
// 위닝처럼 안내 스위치가 꺼진 사이트는 기존대로 영역을 숨긴다.
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  notice: true,
  rows: {} as Record<string, unknown[]>,
  // 값이 있으면 해당 테이블 조회를 resolve 전까지 붙잡아 둔다(로딩 상태 재현).
  held: {} as Record<string, Promise<void>>,
}));

vi.mock("@/config/site", () => ({
  site: {
    company: {},
    features: {
      premium: false,
      hiddenPrograms: [],
      get bannerEmptyNotice() {
        return state.notice;
      },
    },
  },
}));

vi.mock("@/lib/supabase", () => {
  const makeChain = (table: string): Promise<{ data: unknown; error: null }> =>
    Object.assign(
      (state.held[table] ?? Promise.resolve()).then(() => ({
        data: state.rows[table] ?? [],
        error: null,
      })),
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
  useHomeMentors: () => ({ mentors: [] }),
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
  state.notice = true;
  state.rows = {};
  state.held = {};
});

describe("Home 배너 빈 상태 안내", () => {
  test("큰 배너와 작은 배너가 모두 0건이면 각 영역에 안내 문구를 보여준다", async () => {
    renderHome();

    const main = await screen.findByRole("region", { name: "메인 배너" });
    const side = await screen.findByRole("region", { name: "이벤트 배너" });
    expect(within(main).getByText("배너가 없습니다")).toBeInTheDocument();
    expect(within(side).getByText("배너가 없습니다")).toBeInTheDocument();
  });

  test("작은 배너만 있으면 큰 배너 영역에만 안내 문구를 보여준다", async () => {
    state.rows.home_side_banners = [
      { id: "s1", title: "작은배너", image_url: "/side.png" },
    ];
    renderHome();

    const main = await screen.findByRole("region", { name: "메인 배너" });
    expect(within(main).getByText("배너가 없습니다")).toBeInTheDocument();
    expect(await screen.findByAltText("작은배너")).toBeInTheDocument();
    expect(screen.getAllByText("배너가 없습니다")).toHaveLength(1);
  });

  test("큰 배너만 있으면 작은 배너 영역에만 안내 문구를 보여준다", async () => {
    state.rows.banners = [{ id: 1, title: "큰배너", image_url: "/main.png" }];
    renderHome();

    const side = await screen.findByRole("region", { name: "이벤트 배너" });
    expect(within(side).getByText("배너가 없습니다")).toBeInTheDocument();
    expect(await screen.findByAltText("큰배너")).toBeInTheDocument();
    expect(screen.getAllByText("배너가 없습니다")).toHaveLength(1);
  });

  test("노출 기간이 지났거나 특정 기관 전용인 배너만 남으면 안내 문구를 보여준다", async () => {
    state.rows.banners = [
      {
        id: 1,
        title: "기간 지난 배너",
        image_url: "/old.png",
        end_date: "2000-01-01",
      },
      {
        id: 2,
        title: "기관 전용 배너",
        image_url: "/tenant.png",
        tenant_id: "t-1",
      },
    ];
    renderHome();

    const main = await screen.findByRole("region", { name: "메인 배너" });
    expect(within(main).getByText("배너가 없습니다")).toBeInTheDocument();
    expect(screen.queryByAltText("기간 지난 배너")).toBeNull();
    expect(screen.queryByAltText("기관 전용 배너")).toBeNull();
  });

  test("조회가 끝나기 전에는 안내 문구를 보여주지 않는다", async () => {
    let release = () => {};
    state.held.banners = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderHome();

    // 작은 배너 조회는 이미 끝났으므로 그 영역은 안내가 뜨고, 큰 배너는 아직 비어 있다.
    const side = await screen.findByRole("region", { name: "이벤트 배너" });
    expect(within(side).getByText("배너가 없습니다")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "메인 배너" })).toBeNull();

    release();
    const main = await screen.findByRole("region", { name: "메인 배너" });
    expect(within(main).getByText("배너가 없습니다")).toBeInTheDocument();
  });

  test("안내 스위치가 꺼진 사이트(위닝)는 배너가 없으면 영역을 렌더하지 않는다", async () => {
    state.notice = false;
    renderHome();

    expect(await screen.findByText("등록된 공지사항이 없습니다.")).toBeTruthy();
    expect(screen.queryByText("배너가 없습니다")).toBeNull();
    expect(screen.queryByRole("region", { name: "메인 배너" })).toBeNull();
    expect(screen.queryByRole("region", { name: "이벤트 배너" })).toBeNull();
  });
});
