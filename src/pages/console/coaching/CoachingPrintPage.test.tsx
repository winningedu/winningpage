// W9c 코칭 PDF. A4 두 쪽, 메모는 넣지 않고(결정 3), 자료를 읽은 뒤 인쇄 창을 한 번 연다.

import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));
vi.mock("../useIdleLogout", () => ({ useIdleLogout: vi.fn() }));

import { homeroomMe, renderRoutes, stubApi } from "../testUtils";
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
} as unknown as Coaching;

const print = vi.fn();

beforeEach(() => {
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "u" }, access_token: "tok" } },
  });
  vi.stubGlobal("print", print);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const routes = [{ path: "/print", Component: CoachingPrintPage }];

describe("W9c 코칭 PDF", () => {
  it("A4 두 쪽에 학생과 진단을 담고 메모는 넣지 않으며 인쇄 창을 한 번 연다", async () => {
    stubApi({
      "GET /api/console/me": { body: homeroomMe },
      "GET /api/console/coaching?studentId=s1": { body: DATA },
    });

    const { container } = renderRoutes(routes, "/print?studentId=s1");

    expect(await screen.findByText("김서연")).toBeTruthy();
    expect(container.querySelectorAll(".coaching__print")).toHaveLength(1);
    expect(container.querySelectorAll(".coaching__print-p2")).toHaveLength(1);
    expect(screen.getByText("대학 평가 5대 역량")).toBeTruthy();
    expect(screen.queryByText("교사 메모")).toBeNull();
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("자료를 읽지 못하면 인쇄 창을 열지 않는다", async () => {
    stubApi({
      "GET /api/console/me": { body: homeroomMe },
      "GET /api/console/coaching?studentId=s1": { status: 404, body: {} },
    });

    renderRoutes(routes, "/print?studentId=s1");

    expect(
      await screen.findByText("개인종합코칭을 불러오지 못했어요"),
    ).toBeTruthy();
    expect(print).not.toHaveBeenCalled();
  });
});
