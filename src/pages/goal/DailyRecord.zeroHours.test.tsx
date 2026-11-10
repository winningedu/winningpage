import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DailyRecord from "./DailyRecord";

const siteState = vi.hoisted(() => ({ goalZeroHourRecord: false }));
vi.mock("@/config/site", () => ({ site: { features: siteState } }));

vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => ({ userId: "student-1" }),
}));

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useNavigate: () => navigate,
}));

const api = vi.hoisted(() => ({
  fetchGoalTimer: vi.fn(),
  fetchTodayGoalRecord: vi.fn(),
  generateGoalAdvice: vi.fn(),
  submitDailyRecord: vi.fn(),
}));
vi.mock("@/lib/goalApi", () => api);

const NO_STUDY_BANNER =
  "순공 시간이 아직 없어요. 대시보드 오늘의 목표 카드 또는 타이머에서 시간을 기록하세요.";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  siteState.goalZeroHourRecord = false;
  navigate.mockReset();
  for (const fn of Object.values(api)) fn.mockReset();
  api.fetchGoalTimer.mockResolvedValue({ kind: "error" });
  api.fetchTodayGoalRecord.mockResolvedValue({
    kind: "success",
    cooldown: null,
    summary: null,
    tomorrowTargets: { idealHours: 0, minHours: 0 },
    record: {
      studyHours: 0,
      bodyCondition: "normal",
      tasks: ["개념 학습"],
      reasons: [],
      memo: "",
    },
  });
  api.generateGoalAdvice.mockResolvedValue(undefined);
  api.submitDailyRecord.mockResolvedValue({
    kind: "success",
    record: {},
    delta: { idealSusi: 0, idealJungsi: 0, minSusi: 0, minJungsi: 0 },
    probs: {},
    recordCount: 1,
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

describe("DailyRecord 0시간 저장", () => {
  it("스쿨멘토는 0시간이어도 저장 요청을 보내고 대시보드로 이동한다", async () => {
    siteState.goalZeroHourRecord = true;
    await save();
    await vi.waitFor(() => expect(api.submitDailyRecord).toHaveBeenCalled());
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/app/goal", expect.anything()),
    );
    expect(screen.queryByText(NO_STUDY_BANNER)).not.toBeInTheDocument();
  });

  it("위닝은 0시간이면 안내 배너만 보이고 요청하지 않는다", async () => {
    await save();
    expect(await screen.findByText(NO_STUDY_BANNER)).toBeInTheDocument();
    expect(api.submitDailyRecord).not.toHaveBeenCalled();
  });
});
