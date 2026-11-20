import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Field, Textarea, TextInput } from "./formFields";

describe("Field", () => {
  it("label 텍스트로 안쪽 컨트롤을 찾을 수 있고 라벨은 font-medium이다", () => {
    render(
      <Field label="이름">
        <TextInput value="" onChange={() => {}} />
      </Field>,
    );

    expect(screen.getByLabelText("이름")).toBeInTheDocument();
    expect(screen.getByText("이름").className).toContain("font-medium");
    expect(screen.getByText("이름").className).not.toMatch(/font-(bold|black)/);
  });
});

describe("TextInput", () => {
  it("입력하면 onChange가 문자열을 받는다", () => {
    const onChange = vi.fn();
    render(<TextInput value={null} onChange={onChange} aria-label="제목" />);

    fireEvent.change(screen.getByRole("textbox", { name: "제목" }), {
      target: { value: "abc" },
    });

    expect(onChange).toHaveBeenCalledWith("abc");
  });
});

describe("Textarea", () => {
  it("rows 속성을 유지하고 field-sizing-fixed로 높이를 rows에 맡긴다", () => {
    const onChange = vi.fn();
    render(<Textarea value="" onChange={onChange} rows={5} />);
    const textarea = screen.getByRole("textbox");

    expect(textarea).toHaveAttribute("rows", "5");
    expect(textarea.className).toContain("field-sizing-fixed");
    expect(textarea.className).not.toContain("field-sizing-content");

    fireEvent.change(textarea, { target: { value: "내용" } });
    expect(onChange).toHaveBeenCalledWith("내용");
  });
});
