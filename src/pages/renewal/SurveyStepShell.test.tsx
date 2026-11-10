import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useOutletContext,
  useParams,
} from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const gateState = vi.hoisted(() => ({ on: false, resume: false }));
const authState = vi.hoisted(() => ({ userId: "u1" as string | null }));
const accessMock = vi.hoisted(() => vi.fn());
const consumeMock = vi.hoisted(() => vi.fn());

vi.mock("@/config/site", async (orig) => {
  const actual = await orig<typeof import("@/config/site")>();
  return {
    ...actual,
    site: {
      ...actual.site,
      features: {
        ...actual.site.features,
        get tenantServiceGate() {
          return gateState.on;
        },
        get diagnosisResume() {
          return gateState.resume;
        },
      },
    },
  };
});
vi.mock("@/context/AuthProvider", () => ({
  useAuthOptional: () => ({ userId: authState.userId }),
}));
vi.mock("@/lib/diagnosisAccess", () => ({
  checkDiagnosisAccess: accessMock,
  consumeDiagnosisAttempt: consumeMock,
}));
vi.mock("@/lib/diagnosisInputStorage", () => ({
  submitDiagnosisAnswers: () => ({ meta: { diagnosedAt: null } }),
}));
vi.mock("@/lib/diagnosisSurveyCopyOverrides", () => ({
  fetchSurveyCopyOverrides: async () => new Map(),
}));
vi.mock("@/hooks/useAdmissionCascade", () => ({
  useAdmissionCascade: () => ({ levels: [], awaitCuts: async () => ({}) }),
}));
vi.mock("@/lib/programEntry", () => ({ markProgramEntry: () => undefined }));
vi.mock("./diagnosisStudentName", () => ({
  fetchLoggedInStudentName: async () => null,
}));

import { getStepRequiredQuestions } from "@/lib/renewalSurvey";
import SurveyStepShell from "./SurveyStepShell";

const DRAFT_KEY = "diagnosis-draft:u1";

const denied = (tenantReason: string | null) => ({
  allowed: false,
  freeAvailable: null,
  quotaRemaining: null,
  quotaTotal: null,
  planEndsAt: null,
  tenantReason,
  checkFailed: false,
});

function SubmitChild({ onResult }: { onResult: (v: unknown) => void }) {
  const ctx = useOutletContext<{ submitDiagnosis: () => Promise<unknown> }>();
  return (
    <button
      type="button"
      onClick={async () => onResult(await ctx.submitDiagnosis())}
    >
      제출
    </button>
  );
}

function renderSubmit(onResult: (v: unknown) => void) {
  return render(
    <MemoryRouter initialEntries={["/survey"]}>
      <Routes>
        <Route path="/survey" element={<SurveyStepShell />}>
          <Route index element={<SubmitChild onResult={onResult} />} />
        </Route>
        <Route path="/pricing" element={<p>결제 페이지</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={["/survey"]}>
      <Routes>
        <Route path="/survey" element={<SurveyStepShell />}>
          <Route index element={<p>설문 화면</p>} />
        </Route>
        <Route path="/pricing" element={<p>결제 페이지</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  gateState.resume = false;
  authState.userId = "u1";
  accessMock.mockReset();
  consumeMock.mockReset();
  vi.spyOn(window, "alert").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SurveyStepShell 진입 거부", () => {
  it("위닝은 안내 후 결제 페이지로 보낸다", async () => {
    gateState.on = false;
    accessMock.mockResolvedValue(denied(null));
    renderShell();
    expect(await screen.findByText("결제 페이지")).toBeInTheDocument();
  });

  it("스쿨멘토는 이동하지 않고 기관 사유를 보인다", async () => {
    gateState.on = true;
    accessMock.mockResolvedValue(denied("disabled"));
    renderShell();
    expect(
      await screen.findByText("소속 기관에서 제공하지 않는 서비스예요."),
    ).toBeInTheDocument();
    expect(screen.queryByText("결제 페이지")).not.toBeInTheDocument();
    expect(screen.queryByText("설문 화면")).not.toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
  });

  it("스쿨멘토 기타 소속은 소속코드 입력 버튼을 보인다", async () => {
    gateState.on = true;
    accessMock.mockResolvedValue(denied("catch_all"));
    renderShell();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "소속코드 입력" }),
      ).toBeInTheDocument(),
    );
  });
});

describe("SurveyStepShell 스쿨멘토 판정 실패와 충돌", () => {
  it("진입 판정을 못 받으면 제공하지 않는 서비스가 아니라 다시 시도 안내를 보인다", async () => {
    gateState.on = true;
    accessMock.mockResolvedValueOnce({
      ...denied(null),
      checkFailed: true,
    });
    renderShell();
    expect(
      await screen.findByText("이용 가능 여부를 확인하지 못했어요."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("소속 기관에서 제공하지 않는 서비스예요."),
    ).not.toBeInTheDocument();
    accessMock.mockResolvedValue({ ...denied(null), allowed: true });
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("설문 화면")).toBeInTheDocument();
  });

  it("제출 소진 판정을 못 받으면 저장하지 않고 막는다", async () => {
    gateState.on = true;
    accessMock.mockResolvedValue({ ...denied(null), allowed: true });
    consumeMock.mockResolvedValue({ outcome: "check-failed" });
    const onResult = vi.fn();
    renderSubmit(onResult);
    fireEvent.click(await screen.findByRole("button", { name: "제출" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(null));
    expect(window.alert).toHaveBeenCalled();
    expect(screen.queryByText("결제 페이지")).not.toBeInTheDocument();
  });

  it("ATTEMPT_CONFLICT 는 서비스 막힘이 아니라 서버 메시지로 알린다", async () => {
    gateState.on = true;
    accessMock.mockResolvedValue({ ...denied(null), allowed: true });
    consumeMock.mockResolvedValue({
      outcome: "blocked",
      code: "ATTEMPT_CONFLICT",
      message: "이미 사용된 요청입니다. 다시 시도해 주세요.",
      tenantReason: null,
    });
    const onResult = vi.fn();
    renderSubmit(onResult);
    fireEvent.click(await screen.findByRole("button", { name: "제출" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(null));
    expect(window.alert).toHaveBeenCalledWith(
      "이미 사용된 요청입니다. 다시 시도해 주세요.",
    );
    expect(
      screen.queryByText("소속 기관에서 제공하지 않는 서비스예요."),
    ).not.toBeInTheDocument();
  });
});

function DraftChild() {
  const ctx = useOutletContext<{
    answers: Record<string, unknown>;
    setAnswer: (id: string, v: unknown) => void;
  }>();
  return (
    <>
      <button type="button" onClick={() => ctx.setAnswer("q1", "중학생")}>
        q1 답하기
      </button>
      <p data-testid="answers">{JSON.stringify(ctx.answers)}</p>
    </>
  );
}

function renderDraft() {
  return render(
    <MemoryRouter initialEntries={["/survey"]}>
      <Routes>
        <Route path="/survey" element={<SurveyStepShell />}>
          <Route index element={<DraftChild />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("SurveyStepShell 이어 답하기 초안", () => {
  beforeEach(() => {
    gateState.resume = true;
    accessMock.mockResolvedValue({ ...denied(null), allowed: true });
  });

  it("답할 때마다 사용자 id 키로 저장한다", async () => {
    renderDraft();
    fireEvent.click(await screen.findByRole("button", { name: "q1 답하기" }));
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}").answers,
      ).toEqual({ q1: "중학생", q4: expect.any(String) }),
    );
  });

  it("다시 들어오면 답한 문항을 채운다", async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ v: 1, savedAt: Date.now(), answers: { q1: "N수생" } }),
    );
    renderDraft();
    await waitFor(() =>
      expect(screen.getByTestId("answers")).toHaveTextContent('"q1":"N수생"'),
    );
  });

  it("다른 사용자의 초안은 채우지 않는다", async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ v: 1, savedAt: Date.now(), answers: { q1: "N수생" } }),
    );
    authState.userId = "u2";
    renderDraft();
    await screen.findByRole("button", { name: "q1 답하기" });
    expect(screen.getByTestId("answers")).toHaveTextContent("{}");
  });

  it("제출에 성공하면 초안을 지운다", async () => {
    consumeMock.mockResolvedValue({ outcome: "allowed" });
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ v: 1, savedAt: Date.now(), answers: { q1: "N수생" } }),
    );
    const onResult = vi.fn();
    renderSubmit(onResult);
    fireEvent.click(await screen.findByRole("button", { name: "제출" }));
    await waitFor(() => expect(onResult).toHaveBeenCalled());
    expect(onResult.mock.calls[0][0]).not.toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("제출이 거부되면 초안을 남긴다", async () => {
    consumeMock.mockResolvedValue({ outcome: "check-failed" });
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ v: 1, savedAt: Date.now(), answers: { q1: "N수생" } }),
    );
    const onResult = vi.fn();
    renderSubmit(onResult);
    fireEvent.click(await screen.findByRole("button", { name: "제출" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(null));
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
  });

  it("저장소가 던져도 설문은 동작한다", async () => {
    const boom = () => {
      throw new DOMException("denied", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(boom);
    consumeMock.mockResolvedValue({ outcome: "allowed" });
    renderDraft();
    fireEvent.click(await screen.findByRole("button", { name: "q1 답하기" }));
    expect(screen.getByTestId("answers")).toHaveTextContent('"q1":"중학생"');
  });

  it("위닝은 저장소에 아무것도 쓰지 않는다", async () => {
    gateState.resume = false;
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    renderDraft();
    fireEvent.click(await screen.findByRole("button", { name: "q1 답하기" }));
    await waitFor(() =>
      expect(screen.getByTestId("answers")).toHaveTextContent("중학생"),
    );
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("1단계로 들어오면 첫 미완료 단계로 옮긴다", async () => {
    const step1 = Object.fromEntries(
      getStepRequiredQuestions(1).map(
        (q: { id: string; options: string[] }) => [q.id, q.options[0]],
      ),
    );
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ v: 1, savedAt: Date.now(), answers: step1 }),
    );
    function StepChild() {
      return <p data-testid="step">{useParams().step}</p>;
    }
    render(
      <MemoryRouter initialEntries={["/app/learning-diagnosis/survey/1"]}>
        <Routes>
          <Route
            path="/app/learning-diagnosis/survey"
            element={<SurveyStepShell />}
          >
            <Route path=":step" element={<StepChild />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("step")).toHaveTextContent("2"),
    );
  });

  it("인덱스로 들어와도 첫 미완료 단계로 옮긴다", async () => {
    const step1 = Object.fromEntries(
      getStepRequiredQuestions(1).map(
        (q: { id: string; options: string[] }) => [q.id, q.options[0]],
      ),
    );
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ v: 1, savedAt: Date.now(), answers: step1 }),
    );
    function StepChild() {
      return <p data-testid="step">{useParams().step}</p>;
    }
    render(
      <MemoryRouter initialEntries={["/app/learning-diagnosis/survey"]}>
        <Routes>
          <Route
            path="/app/learning-diagnosis/survey"
            element={<SurveyStepShell />}
          >
            <Route
              index
              element={
                <Navigate to="/app/learning-diagnosis/survey/1" replace />
              }
            />
            <Route path=":step" element={<StepChild />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("step")).toHaveTextContent("2"),
    );
  });
});
