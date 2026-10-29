import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { getWeekDates } from "@/lib/goalPlanUtils";
import StudyPlanRail from "./StudyPlanRail";

const createGoalPlanTask = vi.hoisted(() => vi.fn());

vi.mock("@/lib/goalApi", () => ({
  fetchGoalPlanTasks: vi.fn().mockResolvedValue({ kind: "success", tasks: [] }),
  fetchGoalWorkbooks: vi
    .fn()
    .mockResolvedValue({ kind: "success", workbooks: [] }),
  updateGoalPlanTask: vi.fn(),
  createGoalPlanTask,
}));

describe("StudyPlanRail 선택요일반복 펼침", () => {
  beforeEach(() => {
    createGoalPlanTask.mockReset();
    createGoalPlanTask.mockResolvedValue({ kind: "success" });
  });

  test("월 수 금을 고르면 이번 주 그 3일에만 과제를 만든다", async () => {
    render(<StudyPlanRail />);
    fireEvent.click(await screen.findByRole("button", { name: "추가" }));
    fireEvent.click(screen.getByRole("radio", { name: "수학" }));
    fireEvent.change(screen.getByLabelText("할 일", { exact: false }), {
      target: { value: "미적분" },
    });
    fireEvent.change(screen.getByLabelText("일정"), {
      target: { value: "선택요일반복" },
    });
    for (const name of ["월", "수", "금"]) {
      fireEvent.click(screen.getByRole("checkbox", { name }));
    }
    fireEvent.click(screen.getByRole("button", { name: "과제 추가하기" }));

    const week = getWeekDates(0);
    await vi.waitFor(() => {
      expect(
        createGoalPlanTask.mock.calls.map(([arg]) => arg.planDate),
      ).toEqual([week[0], week[2], week[4]]);
    });
  });
});
