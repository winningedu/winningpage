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
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const gateState = vi.hoisted(() => ({ on: false, resume: false }));
const authState = vi.hoisted(() => ({ userId: "u1" as string | null }));
const accessMock = vi.hoisted(() => vi.fn());
const consumeMock = vi.hoisted(() => vi.fn());
const submitMock = vi.hoisted(() => vi.fn());
const resolveMock = vi.hoisted(() => vi.fn());

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
vi.mock("@/lib/diagnosisSubmitApi", () => ({
  submitDiagnosisV3: submitMock,
  resolveAdmissionTarget: resolveMock,
}));
vi.mock("@/lib/diagnosisSurveyCopyOverrides", () => ({
  fetchSurveyCopyOverrides: async () => new Map(),
}));
vi.mock("@/hooks/useAdmissionCascade", () => ({
  useAdmissionCascade: () => ({ levels: [], awaitCuts: async () => ({}) }),
}));
vi.mock("@/lib/programEntry", () => ({ markProgramEntry: () => undefined }));

import type { LikertBlock } from "@/lib/diagnosis-v3";
import { CALC_EXAMPLE } from "@/lib/diagnosis-v3/testFixtures";
import SurveyStepShell from "./SurveyStepShell";

const likertMap = (block: LikertBlock) => ({
  ...Object.fromEntries(block.items.map((value, i) => [String(i + 1), value])),
  V: block.verify,
});

/** Screen answers that submit as CALC_EXAMPLE (diagnosed 2026-11-09). */
const CALC_DRAFT: Record<string, unknown> = {
  ...CALC_EXAMPLE,
  q6: "1.4",
  q9: likertMap(CALC_EXAMPLE.q9),
  q20: likertMap(CALC_EXAMPLE.q20),
  q11: likertMap(CALC_EXAMPLE.q11),
  q23: likertMap(CALC_EXAMPLE.q23),
  q15: {
    university: "연세대",
    department: "경영학과",
    admissionType: "교과",
    detailType: "추천형",
  },
};

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
  const ctx = useOutletContext<{
    submitDiagnosis: () => Promise<unknown>;
    setAnswer: (id: string, v: unknown) => void;
  }>();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          for (const [id, value] of Object.entries(CALC_DRAFT)) {
            ctx.setAnswer(id, value);
          }
        }}
      >
        모두 답하기
      </button>
      <button
        type="button"
        onClick={async () => onResult(await ctx.submitDiagnosis())}
      >
        제출
      </button>
    </>
  );
}

// Report route stand-in: shows the navigation state and a Back button (history -1).
function ReportStub() {
  const navigate = useNavigate();
  const { state } = useLocation();
  return (
    <>
      <p>리포트 페이지</p>
      <p>{state?.fromSubmit ? "방금 제출함" : "저장 링크"}</p>
      <button type="button" onClick={() => navigate(-1)}>
        뒤로
      </button>
    </>
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
        <Route
          path="/learning-diagnosis/report/:attemptId"
          element={<ReportStub />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

async function answerAllAndSubmit() {
  fireEvent.click(await screen.findByRole("button", { name: "모두 답하기" }));
  fireEvent.click(screen.getByRole("button", { name: "제출" }));
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
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T03:00:00Z"));
  submitMock.mockReset();
  resolveMock.mockReset();
  resolveMock.mockResolvedValue({ ok: true, target: CALC_EXAMPLE.q15 });
  localStorage.clear();
  gateState.resume = false;
  authState.userId = "u1";
  accessMock.mockReset();
  consumeMock.mockReset();
  vi.spyOn(window, "alert").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
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
      await screen.findByText("기관에서 제공하지 않는 서비스예요."),
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
      screen.queryByText("기관에서 제공하지 않는 서비스예요."),
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
    await answerAllAndSubmit();
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(null));
    expect(window.alert).toHaveBeenCalled();
    expect(submitMock).not.toHaveBeenCalled();
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
    await answerAllAndSubmit();
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(null));
    expect(window.alert).toHaveBeenCalledWith(
      "이미 사용된 요청입니다. 다시 시도해 주세요.",
    );
    expect(
      screen.queryByText("기관에서 제공하지 않는 서비스예요."),
    ).not.toBeInTheDocument();
  });
});

/** Screen 1 answered: 고1, 일반고, 목표 없음 (q3r hidden). */
function step1Answers() {
  return { q1: 3, q2: 1, q3: 6 };
}

function DraftChild() {
  const ctx = useOutletContext<{
    answers: Record<string, unknown>;
    setAnswer: (id: string, v: unknown) => void;
  }>();
  return (
    <>
      <button type="button" onClick={() => ctx.setAnswer("q1", 1)}>
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
      ).toEqual({ q1: 1, q4: 3 }),
    );
  });

  it("다시 들어오면 답한 문항을 채운다", async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        v: 2,
        savedAt: Date.now(),
        answers: { q1: 6 },
        seed: "s",
      }),
    );
    renderDraft();
    await waitFor(() =>
      expect(screen.getByTestId("answers")).toHaveTextContent('"q1":6'),
    );
  });

  it("예전 형식(v1) 초안은 채우지 않는다", async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ v: 1, savedAt: Date.now(), answers: { q1: "N수생" } }),
    );
    renderDraft();
    await screen.findByRole("button", { name: "q1 답하기" });
    expect(screen.getByTestId("answers")).toHaveTextContent("{}");
  });

  it("다른 사용자의 초안은 채우지 않는다", async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        v: 2,
        savedAt: Date.now(),
        answers: { q1: 6 },
        seed: "s",
      }),
    );
    authState.userId = "u2";
    renderDraft();
    await screen.findByRole("button", { name: "q1 답하기" });
    expect(screen.getByTestId("answers")).toHaveTextContent("{}");
  });

  it("제출에 성공하면 초안을 지운다", async () => {
    consumeMock.mockResolvedValue({ outcome: "allowed" });
    submitMock.mockResolvedValue({ ok: true, schemaVersion: "v", payload: {} });
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        v: 2,
        savedAt: Date.now(),
        answers: { q1: 6 },
        seed: "s",
      }),
    );
    const onResult = vi.fn();
    renderSubmit(onResult);
    await answerAllAndSubmit();
    await waitFor(() => expect(onResult).toHaveBeenCalled());
    expect(onResult).not.toHaveBeenCalledWith(null);
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("제출이 거부되면 초안을 남긴다", async () => {
    consumeMock.mockResolvedValue({ outcome: "check-failed" });
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        v: 2,
        savedAt: Date.now(),
        answers: { q1: 6 },
        seed: "s",
      }),
    );
    const onResult = vi.fn();
    renderSubmit(onResult);
    await answerAllAndSubmit();
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
    expect(screen.getByTestId("answers")).toHaveTextContent('"q1":1');
  });

  it("위닝은 저장소에 아무것도 쓰지 않는다", async () => {
    gateState.resume = false;
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    renderDraft();
    fireEvent.click(await screen.findByRole("button", { name: "q1 답하기" }));
    await waitFor(() =>
      expect(screen.getByTestId("answers")).toHaveTextContent('"q1":1'),
    );
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("1단계로 들어오면 첫 미완료 단계로 옮긴다", async () => {
    const step1 = step1Answers();
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ v: 2, savedAt: Date.now(), answers: step1, seed: "s" }),
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
    const step1 = step1Answers();
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ v: 2, savedAt: Date.now(), answers: step1, seed: "s" }),
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

describe("SurveyStepShell v3 제출", () => {
  beforeEach(() => {
    gateState.on = false;
    accessMock.mockResolvedValue({ ...denied(null), allowed: true });
  });

  it("소진 확인 뒤 답안을 서버 채점 API로 보내고 저장된 리포트로 이동한다", async () => {
    const calls: string[] = [];
    consumeMock.mockImplementation(async () => {
      calls.push("consume");
      return { outcome: "allowed" };
    });
    submitMock.mockImplementation(async () => {
      calls.push("submit");
      return { ok: true, schemaVersion: "2026-11-v3", payload: {} };
    });
    renderSubmit(vi.fn());
    await answerAllAndSubmit();
    expect(await screen.findByText("리포트 페이지")).toBeInTheDocument();
    expect(calls).toEqual(["consume", "submit"]);
    const attemptId = consumeMock.mock.calls[0]?.[0];
    expect(submitMock).toHaveBeenCalledWith({
      attemptId,
      answers: CALC_EXAMPLE,
    });
  });

  it("제출 뒤 리포트로는 히스토리를 교체해 이동하고, 뒤로가기가 설문 화면으로 돌아가지 않는다", async () => {
    consumeMock.mockResolvedValue({ outcome: "allowed" });
    submitMock.mockResolvedValue({
      ok: true,
      schemaVersion: "2026-11-v3",
      payload: {},
    });
    renderSubmit(vi.fn());
    await answerAllAndSubmit();
    expect(await screen.findByText("리포트 페이지")).toBeInTheDocument();
    expect(screen.getByText("방금 제출함")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
    expect(screen.getByText("리포트 페이지")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "제출" })).toBeNull();
  });

  it("목표 대학 입결 키를 확인하지 못하면 소진하지 않고 다시 시도 안내를 보인다", async () => {
    resolveMock.mockResolvedValue({ ok: false });
    const onResult = vi.fn();
    renderSubmit(onResult);
    await answerAllAndSubmit();
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(null));
    expect(consumeMock).not.toHaveBeenCalled();
    expect(submitMock).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith(
      "목표 대학 입결 정보를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
    );
  });

  it("답안이 검증을 통과하지 못하면 소진하지 않고 보내지 않는다", async () => {
    const onResult = vi.fn();
    renderSubmit(onResult);
    fireEvent.click(await screen.findByRole("button", { name: "제출" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(null));
    expect(consumeMock).not.toHaveBeenCalled();
    expect(submitMock).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalled();
  });

  it("서버 채점이 실패하면 리포트로 이동하지 않고 같은 attemptId로 다시 보낼 수 있다", async () => {
    consumeMock.mockResolvedValue({ outcome: "allowed" });
    submitMock.mockResolvedValueOnce({ ok: false, reason: "network" });
    const onResult = vi.fn();
    renderSubmit(onResult);
    await answerAllAndSubmit();
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(null));
    expect(screen.queryByText("리포트 페이지")).not.toBeInTheDocument();
    submitMock.mockResolvedValueOnce({
      ok: true,
      schemaVersion: "v",
      payload: {},
    });
    fireEvent.click(screen.getByRole("button", { name: "제출" }));
    expect(await screen.findByText("리포트 페이지")).toBeInTheDocument();
    expect(submitMock.mock.calls[1]?.[0].attemptId).toBe(
      submitMock.mock.calls[0]?.[0].attemptId,
    );
  });
});
