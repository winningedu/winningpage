import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// 브라우저 시간대를 테스트마다 바꾼다.
const zone = vi.hoisted(() => ({ current: "Asia/Seoul" }));
vi.mock("@/lib/time/zone", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/time/zone")>()),
  browserTimeZone: () => zone.current,
}));

vi.mock("./api", () => ({
  fetchLoginStats: vi.fn(),
  fetchLoginLog: vi.fn(),
}));

import type { LoginLogResponse, LoginStatsResponse } from "./api";
import * as api from "./api";
import LoginSection from "./LoginSection";

function stats(over: Partial<LoginStatsResponse> = {}): LoginStatsResponse {
  return {
    ok: true,
    from: "2026-11-01",
    to: "2026-11-23",
    grain: "day",
    mauMode: "calendar",
    includeInternal: false,
    firstMeasuredAt: "2026-11-22T15:15:00.000Z",
    series: [
      {
        start: "2026-11-21",
        end: "2026-11-21",
        source: "none",
        members: 0,
        byMemberType: {},
      },
      {
        start: "2026-11-22",
        end: "2026-11-22",
        source: "estimated",
        members: 7,
        byMemberType: { student: 5, parent: 2 },
      },
      {
        start: "2026-11-23",
        end: "2026-11-23",
        source: "measured",
        members: 12,
        byMemberType: { student: 12 },
      },
    ],
    dau: {
      from: "2026-11-01",
      to: "2026-11-23",
      average: 6.3,
      source: "estimated",
    },
    mau: {
      from: "2026-11-01",
      to: "2026-11-23",
      mode: "calendar",
      members: 345,
      source: "estimated",
      byMemberType: { student: 300, parent: 45 },
    },
    ...over,
  };
}

const ITEM: LoginLogResponse["items"][number] = {
  profileId: "p-1",
  loginDate: "2026-11-23",
  firstSeenAt: "2026-11-23T00:10:00Z",
  name: "김학생",
  memberType: "student",
  tenantName: "한빛고",
};

function log(over: Partial<LoginLogResponse> = {}): LoginLogResponse {
  return {
    ok: true,
    from: "2026-11-01",
    to: "2026-11-23",
    includeInternal: false,
    page: 1,
    pageSize: 50,
    total: 120,
    namesVisible: true,
    items: [ITEM],
    ...over,
  };
}

function renderPage(path = "/admin/hqDashboard") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <LoginSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const lastSearch = (fn: unknown) => {
  const calls = vi.mocked(fn as (s: string) => unknown).mock.calls;
  return String(calls[calls.length - 1]?.[0]);
};

beforeEach(() => {
  zone.current = "Asia/Seoul";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-23T03:00:00Z"));
  vi.mocked(api.fetchLoginStats).mockResolvedValue(stats());
  vi.mocked(api.fetchLoginLog).mockResolvedValue(log());
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("LoginSection", () => {
  test("기본은 이번 달 1일부터 오늘(브라우저 시간대)을 일 단위, 달력 기준으로 부른다", async () => {
    renderPage();

    expect(
      screen.getByRole("heading", { level: 2, name: "로그인 이용" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(api.fetchLoginStats).toHaveBeenCalled());
    expect(lastSearch(api.fetchLoginStats)).toBe(
      "view=stats&from=2026-11-01&to=2026-11-23&grain=day&mau=calendar&includeInternal=0",
    );
    expect(lastSearch(api.fetchLoginLog)).toBe(
      "view=log&from=2026-11-01&to=2026-11-23&page=1&includeInternal=0",
    );
  });

  test("오늘은 브라우저 시간대로 정한다(로스앤젤레스는 아직 11-22)", async () => {
    zone.current = "America/Los_Angeles";
    renderPage();

    await waitFor(() => expect(api.fetchLoginStats).toHaveBeenCalled());
    expect(lastSearch(api.fetchLoginStats)).toContain(
      "from=2026-11-01&to=2026-11-22",
    );
    expect(lastSearch(api.fetchLoginLog)).toContain(
      "from=2026-11-01&to=2026-11-22",
    );
  });

  test("DAU, MAU 카드는 값과 기간, 출처 표시를 함께 보여 준다", async () => {
    renderPage();

    const dau = await screen.findByRole("region", { name: "DAU 일평균" });
    expect(within(dau).getByText("6.3")).toBeInTheDocument();
    expect(
      within(dau).getByText("2026-11-01 ~ 2026-11-23"),
    ).toBeInTheDocument();
    expect(within(dau).getByText("추정")).toBeInTheDocument();

    const mau = screen.getByRole("region", { name: "MAU 달력 기준" });
    expect(within(mau).getByText("345")).toBeInTheDocument();
    expect(
      within(mau).getByText("2026-11-01 ~ 2026-11-23"),
    ).toBeInTheDocument();
  });

  test("추이 표는 묶음마다 기간, 출처(실측, 추정, 기록 없음), 인원, 유형별 인원을 보여 준다", async () => {
    renderPage();

    const table = await screen.findByRole("table", { name: "기간별 이용자" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(
      within(rows[0] as HTMLElement).getByText("기록 없음"),
    ).toBeInTheDocument();
    expect(
      within(rows[1] as HTMLElement).getByText("추정"),
    ).toBeInTheDocument();
    expect(
      within(rows[1] as HTMLElement).getByText("학생 5, 학부모 2"),
    ).toBeInTheDocument();
    expect(
      within(rows[2] as HTMLElement).getByText("실측"),
    ).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText("12")).toBeInTheDocument();
  });

  test("실측 시작일을 알려 준다", async () => {
    renderPage();

    expect(
      await screen.findByText(
        "로그인 실측은 2026-11-23부터입니다. 그 전은 활동 기록으로 추정합니다.",
      ),
    ).toBeInTheDocument();
  });

  test("실측 시작일은 브라우저 시간대의 날짜로 보인다(UTC 는 11-22)", async () => {
    zone.current = "UTC";
    renderPage();

    expect(
      await screen.findByText(
        "로그인 실측은 2026-11-22부터입니다. 그 전은 활동 기록으로 추정합니다.",
      ),
    ).toBeInTheDocument();
  });

  test("실측 기록이 아직 없으면 전부 추정이라고 알려 준다", async () => {
    vi.mocked(api.fetchLoginStats).mockResolvedValue(
      stats({ firstMeasuredAt: null }),
    );
    renderPage();

    expect(
      await screen.findByText(
        "로그인 실측 기록이 아직 없어 활동 기록으로 추정합니다.",
      ),
    ).toBeInTheDocument();
  });

  test("주소의 필터를 읽어 그대로 부르고 칸을 채운다", async () => {
    renderPage(
      "/admin/hqDashboard?loginFrom=2026-10-01&loginTo=2026-10-31&loginGrain=week&loginMau=rolling30&includeInternal=1&loginPage=2",
    );

    await waitFor(() => expect(api.fetchLoginStats).toHaveBeenCalled());
    expect(lastSearch(api.fetchLoginStats)).toBe(
      "view=stats&from=2026-10-01&to=2026-10-31&grain=week&mau=rolling30&includeInternal=1",
    );
    expect(lastSearch(api.fetchLoginLog)).toBe(
      "view=log&from=2026-10-01&to=2026-10-31&page=2&includeInternal=1",
    );
    expect(screen.getByLabelText("시작일")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("종료일")).toHaveValue("2026-10-31");
    expect(screen.getByLabelText("묶음")).toHaveValue("week");
    expect(screen.getByLabelText("MAU 기준")).toHaveValue("rolling30");
  });

  test("스위치는 기관 현황과 같이 쓰는 includeInternal 하나라 따로 그리지 않고, 0 이면 제외로 부른다", async () => {
    renderPage("/admin/hqDashboard?includeInternal=0");
    await waitFor(() => expect(api.fetchLoginStats).toHaveBeenCalled());

    expect(lastSearch(api.fetchLoginStats)).toContain("includeInternal=0");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  test("기간을 바꾸면 기록 표 쪽은 1로 돌아간다", async () => {
    renderPage("/admin/hqDashboard?loginPage=3");
    await waitFor(() =>
      expect(lastSearch(api.fetchLoginLog)).toContain("page=3"),
    );

    fireEvent.change(screen.getByLabelText("종료일"), {
      target: { value: "2026-11-20" },
    });

    await waitFor(() =>
      expect(lastSearch(api.fetchLoginLog)).toBe(
        "view=log&from=2026-11-01&to=2026-11-20&page=1&includeInternal=0",
      ),
    );
  });

  test("기관 표의 쪽(tenantPage)은 기록 표 쪽으로 읽지 않는다", async () => {
    renderPage("/admin/hqDashboard?tenantPage=4&page=5");
    await waitFor(() => expect(api.fetchLoginLog).toHaveBeenCalled());

    expect(lastSearch(api.fetchLoginLog)).toContain("page=1");
  });

  test("묶음과 기간을 바꾸면 그 값으로 다시 부른다", async () => {
    renderPage();
    await waitFor(() => expect(api.fetchLoginStats).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("묶음"), {
      target: { value: "month" },
    });
    fireEvent.change(screen.getByLabelText("시작일"), {
      target: { value: "2026-09-01" },
    });

    await waitFor(() =>
      expect(lastSearch(api.fetchLoginStats)).toBe(
        "view=stats&from=2026-09-01&to=2026-11-23&grain=month&mau=calendar&includeInternal=0",
      ),
    );
  });

  test("로그인 기록 표는 날짜, 처음 접속 시각(브라우저 시간대), 이름, 유형, 기관과 전체 건수를 보여 준다", async () => {
    renderPage();

    const table = await screen.findByRole("table", { name: "로그인 기록" });
    const row = within(table).getAllByRole("row")[1] as HTMLElement;
    expect(within(row).getByText("2026-11-23")).toBeInTheDocument();
    expect(within(row).getByText("2026-11-23 09:10")).toBeInTheDocument();
    expect(within(row).getByText("김학생")).toBeInTheDocument();
    expect(within(row).getByText("학생")).toBeInTheDocument();
    expect(within(row).getByText("한빛고")).toBeInTheDocument();
    expect(screen.getByText("전체 120건")).toBeInTheDocument();
  });

  test("처음 접속은 순간을 브라우저 시간대로 보인다(UTC 는 00:10)", async () => {
    zone.current = "UTC";
    renderPage();

    const table = await screen.findByRole("table", { name: "로그인 기록" });
    const row = within(table).getAllByRole("row")[1] as HTMLElement;
    expect(within(row).getByText("2026-11-23 00:10")).toBeInTheDocument();
  });

  test("이름 권한이 없으면 이름 칸을 가리고 안내한다", async () => {
    vi.mocked(api.fetchLoginLog).mockResolvedValue(
      log({ namesVisible: false, items: [{ ...ITEM, name: null }] }),
    );
    renderPage();

    expect(
      await screen.findByText(
        "이름은 회원 관리 보기 권한이 있는 관리자에게만 보입니다.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("김학생")).not.toBeInTheDocument();
  });

  test("다음 쪽을 누르면 page=2 로 부른다", async () => {
    renderPage();
    await screen.findByRole("table", { name: "로그인 기록" });

    fireEvent.click(screen.getByRole("button", { name: "2페이지" }));

    await waitFor(() =>
      expect(lastSearch(api.fetchLoginLog)).toBe(
        "view=log&from=2026-11-01&to=2026-11-23&page=2&includeInternal=0",
      ),
    );
  });

  test("조회가 실패하면 오류 문구를 보여 준다", async () => {
    vi.mocked(api.fetchLoginStats).mockRejectedValue(
      new Error("대시보드 권한이 없습니다."),
    );
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "대시보드 권한이 없습니다.",
    );
  });
});
