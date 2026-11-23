import "@testing-library/jest-dom/vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";
import Efforts from "./Efforts";

vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => ({ userId: "student-1" }),
}));

const api = vi.hoisted(() => ({
  fetchGoalStudent: vi.fn(),
  fetchGoalPlanTasks: vi.fn(),
  fetchGoalWorkbooks: vi.fn(),
  fetchGoalTimer: vi.fn(),
  addGoalTimerSubject: vi.fn(),
  createGoalWorkbook: vi.fn(),
  deleteGoalWorkbook: vi.fn(),
  shelveGoalWorkbook: vi.fn(),
  updateGoalWorkbook: vi.fn(),
}));
vi.mock("@/lib/goalApi", () => api);

// 2026-11-22T15:30Z = 서울 11/23, 로스앤젤레스 11/22. 브라우저 시간대와 무관하게
// 학생 시간대의 오늘로 연결된 계획 과제를 조회한다.
describe("Efforts: 오늘 연결 과제 조회 범위", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-22T15:30:00Z"));
    queryClient.clear();
    for (const fn of Object.values(api)) fn.mockReset();
    api.fetchGoalWorkbooks.mockResolvedValue({
      kind: "success",
      workbooks: [],
    });
    api.fetchGoalTimer.mockResolvedValue({ kind: "error" });
    api.fetchGoalPlanTasks.mockResolvedValue({ kind: "success", tasks: [] });
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    ["Asia/Seoul", "2026-11-23"],
    ["America/Los_Angeles", "2026-11-22"],
  ])("%s 학생은 %s 하루치를 조회한다", async (timeZone, today) => {
    api.fetchGoalStudent.mockResolvedValue({
      kind: "onboarded",
      student: { timeZone },
    });
    render(
      <MemoryRouter>
        <Efforts />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(api.fetchGoalPlanTasks).toHaveBeenCalledWith({
        from: today,
        to: today,
      }),
    );
  });

  it("학생 응답에 timeZone이 없으면(미온보딩) 오늘을 계산하지 않고 조회하지 않는다", async () => {
    api.fetchGoalStudent.mockResolvedValue({ kind: "not-onboarded" });
    render(
      <MemoryRouter>
        <Efforts />
      </MemoryRouter>,
    );
    await waitFor(() => expect(api.fetchGoalStudent).toHaveBeenCalled());
    await waitFor(() => expect(api.fetchGoalWorkbooks).toHaveBeenCalled());
    expect(api.fetchGoalPlanTasks).not.toHaveBeenCalled();
  });
});
