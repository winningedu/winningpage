import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import AddTaskModal from "./AddTaskModal";

vi.mock("@/lib/goalApi", () => ({
  fetchGoalWorkbooks: vi.fn().mockResolvedValue({
    kind: "success",
    workbooks: [
      {
        id: 7,
        title: "수능특강",
        totalPages: 100,
        subject: "math",
        status: "reading",
      },
    ],
  }),
}));

function renderModal(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(
    <AddTaskModal open onClose={vi.fn()} day="월요일" onSubmit={onSubmit} />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "수학" }));
  fireEvent.change(screen.getByLabelText("할 일", { exact: false }), {
    target: { value: "미적분" },
  });
  return onSubmit;
}

function selectSchedule(value: string) {
  fireEvent.change(screen.getByLabelText("일정"), { target: { value } });
}

describe("AddTaskModal 선택요일반복", () => {
  test("일정 옵션에 선택요일반복이 있다", () => {
    renderModal();
    expect(
      screen.getByRole("option", { name: "선택요일반복" }),
    ).toBeInTheDocument();
  });

  test("선택요일반복을 고르면 요일 칩 7개가 보이고, 다른 일정에서는 안 보인다", () => {
    renderModal();
    expect(screen.queryByRole("checkbox", { name: "월" })).toBeNull();
    selectSchedule("선택요일반복");
    expect(screen.getAllByRole("checkbox")).toHaveLength(7);
  });

  test("요일을 하나도 고르지 않으면 안내 메시지가 보이고 제출 버튼이 비활성화된다", () => {
    renderModal();
    selectSchedule("선택요일반복");
    expect(screen.getByText("요일을 1개 이상 선택해 주세요")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "과제 추가하기" }),
    ).toBeDisabled();
  });

  test("요일을 고르면 제출되고 payload에 weekdays가 실린다", async () => {
    const onSubmit = renderModal();
    selectSchedule("선택요일반복");
    fireEvent.click(screen.getByRole("checkbox", { name: "금" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "월" }));
    fireEvent.click(screen.getByRole("button", { name: "과제 추가하기" }));
    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          schedule: "선택요일반복",
          weekdays: [0, 4],
        }),
      );
    });
  });

  test("문제집을 연결하면 일정이 선택한 날짜에만으로 고정되고 요일 칩이 사라진다", async () => {
    renderModal();
    selectSchedule("선택요일반복");
    await screen.findByRole("option", { name: "수능특강" });
    fireEvent.change(screen.getByLabelText("문제집 연결 (선택)"), {
      target: { value: "7" },
    });
    expect(screen.queryByRole("checkbox", { name: "월" })).toBeNull();
    expect(screen.getByLabelText("일정")).toBeDisabled();
  });
});
