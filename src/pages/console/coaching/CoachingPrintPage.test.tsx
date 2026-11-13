// W9c 코칭 PDF. A4 두 쪽, 메모는 넣지 않고(결정 3), 자료를 읽은 뒤 인쇄 창을 한 번 연다.

import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));
vi.mock("../useIdleLogout", () => ({ useIdleLogout: vi.fn() }));

import type { ConsoleMe } from "../api";
import { homeroomMe, proxyMe, renderRoutes, stubApi } from "../testUtils";
import { ConsoleMeContext } from "../useConsoleMe";
import CoachingPrintPage from "./CoachingPrintPage";
import type { Coaching } from "./types";

const DATA = {
  student: {
    id: "s1",
    name: "김서연",
    grade: "고2",
    groupName: null,
    className: "3",
    number: 1,
    homeroomName: "박지훈",
    servicesUsed: 6,
    services: {
      diagnosis: "using",
      goal: "using",
      growth: "using",
      performance: "using",
      selfeval: "using",
      inquiry: "using",
    },
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
  summary: "6축 중 1축만 산출되었습니다.",
  axes: [
    {
      key: "execution",
      name: "학습 실행력",
      score: 67,
      status: "scored",
      missingServices: [],
    },
  ],
  highlights: { strongest: null, weakest: null },
  competencies: [
    {
      key: "academic",
      name: "학업역량",
      score: 73,
      basisUsed: 5,
      basisTotal: 5,
      evidence: [],
    },
  ],
  text: {
    priorityTask: null,
    points: [],
    gradeInputCheck: null,
    competencyGap: null,
    strengths: ["성장설계 키워드가 정리되어 있음"],
    weaknesses: ["연결 부족"],
    careerPlan: null,
    studyMethods: [],
    goalOpinion: null,
  },
  serviceCards: [],
} as unknown as Coaching;

const print = vi.fn();

beforeEach(() => {
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "u" }, access_token: "tok" } },
  });
  vi.stubGlobal("print", print);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const routesFor = (me: ConsoleMe) => [
  {
    path: "/print",
    Component: () => (
      <ConsoleMeContext.Provider value={{ me, reload: async () => {} }}>
        <CoachingPrintPage />
      </ConsoleMeContext.Provider>
    ),
  },
];
const routes = routesFor(homeroomMe);

describe("W9c 코칭 PDF", () => {
  it("A4 두 쪽에 학생과 진단을 담고 메모는 넣지 않으며 인쇄 창을 한 번 연다", async () => {
    const calls = stubApi({
      "GET /api/console/me": { body: homeroomMe },
      "GET /api/console/coaching?studentId=s1": { body: DATA },
      "POST /api/console/coaching/print-log": { body: { ok: true } },
    });

    const { container } = renderRoutes(routes, "/print?studentId=s1");

    expect(await screen.findByText("김서연")).toBeTruthy();
    expect(container.querySelectorAll(".coaching__print")).toHaveLength(1);
    expect(container.querySelectorAll(".coaching__print-p2")).toHaveLength(1);
    expect(screen.getByText("대학 평가 5대 역량")).toBeTruthy();
    expect(screen.getByText("성장설계 키워드가 정리되어 있음")).toBeTruthy();
    expect(screen.queryByText("교사 메모")).toBeNull();
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    expect(
      calls.find((c) => c.key === "POST /api/console/coaching/print-log")?.body,
    ).toEqual({
      studentId: "s1",
    });
  });

  it("첫 쪽 제목 아래에 기관, 학생, 출력일시(한국 시간), 출력자를 한 줄로 적는다", async () => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-11-03T05:20:00Z"),
    });
    stubApi({
      "GET /api/console/me": { body: homeroomMe },
      "GET /api/console/coaching?studentId=s1": { body: DATA },
      "POST /api/console/coaching/print-log": { body: { ok: true } },
    });

    const { container } = renderRoutes(routes, "/print?studentId=s1");

    const line = await screen.findByText(
      "교육기관 한빛고등학교, 학생 김서연(2학년 3반 1번), 출력일시 2026.11.03 14:20, 출력자 박지훈(SM26HB83K7MPQ2)",
    );
    expect(container.querySelector(".coaching__print")?.contains(line)).toBe(
      true,
    );
    expect(
      container.querySelector(".coaching__print-p2")?.textContent,
    ).not.toContain("교육기관");
  });

  it("확률이 있으면 PDF에도 상담 참고 지표 안내를 적고 없으면 적지 않는다", async () => {
    const withTargets = (probability: number | null) =>
      ({
        ...DATA,
        student: {
          ...DATA.student,
          targets: {
            ideal: {
              university: "가나대",
              department: "경영학과",
              probability,
            },
            min: null,
          },
        },
      }) as Coaching;
    const notice =
      "목표대학 확률은 합격 가능성 예측이 아니라 상담 참고 지표입니다";
    stubApi({
      "GET /api/console/me": { body: homeroomMe },
      "GET /api/console/coaching?studentId=s1": { body: withTargets(34) },
      "POST /api/console/coaching/print-log": { body: { ok: true } },
    });

    const first = renderRoutes(routes, "/print?studentId=s1");

    expect(await screen.findByText("이상 가나대 경영학과 34%")).toBeTruthy();
    expect(screen.getByText(notice)).toBeTruthy();
    first.unmount();

    stubApi({
      "GET /api/console/me": { body: homeroomMe },
      "GET /api/console/coaching?studentId=s1": { body: withTargets(null) },
      "POST /api/console/coaching/print-log": { body: { ok: true } },
    });
    renderRoutes(routes, "/print?studentId=s1");

    expect(await screen.findByText("이상 가나대 경영학과")).toBeTruthy();
    expect(screen.queryByText(notice)).toBeNull();
  });

  it("본사 대행이면 출력자는 본사 대행이다", async () => {
    stubApi({
      "GET /api/console/me": { body: proxyMe },
      "GET /api/console/coaching?studentId=s1": { body: DATA },
      "POST /api/console/coaching/print-log": { body: { ok: true } },
    });

    renderRoutes(routesFor(proxyMe), "/print?studentId=s1");

    expect(await screen.findByText(/, 출력자 본사 대행$/)).toBeTruthy();
  });

  it("학년그룹이 있으면 반 앞에 붙이고 번호가 없으면 번호 조각을 뺀다", async () => {
    const data = {
      ...DATA,
      student: { ...DATA.student, groupName: "A레벨", number: null },
    } as Coaching;
    stubApi({
      "GET /api/console/me": { body: homeroomMe },
      "GET /api/console/coaching?studentId=s1": { body: data },
      "POST /api/console/coaching/print-log": { body: { ok: true } },
    });

    renderRoutes(routes, "/print?studentId=s1");

    expect(
      await screen.findByText(/학생 김서연\(2학년 A레벨 3반\), 출력일시/),
    ).toBeTruthy();
  });

  it("학년, 반, 번호가 모두 없으면 빈 괄호 없이 학생 이름만 적는다", async () => {
    const data = {
      ...DATA,
      student: { ...DATA.student, grade: null, className: null, number: null },
    } as unknown as Coaching;
    stubApi({
      "GET /api/console/me": { body: homeroomMe },
      "GET /api/console/coaching?studentId=s1": { body: data },
      "POST /api/console/coaching/print-log": { body: { ok: true } },
    });

    renderRoutes(routes, "/print?studentId=s1");

    expect(await screen.findByText(/학생 김서연, 출력일시/)).toBeTruthy();
  });

  it("인쇄할 때만 위쪽 여백과 바깥 여백을 걷어낸다", async () => {
    stubApi({
      "GET /api/console/me": { body: homeroomMe },
      "GET /api/console/coaching?studentId=s1": { body: DATA },
      "POST /api/console/coaching/print-log": { body: { ok: true } },
    });

    const { container } = renderRoutes(routes, "/print?studentId=s1");

    await screen.findByText("김서연");
    const rule = container.querySelector("style")?.textContent ?? "";
    expect(rule).toMatch(
      /@media print[\s\S]*\.console-frame-body\s*{[^}]*padding-top:\s*0/,
    );
    expect(rule).toMatch(/\.coaching__print-root\s*{[^}]*padding:\s*0/);
    expect(container.querySelector(".coaching__print-root")).not.toBeNull();
  });

  it("인쇄 기록을 남기지 못하면 인쇄 창을 열지 않고 안내한다", async () => {
    stubApi({
      "GET /api/console/me": { body: homeroomMe },
      "GET /api/console/coaching?studentId=s1": { body: DATA },
      "POST /api/console/coaching/print-log": { status: 500, body: {} },
    });

    renderRoutes(routes, "/print?studentId=s1");

    expect(await screen.findByText("인쇄 기록을 남기지 못했어요")).toBeTruthy();
    expect(print).not.toHaveBeenCalled();
  });

  it("자료를 읽지 못하면 인쇄 창을 열지 않는다", async () => {
    stubApi({
      "GET /api/console/me": { body: homeroomMe },
      "GET /api/console/coaching?studentId=s1": { status: 404, body: {} },
    });

    renderRoutes(routes, "/print?studentId=s1");

    expect(
      await screen.findByText(
        "개인종합코칭을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요",
      ),
    ).toBeTruthy();
    expect(print).not.toHaveBeenCalled();
  });
});
