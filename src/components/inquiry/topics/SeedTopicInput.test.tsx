import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import SeedTopicInput from "./SeedTopicInput";

describe("SeedTopicInput", () => {
  test("주제 한 줄을 적고 제출하면 trim 한 값으로 onSubmit 이 불린다", () => {
    const onSubmit = vi.fn();
    render(<SeedTopicInput disabled={false} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("직접 주제 한 줄"), {
      target: { value: "  꿀벌의 군집 붕괴  " },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "이 주제로 다시 추천받기" }),
    );
    expect(onSubmit).toHaveBeenCalledWith("꿀벌의 군집 붕괴");
  });

  test("빈 입력이면 제출 버튼이 비활성이다", () => {
    render(<SeedTopicInput disabled={false} onSubmit={vi.fn()} />);
    const btn = screen.getByRole("button", {
      name: "이 주제로 다시 추천받기",
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  test("disabled 면 입력과 버튼이 모두 막힌다", () => {
    render(<SeedTopicInput disabled onSubmit={vi.fn()} />);
    expect(
      (screen.getByLabelText("직접 주제 한 줄") as HTMLInputElement).disabled,
    ).toBe(true);
  });

  test("80자를 넘겨 적을 수 없다", () => {
    render(<SeedTopicInput disabled={false} onSubmit={vi.fn()} />);
    expect(
      screen.getByLabelText("직접 주제 한 줄").getAttribute("maxlength"),
    ).toBe("80");
  });
});
