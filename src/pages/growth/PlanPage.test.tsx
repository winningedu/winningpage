import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchPlanMock, patchMock, navigateMock } = vi.hoisted(() => ({
  fetchPlanMock: vi.fn(),
  patchMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock("@/lib/growth/api", () => ({
  fetchPlan: fetchPlanMock,
  patchPlanItem: patchMock,
  fetchReports: vi.fn(),
  fetchSurveyBootstrap: vi.fn(),
}));
vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ userId: "u1" }),
}));
vi.mock("@/components/growth/GrowthShellContext", () => ({
  useGrowthScreenStep: vi.fn(),
}));
vi.mock("react-router", async (orig) => ({
  ...(await orig<typeof import("react-router")>()),
  useNavigate: () => navigateMock,
}));

import PlanPage from "./PlanPage";

function item(over: Record<string, unknown> = {}) {
  return {
    id: "i1",
    program: "school",
    title: "학교 과제",
    description: "설명",
    priority: "required",
    axis: null,
    category: null,
    period: "semester",
    periodLabel: "2026년 11월",
    deadline: null,
    dday: null,
    urgent: false,
    deadlineLabel: null,
    done: false,
    doneSource: null,
    doneAt: null,
    carried: false,
    carriedFromReportId: null,
    sortOrder: 0,
    ...over,
  };
}

const handoff = {
  reportId: "r1",
  itemId: "i2",
  program: "self",
  theme: "대주제",
  currentGrade: "고2",
  stage: "꽃",
  subtheme: "소주제",
  condition: { title: "조건", description: null, axis: "D", category: null },
};

function planBody(over: Record<string, unknown> = {}) {
  const items = [
    item(),
    item({ id: "i2", program: "self", title: "자평 과제", axis: "D" }),
    item({
      id: "i3",
      program: "school",
      title: "과목 선택",
      period: "course_selection",
      deadline: "2026-12-05",
      deadlineLabel: "마감 2026.12.05, D-5",
      urgent: true,
    }),
  ];
  return {
    ok: true,
    plan: {
      reportId: "r1",
      issuedAt: "2026-11-14T03:00:00Z",
      track: "고2",
      theme: "대주제",
      stage: "꽃",
      currentGrade: "고2",
      subtheme: "소주제",
      groups: [{ period: "semester", label: "남은 학기", items }],
      progress: { total: 3, done: 0, remaining: 3, percent: 0 },
      nextDeadline: null,
      carried: [],
      avoidRepeats: [{ text: "같은 활동 반복", evidenceIds: [] }],
      metrics: null,
      handoffs: { i2: handoff },
      ...over,
    },
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlanPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchPlanMock.mockReset();
  patchMock.mockReset();
  navigateMock.mockReset();
  sessionStorage.clear();
});
afterEach(cleanup);

describe("PlanPage", () => {
  it("완료한 리포트가 없으면 안내와 시작 버튼을 보인다", async () => {
    fetchPlanMock.mockResolvedValue({
      kind: "error",
      status: 404,
      code: "PLAN_NOT_FOUND",
      message: "x",
    });
    renderPage();
    expect(
      await screen.findByText("완료한 리포트가 없어요"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "시작하기" })).toBeInTheDocument();
  });

  it("진행 문구, 시기 묶음, 피해야 할 반복, metrics null 이면 자료 없음", async () => {
    fetchPlanMock.mockResolvedValue({ kind: "ok", data: planBody() });
    renderPage();
    expect(
      await screen.findByText("제안 활동 3건 중 0건 완료"),
    ).toBeInTheDocument();
    expect(screen.getByText("남은 학기")).toBeInTheDocument();
    expect(screen.getByText("2026년 11월")).toBeInTheDocument();
    expect(screen.getByText("같은 활동 반복")).toBeInTheDocument();
    expect(screen.getByText("자료 없음")).toBeInTheDocument();
    expect(screen.getByText("마감 2026.12.05, D-5")).toBeInTheDocument();
  });

  it("체크하면 즉시 진행률이 바뀌고 서버 응답으로 확정된다", async () => {
    fetchPlanMock.mockResolvedValue({ kind: "ok", data: planBody() });
    let resolve: (v: unknown) => void = () => {};
    patchMock.mockReturnValue(new Promise((r) => (resolve = r)));
    renderPage();
    const box = await screen.findByRole("checkbox", { name: "학교 과제" });
    fireEvent.click(box);
    expect(
      await screen.findByText("제안 활동 3건 중 1건 완료"),
    ).toBeInTheDocument();
    expect(patchMock).toHaveBeenCalledWith({
      action: "check",
      itemId: "i1",
      done: true,
    });
    resolve({
      kind: "ok",
      data: {
        ok: true,
        changed: true,
        item: item({ done: true, doneSource: "manual" }),
        progress: { total: 3, done: 1, remaining: 2, percent: 33 },
        metrics: null,
      },
    });
    expect(await screen.findByText("33%")).toBeInTheDocument();
  });

  it("CONFLICT 면 롤백하고 안내하며 다시 불러온다", async () => {
    fetchPlanMock.mockResolvedValue({ kind: "ok", data: planBody() });
    patchMock.mockResolvedValue({
      kind: "error",
      status: 409,
      code: "CONFLICT",
      message: "x",
    });
    renderPage();
    fireEvent.click(await screen.findByRole("checkbox", { name: "학교 과제" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "다시 불러왔어요",
    );
    await waitFor(() => expect(fetchPlanMock).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText("제안 활동 3건 중 0건 완료"),
    ).toBeInTheDocument();
  });

  it("연동 확정 완료 항목은 체크 해제할 수 없다", async () => {
    fetchPlanMock.mockResolvedValue({
      kind: "ok",
      data: planBody({
        groups: [
          {
            period: "semester",
            label: "남은 학기",
            items: [
              item({
                id: "i2",
                program: "self",
                title: "자평 과제",
                done: true,
                doneSource: "self",
              }),
            ],
          },
        ],
        progress: { total: 1, done: 1, remaining: 0, percent: 100 },
      }),
    });
    renderPage();
    expect(
      await screen.findByRole("checkbox", { name: "자평 과제" }),
    ).toBeDisabled();
    expect(
      screen.getByText("위닝 자기평가서에서 확정, 자동 완료"),
    ).toBeInTheDocument();
  });

  it("연동 버튼은 전달값이 있는 항목에만 있고 이동하면 sessionStorage 에 보관한다", async () => {
    fetchPlanMock.mockResolvedValue({ kind: "ok", data: planBody() });
    renderPage();
    const buttons = await screen.findAllByRole("button", {
      name: "위닝 자기평가서에서 하기",
    });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0] as HTMLElement);
    expect(await screen.findByText("이 값이 전달돼요")).toBeInTheDocument();
    expect(
      screen.getByText(/직접 체크로 완료할 수도 있어요/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이동하기" }));
    expect(
      JSON.parse(sessionStorage.getItem("growth:handoff") ?? "null"),
    ).toMatchObject({
      itemId: "i2",
    });
    expect(navigateMock).toHaveBeenCalledWith("/services/self-assessment");
  });

  it("전달값이 없는 self 항목은 수동 체크 안내만 보인다", async () => {
    fetchPlanMock.mockResolvedValue({
      kind: "ok",
      data: planBody({ handoffs: {} }),
    });
    renderPage();
    await screen.findByText("자평 과제");
    expect(screen.queryByRole("button", { name: /에서 하기/ })).toBeNull();
    expect(
      screen.getByText(
        "진행: 직접 체크. 위닝 프로그램을 쓰지 않아도 하면 체크해요.",
      ),
    ).toBeInTheDocument();
  });

  it("이월 과제가 있으면 접힌 상단 카드를 보이고 펼치면 항목이 나온다", async () => {
    const c = item({
      id: "c1",
      title: "이월 과제",
      carried: true,
      carriedFromReportId: "r0",
    });
    fetchPlanMock.mockResolvedValue({
      kind: "ok",
      data: planBody({
        groups: [{ period: "semester", label: "남은 학기", items: [c] }],
        carried: [c],
        progress: { total: 1, done: 0, remaining: 1, percent: 0 },
      }),
    });
    renderPage();
    const toggle = await screen.findByRole("button", {
      name: /이전 회차에서 이어진 과제 1건/,
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByText("이월")).toHaveLength(1);
    fireEvent.click(toggle);
    expect(screen.getAllByText("이월")).toHaveLength(2);
  });

  it("과목 선택 시기 항목에만 마감일 입력이 있다", async () => {
    fetchPlanMock.mockResolvedValue({ kind: "ok", data: planBody() });
    renderPage();
    await screen.findByText("과목 선택");
    expect(screen.getAllByLabelText(/마감일$/)).toHaveLength(1);
  });
});
