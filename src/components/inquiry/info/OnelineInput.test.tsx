import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import OnelineInput from "./OnelineInput";

describe("OnelineInput", () => {
  test("추가 버튼을 누르면 trim 한 문장을 넘기고 입력을 비운다", () => {
    const onAdd = vi.fn();
    render(<OnelineInput disabled={false} onAdd={onAdd} />);
    const input = screen.getByLabelText("했던 활동의 주제 한 줄");
    fireEvent.change(input, { target: { value: "  여름철 산책 판단  " } });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    expect(onAdd).toHaveBeenCalledWith("여름철 산책 판단");
    expect(input).toHaveValue("");
  });

  test("엔터로도 추가된다", () => {
    const onAdd = vi.fn();
    render(<OnelineInput disabled={false} onAdd={onAdd} />);
    const input = screen.getByLabelText("했던 활동의 주제 한 줄");
    fireEvent.change(input, { target: { value: "한 줄" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAdd).toHaveBeenCalledWith("한 줄");
  });

  test("빈 값은 추가하지 않고 안내한다", () => {
    const onAdd = vi.fn();
    render(<OnelineInput disabled={false} onAdd={onAdd} />);
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "주제를 한 줄 적어 주세요.",
    );
  });

  test("200자를 넘으면 추가하지 않는다", () => {
    const onAdd = vi.fn();
    render(<OnelineInput disabled={false} onAdd={onAdd} />);
    fireEvent.change(screen.getByLabelText("했던 활동의 주제 한 줄"), {
      target: { value: "가".repeat(201) },
    });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("200자 안으로");
  });

  test("disabled 면 입력과 버튼이 잠긴다", () => {
    render(<OnelineInput disabled onAdd={vi.fn()} />);
    expect(screen.getByRole("button", { name: "추가" })).toBeDisabled();
  });
});
