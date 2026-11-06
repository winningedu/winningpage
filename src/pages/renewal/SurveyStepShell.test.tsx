import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useOutletContext } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const gateState = vi.hoisted(() => ({ on: false }));
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
      },
    },
  };
});
vi.mock("@/lib/diagnosisAccess", () => ({
  checkDiagnosisAccess: accessMock,
  consumeDiagnosisAttempt: consumeMock,
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

import SurveyStepShell from "./SurveyStepShell";

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
