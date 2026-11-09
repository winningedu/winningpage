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
    lastSeenAt: null,
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
  text: {
    priorityTask: "경영학과와의 연결이 약합니다.",
    points: [
      "학습 실행력 67점, 원인 학습진단 학습 실행 역량 62점: 월간 계획을 주간, 일간으로 분해",
    ],
    gradeInputCheck: null,
    competencyGap:
      "대입 평가 관점 보완 역량: 탐구역량 56점, 가장 낮은 근거 성장설계 탐구와 자기주도성 판정 37점",
    strengths: ["성장설계 키워드(도시 재생, 탄소 중립)가 정리되어 있음"],
    weaknesses: ["목표시간 달성율 72%, 최소 충족 4/6일: 계획 조정 필요"],
    careerPlan: [
      {
        label: "우선 2주",
        items: [
          "다음 수행평가 주제를 경영학과와 연결",
          "수행평가 '통계로 본 우리 동네'(수학) 피드백 반영 후 재제출",
        ],
      },
      { label: "이번 학기", items: ["연결된 활동을 성장설계 스토리에 반영"] },
      { label: "다음 학기", items: ["진로 연결도 70점 이상"] },
    ],
    studyMethods: ["공부량이 적은 요일에 최소 목표시간 알림 설정"],
    goalOpinion: {
      summary:
        "목표시간 달성율 72%, 지난주보다 8%p 상승, 최소 목표시간 충족 4/6일입니다.",
      details: {
        recordFlow:
          "최소 목표시간 충족 지난주 3일, 이번 주 4/6일, 연속 기록 1일.",
        weekdayPattern:
          "최소 목표시간을 못 지킨 날: 목요일(10/29), 토요일(10/31).",
        distractions: "학생이 기록한 방해 요인: 스마트폰 3회, 컨디션 1회.",
        questions: ["토요일 학습 시작 시각을 미리 정해 두기"],
      },
    },
  },
  serviceCards: [
    {
      service: "diagnosis",
      name: "학습진단",
      state: "using",
      chip: "진단 완료",
      tone: "neutral",
      value: "긴급도 보통",
      detail: "학습 실행 역량 62점",
    },
    {
      service: "goal",
      name: "목표관리",
      state: "using",
      chip: "주의",
      tone: "warning",
      value: "달성율 72%",
      detail: "최소 목표시간 충족 4일 / 목표 설정 6일",
    },
    {
      service: "growth",
      name: "성장설계",
      state: "not_joined",
      chip: "서비스 이용 전",
      tone: "neutral",
      value: "",
      detail: "",
    },
    {
      service: "performance",
      name: "수행평가",
      state: "using",
      chip: "피드백 대기",
      tone: "warning",
      value: "제출 3건",
      detail: "피드백 대기 1건",
    },
    {
      service: "selfeval",
      name: "자기평가",
      state: "using",
      chip: "이용 중",
      tone: "neutral",
      value: "검증 전",
      detail: "",
    },
    {
      service: "inquiry",
      name: "심화탐구",
      state: "using",
      chip: "이용 중",
      tone: "neutral",
      value: "주제 탐색중",
      detail: "",
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

  it("학생 카드에 최근 접속을 한국 날짜 월.일로 보이고 기록이 없으면 보이지 않는다", async () => {
    const withSeen = coaching();
    withSeen.student.lastSeenAt = "2026-11-01T16:00:00Z";
    stubPage({ "GET /api/console/coaching?studentId=s1": { body: withSeen } });
    const first = renderRoutes(routes, "/teacher/coaching");
    expect(await screen.findByText("최근 접속 11.02")).toBeTruthy();
    first.unmount();

    stubPage();
    renderRoutes(routes, "/teacher/coaching");
    await screen.findByText("2학년 3반 1번");
    expect(screen.queryByText(/최근 접속/)).toBeNull();
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

  it("학생을 바꾸면 쓰던 메모 입력은 이어지지 않는다", async () => {
    stubPage({
      "GET /api/console/memos?studentId=s1": { body: { memos: [] } },
      "GET /api/console/memos?studentId=s2": { body: { memos: [] } },
      "GET /api/console/coaching?studentId=s2": { body: coaching() },
    });

    renderRoutes(routes, "/teacher/coaching?studentId=s1");
    await screen.findByText("2학년 3반 1번");
    fireEvent.change(screen.getByLabelText("메모"), {
      target: { value: "김서연 상담" },
    });
    fireEvent.change(screen.getByLabelText("이름"), {
      target: { value: "s2" },
    });

    await waitFor(() =>
      expect((screen.getByLabelText("메모") as HTMLTextAreaElement).value).toBe(
        "",
      ),
    );
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

describe("W9 문구 칸", () => {
  it("우선 과제, 상담 포인트, 강점과 보완, 진로계획, 학습방법을 보여 준다", async () => {
    stubPage();

    renderRoutes(routes, "/teacher/coaching?studentId=s1");

    expect(
      await screen.findByText("경영학과와의 연결이 약합니다."),
    ).toBeTruthy();
    expect(screen.getByText(/학습 실행력 67점, 원인 학습진단/)).toBeTruthy();
    expect(
      screen.getByText(/대입 평가 관점 보완 역량: 탐구역량 56점/),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "점수는 서비스 내부 기준이며 대학 평가, 합격 예측이 아닙니다",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/성장설계 키워드\(도시 재생/)).toBeTruthy();
    expect(
      screen.getByText(/목표시간 달성율 72%, 최소 충족 4\/6일/),
    ).toBeTruthy();
    const plan = screen.getByRole("list", { name: "향후 진로계획" });
    expect(within(plan).getByText("우선 2주")).toBeTruthy();
    expect(
      within(plan).getByText(
        "다음 수행평가 주제를 경영학과와 연결, 수행평가 '통계로 본 우리 동네'(수학) 피드백 반영 후 재제출",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("공부량이 적은 요일에 최소 목표시간 알림 설정"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "서비스 이용 데이터로 자동 구성한 상담 참고안이며 교사 판단으로 보완.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("학교생활기록부 기재 문구가 아닙니다"),
    ).toBeTruthy();
  });

  it("서비스별 요약 카드와 목표관리 상담 의견을 보여 주고 이용 전 카드는 상세 버튼이 없다", async () => {
    stubPage();

    renderRoutes(routes, "/teacher/coaching?studentId=s1");

    expect(await screen.findByText("서비스별 요약")).toBeTruthy();
    expect(screen.getByText("달성율 72%")).toBeTruthy();
    expect(screen.getByText("제출 3건")).toBeTruthy();
    expect(screen.getByText("피드백 대기")).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "상세 창 열기" }),
    ).toHaveLength(5);
    expect(screen.getByText("목표관리 상담 의견")).toBeTruthy();
    expect(
      screen.getByText("학생이 기록한 방해 요인: 스마트폰 3회, 컨디션 1회."),
    ).toBeTruthy();
    expect(
      screen.getByText("토요일 학습 시작 시각을 미리 정해 두기"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "목표대학 확률은 합격 가능성 예측이 아니라 상담 참고 지표입니다",
      ),
    ).toBeTruthy();
  });

  it("문구가 비어 있는 칸은 그리지 않는다", async () => {
    stubPage({
      "GET /api/console/coaching?studentId=s1": {
        body: coaching({
          text: {
            ...coaching().text,
            priorityTask: null,
            careerPlan: null,
            goalOpinion: null,
            points: [],
            competencyGap: null,
          },
        }),
      },
    });

    renderRoutes(routes, "/teacher/coaching?studentId=s1");
    await screen.findByText(/6축 중 4축 산출/);

    expect(screen.queryByText("우선 과제")).toBeNull();
    expect(screen.queryByRole("list", { name: "향후 진로계획" })).toBeNull();
    expect(screen.queryByText("목표관리 상담 의견")).toBeNull();
    expect(screen.queryByText("종합 진단 상담 포인트")).toBeNull();
  });
});

describe("W9 교사 메모", () => {
  it("학생 옆에 메모 패널을 두고 그 학생의 메모를 읽는다", async () => {
    stubPage({
      "GET /api/console/memos?studentId=s1": {
        body: {
          memos: [
            {
              id: "m1",
              body: "진로 상담 필요",
              createdAt: "2026-10-28T01:00:00Z",
              authorName: "박지훈",
              canDelete: true,
            },
          ],
        },
      },
    });

    renderRoutes(routes, "/teacher/coaching?studentId=s1");

    expect(await screen.findByText("진로 상담 필요")).toBeTruthy();
    expect(screen.getByLabelText("메모")).toBeTruthy();
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
    expect(screen.getAllByText("성장설계").length).toBeGreaterThan(0);
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
  it("이름 검색은 서버가 실명으로 거른 목록을 이름 칸에 보인다", async () => {
    const calls = stubPage(
      {
        [`GET /api/console/coaching/students?q=${encodeURIComponent("서준")}`]:
          {
            body: {
              students: [STUDENTS[1]],
              defaultStudentId: "s2",
            },
          },
      },
      adminMe,
    );

    renderRoutes(routes, "/teacher/coaching?studentId=s1");
    await screen.findByText("2학년 3반 1번");
    fireEvent.change(screen.getByLabelText("이름 검색"), {
      target: { value: "서준" },
    });
    expect(calls.some((c) => c.key.includes("?q="))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "검색" }));

    await waitFor(() => {
      const names = within(screen.getByLabelText("이름") as HTMLElement)
        .getAllByRole("option")
        .map((o) => o.textContent);
      expect(names).toEqual(["이서준"]);
    });
    expect(
      calls.some((c) => c.key.includes(`?q=${encodeURIComponent("서준")}`)),
    ).toBe(true);
  });

  it("이름 검색은 Enter 로도 보내고 글자마다 보내지 않는다", async () => {
    const calls = stubPage(
      {
        [`GET /api/console/coaching/students?q=${encodeURIComponent("이서준")}`]:
          { body: { students: [STUDENTS[1]], defaultStudentId: "s2" } },
      },
      adminMe,
    );

    renderRoutes(routes, "/teacher/coaching?studentId=s1");
    await screen.findByText("2학년 3반 1번");
    const field = screen.getByLabelText("이름 검색");
    fireEvent.change(field, { target: { value: "이서" } });
    fireEvent.change(field, { target: { value: "이서준" } });
    expect(calls.some((c) => c.key.includes("?q="))).toBe(false);
    fireEvent.keyDown(field, { key: "Enter" });

    await waitFor(() =>
      expect(
        calls.filter((c) => c.key.includes("?q=")).map((c) => c.key),
      ).toEqual([
        `GET /api/console/coaching/students?q=${encodeURIComponent("이서준")}`,
      ]),
    );
  });

  it("담임에게는 이름 검색이 없다", async () => {
    stubPage();

    renderRoutes(routes, "/teacher/coaching?studentId=s1");
    await screen.findByText("2학년 3반 1번");

    expect(screen.queryByLabelText("이름 검색")).toBeNull();
  });
});
