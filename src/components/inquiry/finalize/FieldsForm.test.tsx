import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import FieldsForm from "./FieldsForm";
import type { FormState } from "./finalizeLogic";

afterEach(cleanup);

const FORM: FormState = {
  topic: "주제",
  concept: "개념",
  method: "방법",
  result: "결과",
  limitation: "한계",
  numbers: "3.2%\n7건",
  sources: "기상청",
};

describe("FieldsForm", () => {
  test("7항목이 라벨 달린 입력으로 보이고 값이 채워져 있다", () => {
    render(<FieldsForm value={FORM} onChange={vi.fn()} />);
    for (const name of [
      "주제",
      "사용 개념",
      "방법",
      "결과",
      "한계",
      "수치",
      "자료명",
    ]) {
      expect(screen.getByRole("textbox", { name })).toBeVisible();
    }
    expect(screen.getByRole("textbox", { name: "수치" })).toHaveValue(
      "3.2%\n7건",
    );
  });

  test("각 입력에 어디서 뽑았는지 안내가 붙는다", () => {
    render(<FieldsForm value={FORM} onChange={vi.fn()} />);
    expect(screen.getByText("Ⅲ절 첫 문단에서 뽑았어요")).toBeVisible();
    expect(screen.getByText("Ⅵ절 첫 항목에서 뽑았어요")).toBeVisible();
  });

  test("빈 필수 항목은 안내 문구와 invalid 표시를 받는다", () => {
    render(
      <FieldsForm value={{ ...FORM, limitation: "" }} onChange={vi.fn()} />,
    );
    const input = screen.getByRole("textbox", { name: "한계" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText("직접 적어 주세요. 비워 두면 적립할 수 없어요"),
    ).toBeVisible();
    expect(screen.getByRole("textbox", { name: "방법" })).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  test("수치와 자료명이 비어도 invalid 가 아니다", () => {
    render(
      <FieldsForm
        value={{ ...FORM, numbers: "", sources: "" }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("textbox", { name: "수치" })).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  test("입력하면 키와 값을 알린다", () => {
    const onChange = vi.fn();
    render(<FieldsForm value={FORM} onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox", { name: "방법" }), {
      target: { value: "새 방법" },
    });
    expect(onChange).toHaveBeenCalledWith("method", "새 방법");
  });

  test("disabled 이면 입력을 막는다", () => {
    render(<FieldsForm value={FORM} onChange={vi.fn()} disabled />);
    expect(screen.getByRole("textbox", { name: "주제" })).toBeDisabled();
  });
});
