// W9 개인종합코칭. 기본, 일부 서비스만 이용, 고를 학생 없음, 불러오는 중, 기관 관리자 상태를 검증한다.

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
  adminMe,
  homeroomMe,
  renderRoutes,
  stubApi,
} from "../testUtils";
import CoachingPage from "./CoachingPage";
import type { Coaching, PickerStudent } from "./types";

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

const picker = (over: Partial<PickerStudent>): PickerStudent => ({
  studentId: "s1",
  name: "김서연",
  grade: "고2",
  groupName: null,
  classId: "c3",
  className: "3",
  number: 1,
  usesDiagnosis: true,
  usesGoal: true,
  ...over,
});

const STUDENTS = [
  picker({}),
  picker({ studentId: "s2", name: "이서준", number: 2, usesGoal: false }),
  picker({
    studentId: "s3",
    name: "박도윤",
    classId: "c5",
    className: "5",
    number: 1,
  }),
];

const using = {
  diagnosis: "using",
  goal: "using",
  growth: "using",
  performance: "using",
  selfeval: "using",
  inquiry: "using",
} as const;

const coaching = (over: Partial<Coaching> = {}): Coaching => ({
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
    targets: {
      ideal: { university: "가나대", department: "경영학과" },
      min: { university: "다라대", department: "경영학과" },
    },
  },
  verdicts: {
    execution: { level: "caution" },
    learning: { level: "caution" },
    linkage: { level: "caution" },
  },
  signal: "caution",
  signalSubLine: "실행 주의, 학습역량 주의, 연계 주의",
  coachingType: { code: "F1", name: "연결 보강" },
  summary: "6축 중 4축 산출, 평균 69점으로 보완이 필요한 축이 있습니다.",
  axes: [
    {
      key: "execution",
      name: "학습 실행력",
      score: 67,
      status: "scored",
      missingServices: [],
    },
    {
      key: "readiness",
      name: "목표대학 준비도",
      score: 76,
      status: "scored",
      missingServices: [],
    },
    {
      key: "careerLink",
      name: "진로 연결도",
      score: 60,
      status: "scored",
      missingServices: [],
    },
    {
      key: "performance",
      name: "수행평가 완성도",
      score: 73,
      status: "scored",
      missingServices: [],
    },
    {
      key: "inquiry",
      name: "탐구 완성도",
      score: null,
      status: "before_eval",
      missingServices: [],
    },
    {
      key: "selfAssessment",
      name: "자기평가 충실도",
      score: null,
      status: "not_used",
      missingServices: ["자기평가"],
    },
  ],
  highlights: {
    strongest: { name: "목표대학 준비도", score: 76 },
    weakest: { name: "진로 연결도", score: 60 },
  },
  competencies: [
    {
      key: "academic",
      name: "학업역량",
      score: 73,
      basisUsed: 5,
      basisTotal: 5,
      evidence: ["학습진단 학습 실행 역량"],
    },
    {
      key: "career",
      name: "진로역량",
      score: 58,
      basisUsed: 1,
      basisTotal: 5,
      evidence: [],
    },
    {
      key: "inquiry",
      name: "탐구역량",
      score: null,
      basisUsed: 0,
      basisTotal: 4,
      evidence: [],
    },
    {
      key: "community",
      name: "공동체역량",
      score: null,
      basisUsed: 0,
      basisTotal: 1,
      evidence: [],
      fallback: "담임 관찰로 보완",
    },
    {
      key: "potential",
      name: "발전가능성",
      score: 68,
      basisUsed: 2,
      basisTotal: 5,
      evidence: [],
    },
  ],
  ...over,
});

function stubPage(
  routesOver: Record<string, ApiHandler> = {},
  me: unknown = homeroomMe,
  students: PickerStudent[] = STUDENTS,
) {
  return stubApi({
    "GET /api/console/me": { body: me },
    "GET /api/console/coaching/students": {
      body: { students, defaultStudentId: students[0]?.studentId ?? null },
    },
    "GET /api/console/coaching?studentId=s1": { body: coaching() },
    ...routesOver,
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

describe("W9 개인종합코칭 기본", () => {
  it("처음 열 학생의 코칭을 보여 주고 주소에 학생을 적는다", async () => {
    stubPage();

    const { router } = renderRoutes(routes, "/teacher/coaching");

    expect(
      await screen.findByRole("heading", { level: 1, name: "개인종합코칭" }),
    ).toBeTruthy();
    expect(
      screen.getByText("6종 서비스 데이터를 한 화면에 모아 상담에 활용합니다"),
    ).toBeTruthy();
    expect(await screen.findByText("2학년 3반 1번")).toBeTruthy();
    expect(screen.getByText("종합 코칭 신호: 주의")).toBeTruthy();
    expect(
      screen.getByText("실행 주의, 학습역량 주의, 연계 주의"),
    ).toBeTruthy();
    expect(screen.getByText("이상 가나대 경영학과")).toBeTruthy();
    expect(screen.getByText("담임 박지훈")).toBeTruthy();
    expect(screen.getByText("유형 F1 연결 보강")).toBeTruthy();
    expect(router.state.location.search).toBe("?studentId=s1");
  });

  it("한줄 진단과 5대 역량과 6축 상태를 보여 준다", async () => {
    stubPage();

    renderRoutes(routes, "/teacher/coaching?studentId=s1");

    expect(await screen.findByText(/6축 중 4축 산출, 평균 69점/)).toBeTruthy();
    const competencies = screen.getByRole("list", {
      name: "대학 평가 5대 역량",
    });
    expect(within(competencies).getByText("학업역량")).toBeTruthy();
    expect(within(competencies).getByText("73점")).toBeTruthy();
    expect(within(competencies).getByText("근거 5/5")).toBeTruthy();
    expect(within(competencies).getByText("담임 관찰로 보완")).toBeTruthy();
    const axes = screen.getByRole("list", { name: "6축 종합 진단" });
    expect(within(axes).getByText("67점")).toBeTruthy();
    expect(within(axes).getByText("평가 전")).toBeTruthy();
    expect(within(axes).getByText("자기평가 미이용")).toBeTruthy();
    expect(screen.getByText("목표대학 준비도 76점")).toBeTruthy();
    expect(screen.getByText("진로 연결도 60점")).toBeTruthy();
  });

  it("학생 칸을 바꾸면 그 학생을 읽고 주소를 바꾼다", async () => {
    const calls = stubPage({
      "GET /api/console/coaching?studentId=s2": {
        body: coaching({
          student: {
            ...coaching().student,
            id: "s2",
            name: "이서준",
            number: 2,
          },
        }),
      },
    });

    const { router } = renderRoutes(routes, "/teacher/coaching?studentId=s1");
    await screen.findByText("2학년 3반 1번");
    fireEvent.change(screen.getByLabelText("이름"), {
      target: { value: "s2" },
    });

    expect(await screen.findByText("2학년 3반 2번")).toBeTruthy();
    expect(router.state.location.search).toBe("?studentId=s2");
    expect(
      calls.some((c) => c.key === "GET /api/console/coaching?studentId=s2"),
    ).toBe(true);
  });

  it("반을 바꾸면 그 반의 첫 학생으로 간다", async () => {
    stubPage({
      "GET /api/console/coaching?studentId=s3": {
        body: coaching({
          student: {
            ...coaching().student,
            id: "s3",
            name: "박도윤",
            className: "5",
          },
        }),
      },
    });

    const { router } = renderRoutes(routes, "/teacher/coaching?studentId=s1");
    await screen.findByText("2학년 3반 1번");
    fireEvent.change(screen.getByLabelText("반"), { target: { value: "c5" } });

    await waitFor(() =>
      expect(router.state.location.search).toBe("?studentId=s3"),
    );
  });
});

describe("W9 일부 서비스만 이용", () => {
  it("쓰지 않는 서비스는 이용 전으로, 목표를 못 읽으면 목표 칩을 숨긴다", async () => {
    stubPage({
      "GET /api/console/coaching?studentId=s1": {
        body: coaching({
          student: {
            ...coaching().student,
            servicesUsed: 2,
            services: {
              ...using,
              diagnosis: "not_joined",
              goal: "not_joined",
              selfeval: "not_joined",
              inquiry: "not_joined",
            },
            targets: null,
          },
        }),
      },
    });

    renderRoutes(routes, "/teacher/coaching?studentId=s1");

    expect(await screen.findByText("학습진단 이용 전")).toBeTruthy();
    expect(screen.getByText("목표관리 이용 전")).toBeTruthy();
    expect(screen.getByText("성장설계")).toBeTruthy();
    expect(screen.queryByText(/이상 가나대/)).toBeNull();
    expect(screen.getByText("이용 서비스 2/6")).toBeTruthy();
  });
});

describe("W9 고를 학생 없음, 불러오는 중, 오류", () => {
  it("고를 학생이 없으면 안내만 보이고 PDF 출력은 막힌다", async () => {
    stubPage({}, homeroomMe, []);

    renderRoutes(routes, "/teacher/coaching");

    expect(
      await screen.findByText(
        "고를 학생이 없어요. 담당 학급이 없거나 학급에 학생이 없어요",
      ),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "PDF 출력" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.queryByText(/종합 코칭 신호/)).toBeNull();
  });

  it("코칭을 불러오는 동안은 골격을 보이고 머리와 필터는 그대로다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        String(input).includes("/api/console/coaching?")
          ? new Promise(() => {})
          : Promise.resolve(
              new Response(
                JSON.stringify(
                  String(input).endsWith("/me")
                    ? homeroomMe
                    : { students: STUDENTS, defaultStudentId: "s1" },
                ),
                { status: 200 },
              ),
            ),
      ),
    );

    renderRoutes(routes, "/teacher/coaching?studentId=s1");

    expect(await screen.findByLabelText("이름")).toBeTruthy();
    expect(screen.getByLabelText("코칭 불러오는 중")).toBeTruthy();
    expect(screen.getByRole("button", { name: "PDF 출력" })).toBeTruthy();
  });

  it("코칭을 읽지 못하면 오류 안내를 보인다", async () => {
    stubPage({
      "GET /api/console/coaching?studentId=s1": { status: 404, body: {} },
    });

    renderRoutes(routes, "/teacher/coaching?studentId=s1");

    expect(
      await screen.findByText("개인종합코칭을 불러오지 못했어요"),
    ).toBeTruthy();
  });
});

describe("W9 기관 관리자", () => {
  it("이름 검색으로 학생 목록을 좁힌다", async () => {
    stubPage({}, adminMe);

    renderRoutes(routes, "/teacher/coaching?studentId=s1");
    await screen.findByText("2학년 3반 1번");
    fireEvent.change(screen.getByLabelText("이름 검색"), {
      target: { value: "서준" },
    });

    const names = within(screen.getByLabelText("이름") as HTMLElement)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(names).toEqual(["이서준"]);
  });

  it("담임에게는 이름 검색이 없다", async () => {
    stubPage();

    renderRoutes(routes, "/teacher/coaching?studentId=s1");
    await screen.findByText("2학년 3반 1번");

    expect(screen.queryByLabelText("이름 검색")).toBeNull();
  });
});
