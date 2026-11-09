// W8 서비스별 현황표. 여섯 서비스 탭, 학년그룹과 반 조회, 행에서 개인종합코칭으로 이동을 검증한다.

import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));
vi.mock("../useIdleLogout", () => ({ useIdleLogout: vi.fn() }));

import ConsoleGate from "../ConsoleGate";
import ConsoleLayout from "../ConsoleLayout";
import {
  type ApiHandler,
  adminMe,
  homeroomMe,
  renderRoutes,
  stubApi,
} from "../testUtils";
import ServiceStatusPage from "./ServiceStatusPage";

const routes = [
  {
    path: "/teacher",
    Component: ConsoleGate,
    children: [
      {
        Component: ConsoleLayout,
        children: [
          { path: "service-status/:service?", Component: ServiceStatusPage },
          { path: "coaching", Component: () => <p>코칭 화면</p> },
        ],
      },
    ],
  },
];

const CLASSES = {
  classes: [
    {
      id: "c3",
      grade: "고2",
      groupId: null,
      groupName: null,
      name: "3",
      hasHomeroom: true,
    },
    {
      id: "c5",
      grade: "고2",
      groupId: null,
      groupName: null,
      name: "5",
      hasHomeroom: true,
    },
  ],
};

const base = (n: number, name: string) => ({
  studentId: `s${n}`,
  name,
  grade: "고2",
  groupName: null,
  className: "3",
  number: n,
});

const page = (items: unknown[], over: Record<string, unknown> = {}) => ({
  total: items.length,
  page: 1,
  pageCount: 1,
  asOf: "2026-11-05",
  orgType: "학교",
  items,
  ...over,
});

const url = (service: string, extra = "") =>
  `GET /api/console/service-status?service=${service}${extra}&page=1`;

const DIAGNOSIS = page([
  {
    ...base(1, "김서연"),
    detail: {
      urgency: "mid",
      executionAvg: 62,
      readinessAvg: 71,
      weakest: { name: "계획 설계", score: 60, status: "보통" },
      diagnosedAt: "2026-03-10",
    },
  },
  {
    ...base(2, "최민준"),
    detail: {
      urgency: "low",
      executionAvg: 78,
      readinessAvg: 80,
      weakest: { name: "시간 관리", score: 72, status: "보통" },
      diagnosedAt: "2026-03-11",
    },
  },
]);

function stubPage(
  routesOver: Record<string, ApiHandler> = {},
  me: unknown = homeroomMe,
) {
  return stubApi({
    "GET /api/console/me": { body: me },
    "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
    "GET /api/console/classes": { body: CLASSES },
    [url("diagnosis")]: { body: DIAGNOSIS },
    ...routesOver,
  });
}

beforeEach(() => {
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "u" }, access_token: "tok" } },
  });
});

function useMobileScreen() {
  // useIsMobile 은 innerWidth 로 가른다(768 미만)
  window.innerWidth = 500;
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  window.innerWidth = 1024;
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("W8 서비스별 현황표", () => {
  it("학습진단 탭을 기본으로 보여 주고 긴급도, 두 평균, 가장 시급한 영역, 진단일을 적는다", async () => {
    stubPage();

    renderRoutes(routes, "/teacher/service-status");

    expect(await screen.findByText("검색 결과 2명")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "서비스별 현황표" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "집계 기준: 담당 학급 2학년 3반, 2학년 5반, 2026.11.05 기준",
      ),
    ).toBeTruthy();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "학습진단",
      "목표관리",
      "성장설계",
      "수행평가",
      "자기평가",
      "심화탐구",
    ]);
    expect(
      screen
        .getByRole("tab", { name: "학습진단" })
        .getAttribute("aria-selected"),
    ).toBe("true");

    const first = screen.getByRole("row", { name: /김서연/ });
    expect(within(first).getByText("보통")).toBeTruthy();
    expect(within(first).getByText("62점")).toBeTruthy();
    expect(within(first).getByText("71점")).toBeTruthy();
    expect(within(first).getByText("계획 설계(60점, 보통)")).toBeTruthy();
    expect(within(first).getByText("2026.03.10")).toBeTruthy();
    expect(
      within(screen.getByRole("row", { name: /최민준/ })).getByText("낮음"),
    ).toBeTruthy();
  });

  it("탭을 누르면 그 서비스 주소로 가서 목표관리 열과 안내 문구를 보인다", async () => {
    stubPage({
      [url("goal")]: {
        body: page([
          {
            ...base(1, "김서연"),
            detail: {
              weeklyRate: 72,
              minMetDays: 4,
              minSetDays: 6,
              streakDays: 1,
              ideal: {
                university: "가나대",
                department: "경영학과",
                probability: 34,
              },
              min: {
                university: "다라대",
                department: "경영학과",
                probability: 61,
              },
            },
          },
        ]),
      },
    });
    const { router } = renderRoutes(routes, "/teacher/service-status");
    await screen.findByText("검색 결과 2명");

    fireEvent.click(screen.getByRole("tab", { name: "목표관리" }));

    await screen.findByText("72%");
    const row = screen.getByRole("row", { name: /김서연/ });
    expect(router.state.location.pathname).toBe("/teacher/service-status/goal");
    expect(within(row).getByText("4일 / 6일")).toBeTruthy();
    expect(within(row).getByText("1일")).toBeTruthy();
    expect(within(row).getByText("가나대 경영학과")).toBeTruthy();
    expect(within(row).getByText("34%")).toBeTruthy();
    expect(within(row).getByText("다라대 경영학과")).toBeTruthy();
    expect(within(row).getByText("61%")).toBeTruthy();
    expect(
      screen.getByText(
        "목표대학 확률은 합격 가능성 예측이 아니라 상담 참고 지표입니다",
      ),
    ).toBeTruthy();
  });

  it("성장설계, 수행평가, 자기평가, 심화탐구 탭의 열을 그린다", async () => {
    stubPage({
      [url("growth")]: {
        body: page([
          {
            ...base(1, "김서연"),
            detail: {
              storyTheme: "진로 탐색",
              storiesByGrade: [
                { grade: "고1", count: 1 },
                { grade: "고2", count: 1 },
              ],
            },
          },
        ]),
      },
      [url("performance")]: {
        body: page([
          {
            ...base(1, "김서연"),
            detail: {
              step: 4,
              stage: "설계 리포트",
              submissionCount: 2,
              feedback: "done",
              lastSubmittedAt: "2026-10-20",
            },
          },
          {
            ...base(2, "최민준"),
            detail: {
              step: 1,
              stage: "기본 정보",
              submissionCount: 0,
              feedback: null,
              lastSubmittedAt: null,
            },
          },
        ]),
      },
      [url("selfeval")]: {
        body: page([
          {
            ...base(1, "김서연"),
            detail: { stage: "분석 확인", progressPct: 50 },
          },
        ]),
      },
      [url("inquiry")]: {
        body: page([
          {
            ...base(1, "김서연"),
            detail: {
              stage: "보고서 작성",
              topicConfirmed: true,
              progressPct: 50,
            },
          },
          {
            ...base(2, "최민준"),
            detail: {
              stage: "주제 추천",
              topicConfirmed: false,
              progressPct: 17,
            },
          },
        ]),
      },
    });
    renderRoutes(routes, "/teacher/service-status/growth");

    let row = await screen.findByRole("row", { name: /김서연/ });
    expect(within(row).getByText("진로 탐색")).toBeTruthy();
    expect(within(row).getByText("2개(1학년 1, 2학년 1)")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "수행평가" }));
    row = await screen.findByRole("row", { name: /김서연.*설계 리포트/ });
    expect(within(row).getByText("2건")).toBeTruthy();
    expect(within(row).getByText("완료")).toBeTruthy();
    expect(within(row).getByText("2026.10.20")).toBeTruthy();
    const none = screen.getByRole("row", { name: /최민준/ });
    expect(within(none).getByText("0건")).toBeTruthy();
    expect(within(none).queryByText("대기중")).toBeNull();
    expect(within(none).queryByText("완료")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "자기평가" }));
    row = await screen.findByRole("row", { name: /김서연.*분석 확인/ });
    expect(within(row).getByText("50%")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "심화탐구" }));
    row = await screen.findByRole("row", { name: /김서연.*보고서 작성/ });
    expect(within(row).getByText("확정")).toBeTruthy();
    expect(
      within(screen.getByRole("row", { name: /최민준/ })).getByText("미확정"),
    ).toBeTruthy();
  });

  it("행을 누르면 그 학생의 개인종합코칭으로 간다", async () => {
    stubPage();
    const { router } = renderRoutes(routes, "/teacher/service-status");

    fireEvent.click(await screen.findByRole("row", { name: /최민준/ }));

    expect(await screen.findByText("코칭 화면")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/teacher/coaching");
    expect(router.state.location.search).toBe("?studentId=s2");
  });

  it("학년그룹과 반을 고르고 이름을 적어 검색하면 그 조건으로 다시 읽고, 반은 학년그룹을 고른 뒤에만 열린다", async () => {
    const filtered = `GET /api/console/service-status?${new URLSearchParams({
      service: "diagnosis",
      grade: "고2",
      classId: "c5",
      q: "서연",
      page: "1",
    })}`;
    const calls = stubPage({ [filtered]: { body: page([]) } });
    renderRoutes(routes, "/teacher/service-status");
    await screen.findByText("검색 결과 2명");
    const classSelect = screen.getByLabelText("반") as HTMLSelectElement;
    expect(classSelect.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("학년그룹"), {
      target: { value: "고2" },
    });
    expect(classSelect.disabled).toBe(false);
    fireEvent.change(classSelect, { target: { value: "c5" } });
    fireEvent.change(screen.getByPlaceholderText("이름 검색"), {
      target: { value: "서연" },
    });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));

    expect(await screen.findByText("검색 결과 0명")).toBeTruthy();
    expect(calls.some((c) => c.key === filtered)).toBe(true);
  });

  it("관리자는 서버가 가린 이름과 학교 전체 집계 기준을 본다", async () => {
    stubPage(
      {
        [url("diagnosis")]: {
          body: page([
            {
              ...base(1, "김*연"),
              detail: {
                urgency: "high",
                executionAvg: 50,
                readinessAvg: 55,
                weakest: { name: "시간 관리", score: 52, status: "낮음" },
                diagnosedAt: "2026-03-10",
              },
            },
          ]),
        },
      },
      adminMe,
    );
    renderRoutes(routes, "/teacher/service-status");

    expect(
      await screen.findByText("집계 기준: 학교 전체, 2026.11.05 기준"),
    ).toBeTruthy();
    const row = screen.getByRole("row", { name: /김\*연/ });
    expect(within(row).getByText("높음")).toBeTruthy();
  });

  it("이용 학생이 없으면 머리글은 두고 안내를 보이며 쪽 이동은 그리지 않는다", async () => {
    stubPage({ [url("diagnosis")]: { body: page([]) } });
    renderRoutes(routes, "/teacher/service-status");

    expect(await screen.findByText("검색 결과 0명")).toBeTruthy();
    expect(screen.getByText("이 서비스를 이용하는 학생이 없어요")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "진단일" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "쪽 이동" })).toBeNull();
  });

  it("휴대폰은 표 대신 카드를 그리고 더 보기로 다음 쪽을 잇는다", async () => {
    useMobileScreen();
    stubPage({
      [url("diagnosis")]: {
        body: page(DIAGNOSIS.items.slice(0, 1), { total: 2, pageCount: 2 }),
      },
      "GET /api/console/service-status?service=diagnosis&page=2": {
        body: page(DIAGNOSIS.items.slice(1), {
          total: 2,
          pageCount: 2,
          page: 2,
        }),
      },
    });
    renderRoutes(routes, "/teacher/service-status");

    await screen.findByText("김서연");
    expect(screen.queryByRole("table")).toBeNull();
    const card = screen.getByRole("article");
    expect(within(card).getByText("계획 설계(60점, 보통)")).toBeTruthy();
    expect(screen.getByText("1 / 2명")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));

    expect(await screen.findByText("최민준")).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("현황표를 읽지 못하면 오류 안내를 보인다", async () => {
    stubPage({ [url("diagnosis")]: { status: 500, body: {} } });
    renderRoutes(routes, "/teacher/service-status");

    expect(
      await screen.findByText(
        "현황표를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요",
      ),
    ).toBeTruthy();
  });

  it("모르는 탭 주소는 학습진단 탭으로 돌려보낸다", async () => {
    stubPage();
    const { router } = renderRoutes(routes, "/teacher/service-status/nope");

    expect(await screen.findByText("검색 결과 2명")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/teacher/service-status");
  });
});
