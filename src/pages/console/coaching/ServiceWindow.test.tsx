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

const bar = (
  group: "execution" | "readiness",
  name: string,
  score: number,
  status: string,
) => ({
  group,
  name,
  score,
  status,
  firstStep: `${name} 전략`,
  ...(group === "execution" && { target: 75 }),
});
const diagnosisDetail = {
  detail: {
    service: "diagnosis",
    title: "학습진단 상세",
    metrics: [
      {
        label: "학습 실행 역량(6영역 평균)",
        value: "62점",
        sub: "직전 진단 58점",
      },
      { label: "학교생활 준비도", value: "71점", sub: "직전 진단 69점" },
      { label: "학습진단 긴급도", value: "보통", sub: "40점 미만 영역 0개" },
    ],
    table: null,
    points: [],
    summary: "학교 유형 일반고. 가장 시급한 영역 계획 설계 60점, 목표까지 15점",
    bars: [
      ...["가", "나", "다", "라", "마", "바"].map((n, i) =>
        bar("execution", `실행${n}`, 60 + i, "보통"),
      ),
      ...["가", "나", "다", "라", "마", "바"].map((n, i) =>
        bar("readiness", `준비${n}`, 70 + i, "양호"),
      ),
    ],
    secondTable: {
      heading: "학습 실행 역량 우선순위",
      columns: ["순위", "영역", "점수", "상태", "먼저 할 것"],
      rows: [["1순위", "실행가", "60점", "보통", "실행가 전략"]],
    },
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
      body: diagnosisDetail,
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

  it("학습진단 창은 지표 세 칸과 요약과 12개 영역 줄과 우선순위 표를 그린다", async () => {
    render();
    renderRoutes(routes, "/teacher/coaching?studentId=s1");
    const buttons = await screen.findAllByRole("button", {
      name: "상세 창 열기",
    });
    fireEvent.click(buttons[0] as HTMLElement);
    const dialog = await screen.findByRole("dialog");

    expect(await within(dialog).findByText("직전 진단 58점")).toBeTruthy();
    expect(within(dialog).getByText("직전 진단 69점")).toBeTruthy();
    expect(within(dialog).getByText("40점 미만 영역 0개")).toBeTruthy();
    expect(within(dialog).getByText(/목표까지 15점/)).toBeTruthy();
    expect(within(dialog).getAllByTestId("area-bar")).toHaveLength(12);
    expect(within(dialog).getAllByTestId("target-line")).toHaveLength(6);
    const first = within(dialog).getAllByTestId("area-bar")[0] as HTMLElement;
    expect(within(first).getByTestId("target-line")).toBeTruthy();
    expect(within(first).getByText("먼저 할 것: 실행가 전략")).toBeTruthy();
    const last = within(dialog).getAllByTestId("area-bar")[11] as HTMLElement;
    expect(within(last).queryByTestId("target-line")).toBeNull();
    expect(within(dialog).getByText("학습 실행 역량 우선순위")).toBeTruthy();
    expect(within(dialog).getByText("1순위")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "닫기" })).toBeTruthy();
    expect(
      within(dialog).getByRole("button", { name: "리포트 보기" }),
    ).toBeTruthy();
  });

  it("목표관리 창은 목표대학 확률 안내를 보이고 학습진단 전용 칸은 그리지 않는다", async () => {
    render({
      "GET /api/console/coaching/service?studentId=s1&service=goal": {
        body: {
          detail: {
            ...goalDetail.detail,
            notice:
              "목표대학 확률은 합격 가능성 예측이 아니라 상담 참고 지표입니다",
          },
        },
      },
    });
    const dialog = await openGoal();

    expect(
      await within(dialog).findByText(
        "목표대학 확률은 합격 가능성 예측이 아니라 상담 참고 지표입니다",
      ),
    ).toBeTruthy();
    expect(within(dialog).queryAllByTestId("area-bar")).toHaveLength(0);
    expect(within(dialog).queryByText("학습 실행 역량 우선순위")).toBeNull();
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
      await within(dialog).findByText(
        "서비스 상세를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요",
      ),
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

  it("리포트를 읽지 못하면 다시 시도하라고 안내한다", async () => {
    render({
      "GET /api/console/coaching/report?studentId=s1&service=goal": {
        status: 500,
        body: {},
      },
    });
    const dialog = await openGoal();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "리포트 보기" }),
    );

    expect(
      await screen.findByText(
        "리포트를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요",
      ),
    ).toBeTruthy();
  });
});
