import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { makeActivity, makeAnalysis, makeDetail } from "./testFixtures";

const {
  stepMock,
  shellMock,
  navigateMock,
  runMock,
  saveMock,
  resolveMock,
  detailMock,
  toastMock,
} = vi.hoisted(() => ({
  stepMock: vi.fn(),
  shellMock: vi.fn(),
  navigateMock: vi.fn(),
  runMock: vi.fn(),
  saveMock: vi.fn(),
  resolveMock: vi.fn(),
  detailMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/components/selfeval/SelfevalShellContext", () => ({
  useSelfevalShell: shellMock,
  useSelfevalScreenStep: stepMock,
}));
vi.mock("@/lib/selfeval/api", () => ({
  analyzeRun: runMock,
  analyzeSave: saveMock,
  analyzeResolveConflict: resolveMock,
  fetchSessionDetail: detailMock,
  fetchEntry: vi.fn(),
}));
vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ userId: "u1" }),
}));
vi.mock("@/context/ToastContext", () => ({ useToast: () => toastMock }));
vi.mock("react-router", async (orig) => ({
  ...(await orig<typeof import("react-router")>()),
  useNavigate: () => navigateMock,
}));

import AnalysisPage from "./AnalysisPage";

const refetchEntry = vi.fn();

function renderPage() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={["/app/selfeval/s/s1/analysis"]}>
        <Routes>
          <Route
            path="/app/selfeval/s/:sessionId/analysis"
            element={<AnalysisPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const conflict = (resolved: string | null = null) => ({
  kind: "numbers" as const,
  a: { activityId: "x", text: "40명" },
  b: { activityId: "y", text: "45명" },
  resolved,
});

beforeEach(() => {
  vi.clearAllMocks();
  refetchEntry.mockResolvedValue(undefined);
  shellMock.mockReturnValue({ refetchEntry });
});

describe("AnalysisPage", () => {
  test("분석이 비어 있으면 진입 즉시 분석을 부르고 로딩 문구를 보인다", async () => {
    detailMock.mockResolvedValue(makeDetail());
    runMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(stepMock).toHaveBeenCalledWith(4);
    await waitFor(() => expect(runMock).toHaveBeenCalledWith("s1"));
    expect(await screen.findByText("11개 항목으로 정리하는 중")).toBeTruthy();
  });

  test("분석이 이미 있으면 다시 부르지 않고 11개 항목 라벨을 그린다", async () => {
    detailMock.mockResolvedValue(
      makeDetail({
        activities: [makeActivity("core", { analysis: makeAnalysis() })],
      }),
    );
    renderPage();
    expect(await screen.findByText("교과 개념")).toBeTruthy();
    expect(screen.getByText("다음 단계")).toBeTruthy();
    expect(runMock).not.toHaveBeenCalled();
    expect(screen.getByText("자료에서 확인된 사실만 씁니다")).toBeTruthy();
  });

  test("학생 입력은 배지, 비운 칸은 안내, 협업은 채점 제외 캡션을 단다", async () => {
    detailMock.mockResolvedValue(
      makeDetail({
        activities: [
          makeActivity("core", {
            analysis: makeAnalysis(
              { limitation: "" },
              { motive: "student", limitation: "empty" },
            ),
          }),
        ],
      }),
    );
    renderPage();
    expect(await screen.findByText("학생 입력")).toBeTruthy();
    expect(screen.getByText("비움. 생성에서 쓰지 않아요")).toBeTruthy();
    expect(screen.getByText("채점에 반영하지 않아요")).toBeTruthy();
  });

  test("직접 입력 활동이면 학생이 채워야 한다는 안내를 보인다", async () => {
    detailMock.mockResolvedValue(
      makeDetail({
        activities: [
          makeActivity("core", {
            analysis: makeAnalysis(),
            analysisSource: "student",
          }),
        ],
      }),
    );
    renderPage();
    expect(
      await screen.findByText(
        "직접 입력한 활동이라 분석 항목을 학생이 채워야 해요",
      ),
    ).toBeTruthy();
  });

  test("칸을 눌러 고치고 벗어나면 바뀐 항목만 저장한다", async () => {
    detailMock.mockResolvedValue(
      makeDetail({
        activities: [makeActivity("core", { analysis: makeAnalysis() })],
      }),
    );
    saveMock.mockResolvedValue({
      kind: "ok",
      data: {
        ok: true,
        analysis: makeAnalysis({ concept: "새 개념" }, { concept: "student" }),
      },
    });
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "교과 개념 고치기" }),
    );
    const box = screen.getByRole("textbox", { name: "교과 개념" });
    fireEvent.change(box, { target: { value: "새 개념" } });
    fireEvent.blur(box);
    await waitFor(() =>
      expect(saveMock).toHaveBeenCalledWith("s1", { concept: "새 개념" }),
    );
    expect(await screen.findByText("새 개념")).toBeTruthy();
  });

  test("값을 안 바꾸고 벗어나면 저장을 부르지 않는다", async () => {
    detailMock.mockResolvedValue(
      makeDetail({
        activities: [makeActivity("core", { analysis: makeAnalysis() })],
      }),
    );
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "교과 개념 고치기" }),
    );
    fireEvent.blur(screen.getByRole("textbox", { name: "교과 개념" }));
    expect(saveMock).not.toHaveBeenCalled();
  });

  test("미해결 충돌이 있으면 작성하기가 막히고 한쪽을 고르면 풀린다", async () => {
    detailMock.mockResolvedValue(
      makeDetail({
        activities: [
          makeActivity("core", {
            analysis: makeAnalysis({}, {}, [conflict()]),
          }),
        ],
      }),
    );
    resolveMock.mockResolvedValue({
      kind: "ok",
      data: { ok: true, analysis: makeAnalysis({}, {}, [conflict("40명")]) },
    });
    renderPage();
    const write = await screen.findByRole("button", {
      name: "이 내용으로 작성하기",
    });
    expect((write as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("확인 필요")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "40명" }));
    await waitFor(() => expect(resolveMock).toHaveBeenCalledWith("s1", 0, "a"));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "이 내용으로 작성하기",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
  });

  test("작성하기는 생성 화면으로 generate=1 을 붙여 보낸다", async () => {
    detailMock.mockResolvedValue(
      makeDetail({
        activities: [makeActivity("core", { analysis: makeAnalysis() })],
      }),
    );
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "이 내용으로 작성하기" }),
    );
    expect(navigateMock).toHaveBeenCalledWith(
      "/app/selfeval/s/s1/result?generate=1",
    );
  });

  test("다시 분석은 확인 모달을 거친 뒤에만 분석을 다시 부른다", async () => {
    detailMock.mockResolvedValue(
      makeDetail({
        activities: [makeActivity("core", { analysis: makeAnalysis() })],
      }),
    );
    runMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "다시 분석" }));
    expect(runMock).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/고친 값이 덮어써져요/)).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "다시 분석하기" }),
    );
    await waitFor(() => expect(runMock).toHaveBeenCalledWith("s1"));
  });

  test("분석을 마친 뒤 이전은 활동을 바꿀 수 없다는 안내만 보인다", async () => {
    detailMock.mockResolvedValue(
      makeDetail({
        activities: [makeActivity("core", { analysis: makeAnalysis() })],
      }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "이전" }));
    expect(
      screen.getByText(
        "활동 선택은 분석 뒤에 바꿀 수 없어요. 바꾸려면 새로 시작해 주세요",
      ),
    ).toBeTruthy();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  test("분석 직전 단계(2)에서는 이전이 활동 선택으로 이동한다", async () => {
    detailMock.mockResolvedValue(makeDetail({ session: { currentStep: 2 } }));
    runMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "이전" }));
    expect(navigateMock).toHaveBeenCalledWith("/app/selfeval/s/s1/activities");
  });

  test("모델 실패는 실패 카드와 다시 시도 버튼을 보인다", async () => {
    detailMock.mockResolvedValue(makeDetail({ session: { currentStep: 2 } }));
    runMock.mockResolvedValue({
      kind: "error",
      status: 502,
      code: "MODEL_UPSTREAM_FAILED",
      message: "모델 오류",
      extra: { attempts: 2 },
    });
    renderPage();
    expect(await screen.findByText("분석하지 못했어요")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "다시 시도(2/10)" }),
    ).toBeTruthy();
  });
});
