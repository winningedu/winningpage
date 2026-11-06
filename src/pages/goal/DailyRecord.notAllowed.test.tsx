import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DailyRecord from "./DailyRecord";

const siteState = vi.hoisted(() => ({ tenantServiceGate: false }));
vi.mock("@/config/site", () => ({ site: { features: siteState } }));

vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => ({ userId: "student-1" }),
}));

const api = vi.hoisted(() => ({
  fetchGoalTimer: vi.fn(),
  fetchTodayGoalRecord: vi.fn(),
  generateGoalAdvice: vi.fn(),
  submitDailyRecord: vi.fn(),
}));
vi.mock("@/lib/goalApi", () => api);

beforeEach(() => {
  siteState.tenantServiceGate = false;
  for (const fn of Object.values(api)) fn.mockReset();
  api.fetchGoalTimer.mockResolvedValue({ kind: "error" });
  api.fetchTodayGoalRecord.mockResolvedValue({
    kind: "success",
    cooldown: null,
    summary: null,
    tomorrowTargets: { idealHours: 0, minHours: 0 },
    record: {
      studyHours: 2,
      bodyCondition: "normal",
      tasks: ["개념 학습"],
      reasons: [],
      memo: "",
    },
  });
  api.submitDailyRecord.mockResolvedValue({
    kind: "not-allowed",
    tenantReason: "term_cap",
  });
});

async function save() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <DailyRecord />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const button = await screen.findByRole("button", { name: "기록 저장하기" });
  await vi.waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

describe("DailyRecord 이용 거부 문구", () => {
  it("위닝은 기존 문구를 그대로 보인다", async () => {
    await save();
    expect(
      await screen.findByText("이용권이 필요한 서비스입니다."),
    ).toBeInTheDocument();
  });

  it("스쿨멘토는 사유에 맞는 결정 99 문구를 보인다", async () => {
    siteState.tenantServiceGate = true;
    await save();
    expect(
      await screen.findByText(
        "이번 학기 이용 횟수를 모두 썼어요. 선생님께 문의해 주세요.",
      ),
    ).toBeInTheDocument();
  });
});
