import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { makeDesign } from "@/components/inquiry/design/designFixture";

const { shellMock, stepMock, detailMock, saveMock, evaluateMock, applyMock } =
  vi.hoisted(() => ({
    shellMock: vi.fn(),
    stepMock: vi.fn(),
    detailMock: vi.fn(),
    saveMock: vi.fn(),
    evaluateMock: vi.fn(),
    applyMock: vi.fn(),
  }));

vi.mock("@/components/inquiry/InquiryShellContext", () => ({
  useInquiryShell: shellMock,
  useInquiryScreenStep: stepMock,
}));
vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ userId: "u1" }),
}));
vi.mock("@/lib/inquiry/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/inquiry/api")>()),
  fetchSessionDetail: detailMock,
  postSubmission: saveMock,
  evaluateReport: evaluateMock,
}));
vi.mock("@/components/inquiry/topics/topicsLogic", async (orig) => ({
  ...(await orig<typeof import("@/components/inquiry/topics/topicsLogic")>()),
  RUNNING_RETRY_MS: 0,
}));
vi.mock("@/components/goal/GoalPageHeader", () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import WritePage from "./WritePage";

const SESSION = {
  id: "s1",
  status: "in_progress",
  currentStep: 4,
  selectedTopicId: "t1",
  designReportId: "d1",
  latestEvaluationId: null,
  evaluationCount: 0,
};

const long = (n: number) => "가".repeat(n);
const FULL = {
  I: long(100),
  II: long(50),
  III: long(50),
  IV: long(50),
  V: long(50),
  VI: long(30),
  VII: long(30),
  VIII: "자료",
};
const EMPTY = {
  I: "",
  II: "",
  III: "",
  IV: "",
  V: "",
  VI: "",
  VII: "",
  VIII: "",
};

function detail(submissionSections: Record<string, string> | null) {
  return {
    kind: "ok",
    data: {
      ok: true,
      session: SESSION,
      assets: [],
      topics: [],
      topic: { id: "t1" },
      design: makeDesign(),
      submission: submissionSections
        ? {
            id: "sub1",
            revision: 1,
            sections: submissionSections,
            isDraft: true,
          }
        : null,
      evaluation: null,
      finalizePreview: null,
      final: null,
      handoff: null,
    },
  };
}

const saved = (sections: Record<string, string>) => ({
  kind: "ok",
  data: { ok: true, submission: { id: "sub1", sections } },
});
const evaluated = {
  kind: "ok",
  data: {
    ok: true,
    evaluation: { id: "e1" },
    submission: { id: "sub1" },
    // 서버가 생성 뒤 세션 뷰를 함께 내린다(부록 B 3). 화면은 이 값을 그대로 셸에 반영한다.
    session: { currentStep: 5, evaluationCount: 1, latestEvaluationId: "e1" },
    attempts: 1,
  },
};
const err = (
  status: number,
  code: string,
  extra?: Record<string, unknown>,
) => ({
  kind: "error",
  status,
  code,
  message: "m",
  extra,
});

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/inquiry/write"]}>
        <Routes>
          <Route path="/app/inquiry/write" element={<WritePage />} />
          <Route path="/app/inquiry/evaluate" element={<div>평가 화면</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const box = (name: RegExp) => screen.findByRole("textbox", { name });

beforeEach(() => {
  for (const m of [stepMock, detailMock, saveMock, evaluateMock, applyMock]) {
    m.mockReset();
  }
  shellMock.mockReturnValue({
    session: SESSION,
    isBootstrapLoading: false,
    applyBootstrap: applyMock,
    refetchBootstrap: vi.fn(),
  });
  saveMock.mockImplementation(
    async (req: { sections: Record<string, string> }) => saved(req.sections),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("WritePage 표시와 복원", () => {
  test("4단계를 올리고 8절 입력란과 옆 패널을 그린다", async () => {
    detailMock.mockResolvedValue(detail(null));
    setup();
    expect(stepMock).toHaveBeenCalledWith(4);
    expect(await box(/Ⅰ.*탐구 동기/)).toBeVisible();
    expect(screen.getAllByRole("textbox")).toHaveLength(8);
    expect(screen.getByRole("heading", { name: "서론" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "본론" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "결론" })).toBeVisible();
    expect(screen.getByText("가설이 틀려도 돼요")).toBeVisible();
    expect(screen.getByText("60초마다 자동 저장돼요")).toBeVisible();
  });

  test("재진입하면 저장된 작성본으로 복원한다", async () => {
    detailMock.mockResolvedValue(detail({ ...EMPTY, I: "저장해 둔 동기" }));
    setup();
    expect(await box(/Ⅰ/)).toHaveValue("저장해 둔 동기");
  });

  test("상세를 읽는 동안 로딩, 실패하면 오류 문구", async () => {
    detailMock.mockResolvedValue({
      kind: "error",
      status: 500,
      code: "INTERNAL",
      message: "m",
    });
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "작성 화면을 불러오지 못했어요",
    );
  });
});

describe("저장", () => {
  test("중간 저장은 8절을 보내고 마지막 저장 시각을 보여 준다", async () => {
    detailMock.mockResolvedValue(detail(null));
    setup();
    fireEvent.change(await box(/Ⅰ/), { target: { value: "동기" } });
    fireEvent.click(screen.getByRole("button", { name: "중간 저장" }));
    await waitFor(() =>
      expect(saveMock).toHaveBeenCalledWith({
        sessionId: "s1",
        sections: { ...EMPTY, I: "동기" },
      }),
    );
    expect(await screen.findByText(/마지막 저장 \d\d:\d\d/)).toBeVisible();
  });

  test("60초마다 더티일 때만 자동 저장하고 자동 저장됨을 표시한다", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    detailMock.mockResolvedValue(detail(null));
    setup();
    const input = await box(/Ⅰ/);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(saveMock).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "동기" } });
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/자동 저장됨/)).toBeVisible();

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  test("설계 리포트 보기는 서랍을 연다", async () => {
    detailMock.mockResolvedValue(detail(null));
    setup();
    await box(/Ⅰ/);
    fireEvent.click(screen.getByRole("button", { name: "설계 리포트 보기" }));
    expect(
      await screen.findByRole("dialog", { name: "설계 리포트" }),
    ).toBeVisible();
  });
});

describe("제출 전 검사", () => {
  test("빈 절이 있으면 서버를 부르지 않고 안내한다", async () => {
    detailMock.mockResolvedValue(detail({ ...FULL, III: "" }));
    setup();
    await box(/Ⅰ/);
    fireEvent.click(screen.getByRole("button", { name: "제출하고 평가받기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ⅲ절이 비어 있어요",
    );
    expect(saveMock).not.toHaveBeenCalled();
    expect(evaluateMock).not.toHaveBeenCalled();
  });

  test("Ⅰ~Ⅶ 합계 300자 미만이면 카드로 안내하고 평가를 부르지 않는다", async () => {
    detailMock.mockResolvedValue(detail({ ...FULL, I: "짧다" }));
    setup();
    await box(/Ⅰ/);
    fireEvent.click(screen.getByRole("button", { name: "제출하고 평가받기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "이용 횟수는 차감되지 않았어요",
    );
    expect(evaluateMock).not.toHaveBeenCalled();
  });
});

describe("제출하고 평가받기", () => {
  test("저장 뒤 평가를 부르고 성공하면 평가 화면으로 간다", async () => {
    detailMock.mockResolvedValue(detail(FULL));
    evaluateMock.mockResolvedValue(evaluated);
    setup();
    await box(/Ⅰ/);
    fireEvent.click(screen.getByRole("button", { name: "제출하고 평가받기" }));
    expect(await screen.findByText("평가 화면")).toBeVisible();
    expect(saveMock).toHaveBeenCalledWith({ sessionId: "s1", sections: FULL });
    expect(evaluateMock).toHaveBeenCalledWith({ sessionId: "s1" });
    expect(saveMock.mock.invocationCallOrder[0]).toBeLessThan(
      evaluateMock.mock.invocationCallOrder[0] ?? 0,
    );
    expect(applyMock).toHaveBeenCalledWith({
      session: expect.objectContaining({
        latestEvaluationId: "e1",
        evaluationCount: 1,
        currentStep: 5,
      }),
    });
  });

  test("호출 중에는 진행 카드를 보여 준다", async () => {
    detailMock.mockResolvedValue(detail(FULL));
    evaluateMock.mockReturnValue(new Promise(() => {}));
    setup();
    await box(/Ⅰ/);
    fireEvent.click(screen.getByRole("button", { name: "제출하고 평가받기" }));
    expect(
      await screen.findByText("설계 리포트와 작성본을 나란히 놓는 중"),
    ).toBeVisible();
  });

  test("저장이 실패하면 평가를 부르지 않는다", async () => {
    detailMock.mockResolvedValue(detail(FULL));
    saveMock.mockResolvedValue(err(500, "INTERNAL"));
    setup();
    await box(/Ⅰ/);
    fireEvent.click(screen.getByRole("button", { name: "제출하고 평가받기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "저장하지 못했어요",
    );
    expect(evaluateMock).not.toHaveBeenCalled();
  });

  test("자리표시자가 남아도 막지 않고 개수를 알린다", async () => {
    detailMock.mockResolvedValue(
      detail({ ...FULL, III: `${long(50)} [출처] [연도]` }),
    );
    evaluateMock.mockResolvedValue(evaluated);
    setup();
    await box(/Ⅰ/);
    expect(screen.getByRole("note")).toHaveTextContent("Ⅲ절 2곳");
    fireEvent.click(screen.getByRole("button", { name: "제출하고 평가받기" }));
    expect(await screen.findByText("평가 화면")).toBeVisible();
  });

  test("서버가 재평가 상한을 알리면 안내와 평가 화면 링크", async () => {
    detailMock.mockResolvedValue(detail(FULL));
    evaluateMock.mockResolvedValue(err(409, "REEVALUATION_LIMIT"));
    setup();
    await box(/Ⅰ/);
    fireEvent.click(screen.getByRole("button", { name: "제출하고 평가받기" }));
    expect(await screen.findByText("재평가를 모두 썼어요")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "평가 리포트 보기" }),
    ).toHaveAttribute("href", "/app/inquiry/evaluate");
  });

  test("서버 검사 코드(빈 절, 분량 미달)도 카드로 안내한다", async () => {
    detailMock.mockResolvedValue(detail(FULL));
    evaluateMock.mockResolvedValueOnce(err(422, "SUBMISSION_TOO_SHORT"));
    setup();
    await box(/Ⅰ/);
    fireEvent.click(screen.getByRole("button", { name: "제출하고 평가받기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "평가를 실행하지 않았어요",
    );
  });

  test("GENERATION_RUNNING 은 같은 요청을 다시 보낸다", async () => {
    detailMock.mockResolvedValue(detail(FULL));
    evaluateMock
      .mockResolvedValueOnce(err(409, "GENERATION_RUNNING"))
      .mockResolvedValueOnce(evaluated);
    setup();
    await box(/Ⅰ/);
    fireEvent.click(screen.getByRole("button", { name: "제출하고 평가받기" }));
    expect(await screen.findByText("평가 화면")).toBeVisible();
    expect(evaluateMock).toHaveBeenCalledTimes(2);
  });

  test("생성 실패 카드는 시도 횟수와 다시 시도 버튼을 갖는다", async () => {
    detailMock.mockResolvedValue(detail(FULL));
    evaluateMock
      .mockResolvedValueOnce(
        err(422, "GENERATION_VALIDATION_FAILED", { attempts: 3 }),
      )
      .mockResolvedValueOnce(evaluated);
    setup();
    await box(/Ⅰ/);
    fireEvent.click(screen.getByRole("button", { name: "제출하고 평가받기" }));
    expect(
      await screen.findByText("평가 리포트를 만들지 못했어요"),
    ).toBeVisible();
    expect(screen.getByText("시도 3 / 10")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("평가 화면")).toBeVisible();
  });

  test("종결이면 종결 카드와 시작 화면 버튼", async () => {
    detailMock.mockResolvedValue(detail(FULL));
    evaluateMock.mockResolvedValue(
      err(409, "ATTEMPTS_EXHAUSTED", { terminal: true }),
    );
    setup();
    await box(/Ⅰ/);
    fireEvent.click(screen.getByRole("button", { name: "제출하고 평가받기" }));
    expect(await screen.findByText("이 세션은 종결됐어요")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "처음부터 다시 시작" }),
    ).toHaveAttribute("href", "/app/inquiry");
  });

  test("이용권이 없으면 이용권 보기 링크", async () => {
    detailMock.mockResolvedValue(detail(FULL));
    evaluateMock.mockResolvedValue(err(403, "NO_ENTITLEMENT"));
    setup();
    await box(/Ⅰ/);
    fireEvent.click(screen.getByRole("button", { name: "제출하고 평가받기" }));
    expect(
      await screen.findByRole("link", { name: "이용권 보기" }),
    ).toHaveAttribute("href", "/pricing?service=inquiry");
  });
});
