import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateGoalAdvice, submitGoalIntake } from "@/lib/goalApi";
import Onboarding from "./Onboarding";

// 로컬 E2E 후속(팀장 지시) — POST /api/goal/intake가 400을 돌려줘도 화면에 아무 안내가
// 안 뜨는 것처럼 보였던 문제 회귀 테스트. 실제로는 handleFinish가 이미 result.detail을
// role="alert" 배너에 담아 렌더하고 있었다(§ 결론: 배너 자체는 정상 동작 — 이 테스트로
// 고정한다). 7단계("다음")에서만 submitGoalIntake가 호출되므로 step-7로 진입해 검증한다.
const gateState = vi.hoisted(() => ({ on: false }));

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
vi.mock("@/lib/goalApi", () => ({
  submitGoalIntake: vi.fn(),
  generateGoalAdvice: vi.fn(),
}));

// OnboardingStepShell이 useAuth()(AuthProvider.tsx)를 읽는다 — 실제 Supabase 세션
// 구독을 붙이면 네트워크 대기가 생겨 이 테스트가 원하는 것(제출 실패 배너)과
// 무관한 불확실성이 생긴다. GoalSidebarContent.test.tsx 등과 달리 이 화면은
// user만 표시용으로 쓰므로 그대로 스텁한다.
vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => ({
    session: null,
    user: null,
    userId: null,
    isReady: true,
    didTimeout: false,
  }),
}));

function renderOnboardingAtStep7() {
  return render(
    <MemoryRouter initialEntries={["/app/goal/onboarding/step-7"]}>
      <Routes>
        <Route path="/app/goal/onboarding/:step" element={<Onboarding />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Onboarding — 제출 실패 안내", () => {
  beforeEach(() => {
    gateState.on = false;
    window.sessionStorage.clear();
    vi.mocked(submitGoalIntake).mockReset();
    vi.mocked(generateGoalAdvice).mockReset();
    vi.mocked(generateGoalAdvice).mockResolvedValue(undefined as never);
  });

  it("400(validation-error) 응답을 받으면 서버 detail 문구를 에러 배너로 보여준다", async () => {
    vi.mocked(submitGoalIntake).mockResolvedValue({
      kind: "validation-error",
      detail: "모의고사 고1 3모 등급은 5과목 모두 1~9 사이여야 합니다.",
    });
    renderOnboardingAtStep7();

    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    // OnboardingCalculatingOverlay도 role="alert"라 findByRole만으로는 계산 중
    // 오버레이와 실패 배너가 뒤섞인다 — 실제 detail 문구로 직접 찾는다.
    const banner = await screen.findByText(
      "모의고사 고1 3모 등급은 5과목 모두 1~9 사이여야 합니다.",
    );
    expect(banner).toBeInTheDocument();
    // 입력을 지우지 않는다 — 여전히 step-7 화면(다음 버튼)에 머물러 재시도할 수 있다.
    expect(screen.getByRole("button", { name: "다음" })).toBeInTheDocument();
  });

  it("422(cuts-missing) 응답은 안내(tone info) 배너로 구분해 보여준다", async () => {
    vi.mocked(submitGoalIntake).mockResolvedValue({
      kind: "cuts-missing",
      missing: ["idealNaesin"],
    });
    renderOnboardingAtStep7();

    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    const banner = await screen.findByText(/아직 준비 중이에요/);
    expect(banner).toBeInTheDocument();
  });

  it("스쿨멘토의 403 은 결제 이동 대신 기관 사유 배너를 보여준다", async () => {
    gateState.on = true;
    vi.mocked(submitGoalIntake).mockResolvedValue({
      kind: "not-allowed",
      tenantReason: "outside_period",
    });
    renderOnboardingAtStep7();

    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    expect(
      await screen.findByText(
        "지금은 소속 기관의 서비스 이용 기간이 아니에요. 선생님께 문의해 주세요.",
      ),
    ).toBeInTheDocument();
  });
});
