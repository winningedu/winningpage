// W9a 서비스 상세 창과 W9b 리포트 보기 전용. 창은 한 번에 하나, 리포트에는 워터마크가 있고 인쇄와 내려받기가 없다.

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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
  homeroomMe,
  renderRoutes,
  stubApi,
} from "../testUtils";
import CoachingPage from "./CoachingPage";
import type { Coaching } from "./types";

const routes = [
  {
    path: "/teacher",
    Component: ConsoleGate,
    children: [
      {
        Component: ConsoleLayout,
        children: [{ path: "coaching", Component: CoachingPage }],
      },
    ],
  },
];

const using = {
  diagnosis: "using",
  goal: "using",
  growth: "using",
  performance: "using",
  selfeval: "using",
  inquiry: "using",
} as const;

const coaching = {
  student: {
    id: "s1",
    name: "김서연",
    grade: "고2",
    groupName: null,
    className: "3",
    number: 1,
    homeroomName: "박지훈",
    servicesUsed: 6,
    services: using,
    targets: null,
  },
  verdicts: {
    execution: { level: "caution" },
    learning: { level: "caution" },
    linkage: { level: "caution" },
  },
  signal: "caution",
  signalSubLine: "실행 주의, 학습역량 주의, 연계 주의",
  coachingType: { code: "F1", name: "연결 보강" },
  summary: "요약",
  axes: [],
  highlights: { strongest: null, weakest: null },
  competencies: [],
  text: {
    priorityTask: null,
    points: [],
    gradeInputCheck: null,
    competencyGap: null,
    strengths: [],
    weaknesses: [],
    careerPlan: null,
    studyMethods: [],
    goalOpinion: null,
  },
  serviceCards: [
    {
      service: "diagnosis",
      name: "학습진단",
      state: "using",
      chip: "진단 완료",
      tone: "neutral",
      value: "긴급도 보통",
      detail: "",
    },
    {
      service: "goal",
      name: "목표관리",
      state: "using",
      chip: "주의",
      tone: "warning",
      value: "달성율 72%",
      detail: "",
    },
  ],
} as unknown as Coaching;

const goalDetail = {
  detail: {
    service: "goal",
    title: "목표관리 상세",
    metrics: [{ label: "최소 목표시간 충족", value: "4일 / 6일" }],
    table: {
      heading: "최근 14일 일별 기록",
      columns: ["날짜", "요일"],
      rows: [["11.02", "월"]],
    },
    points: ["목표시간 달성율 72%"],
  },
};

function render(over: Record<string, ApiHandler> = {}) {
  return stubApi({
    "GET /api/console/me": { body: homeroomMe },
    "GET /api/console/coaching/students": {
      body: {
        students: [
          {
            studentId: "s1",
            name: "김서연",
            grade: "고2",
            groupName: null,
            classId: "c3",
            className: "3",
            number: 1,
            usesDiagnosis: true,
            usesGoal: true,
          },
        ],
        defaultStudentId: "s1",
      },
    },
    "GET /api/console/coaching?studentId=s1": { body: coaching },
    "GET /api/console/memos?studentId=s1": { body: { memos: [] } },
    "GET /api/console/coaching/service?studentId=s1&service=goal": {
      body: goalDetail,
    },
    "GET /api/console/coaching/service?studentId=s1&service=diagnosis": {
      body: {
        detail: {
          ...goalDetail.detail,
          service: "diagnosis",
          title: "학습진단 상세",
          table: null,
          points: [],
        },
      },
    },
    ...over,
  });
}

beforeEach(() => {
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "u" }, access_token: "tok" } },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const openGoal = async () => {
  renderRoutes(routes, "/teacher/coaching?studentId=s1");
  const buttons = await screen.findAllByRole("button", {
    name: "상세 창 열기",
  });
  fireEvent.click(buttons[1] as HTMLElement);
  return screen.findByRole("dialog");
};

describe("W9a 서비스 상세 창", () => {
  it("상세 창 열기를 누르면 그 서비스의 지표와 표와 상담 포인트를 보인다", async () => {
    render();

    const dialog = await openGoal();

    expect(await within(dialog).findByText("목표관리 상세")).toBeTruthy();
    expect(within(dialog).getByText("최소 목표시간 충족")).toBeTruthy();
    expect(within(dialog).getByText("4일 / 6일")).toBeTruthy();
    expect(within(dialog).getByText("최근 14일 일별 기록")).toBeTruthy();
    expect(within(dialog).getByText("11.02")).toBeTruthy();
    expect(within(dialog).getByText("목표시간 달성율 72%")).toBeTruthy();
    expect(
      within(dialog).getByRole("button", { name: "리포트 보기" }),
    ).toBeTruthy();
  });

  it("닫기와 ESC 로 닫힌다", async () => {
    render();
    const dialog = await openGoal();

    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await openGoal();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("창을 읽지 못하면 안내한다", async () => {
    render({
      "GET /api/console/coaching/service?studentId=s1&service=goal": {
        status: 404,
        body: {},
      },
    });
    const dialog = await openGoal();
    expect(
      await within(dialog).findByText("서비스 상세를 불러오지 못했어요"),
    ).toBeTruthy();
  });
});

describe("W9b 리포트 보기 전용", () => {
  it("리포트 글에 워터마크를 두고 인쇄와 내려받기 버튼을 두지 않는다", async () => {
    render({
      "GET /api/console/coaching/report?studentId=s1&service=goal": {
        body: {
          title: "목표관리 리포트",
          summary: "한 주 요약",
          sections: [{ title: "보완할 점", text: "근거를 더 쓰세요" }],
        },
      },
    });
    const dialog = await openGoal();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "리포트 보기" }),
    );

    const viewer = await screen.findByRole("dialog", {
      name: "목표관리 리포트",
    });
    expect(within(viewer).getByText("한 주 요약")).toBeTruthy();
    expect(within(viewer).getByText("보완할 점")).toBeTruthy();
    expect(within(viewer).getByText("근거를 더 쓰세요")).toBeTruthy();
    expect(
      within(viewer).getAllByText(/박지훈.*열람 전용/).length,
    ).toBeGreaterThan(0);
    expect(
      within(viewer).queryByRole("button", {
        name: /인쇄|다운로드|내려받기|PDF/,
      }),
    ).toBeNull();
    expect(viewer.classList.contains("coaching-report-viewer")).toBe(true);
  });

  it("리포트가 없으면 안내한다", async () => {
    render({
      "GET /api/console/coaching/report?studentId=s1&service=goal": {
        status: 404,
        body: { error: { code: "NO_REPORT" } },
      },
    });
    const dialog = await openGoal();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "리포트 보기" }),
    );

    expect(await screen.findByText("열람할 리포트가 없어요")).toBeTruthy();
  });
});
