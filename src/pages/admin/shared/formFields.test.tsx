import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ActionButton,
  Field,
  Select,
  Textarea,
  TextInput,
  Toggle,
} from "./formFields";

describe("Field", () => {
  it("label 텍스트로 안쪽 컨트롤을 찾을 수 있다", () => {
    render(
      <Field label="이름">
        <TextInput value="" onChange={() => {}} />
      </Field>,
    );

    expect(screen.getByLabelText("이름")).toBeInTheDocument();
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
  it("rows 속성을 유지하고 입력값을 onChange로 넘긴다", () => {
    const onChange = vi.fn();
    render(<Textarea value="" onChange={onChange} rows={5} />);
    const textarea = screen.getByRole("textbox");

    expect(textarea).toHaveAttribute("rows", "5");
    // ui/textarea 의 기본 field-sizing-content 는 rows 를 무시한다. jsdom 은 높이를
    // 계산하지 못해 rows 높이를 지키는 유일한 장치인 이 클래스만 남긴다.
    expect(textarea.className).toContain("field-sizing-fixed");

    fireEvent.change(textarea, { target: { value: "내용" } });
    expect(onChange).toHaveBeenCalledWith("내용");
  });
});

describe("Select", () => {
  it("네이티브 combobox로 옵션을 보여주고 고른 값을 문자열로 넘긴다", () => {
    const onChange = vi.fn();
    render(
      <Select value="a" onChange={onChange}>
        <option value="a">가</option>
        <option value="b">나</option>
      </Select>,
    );
    const select = screen.getByRole("combobox");

    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(select).toHaveValue("a");

    fireEvent.change(select, { target: { value: "b" } });
    expect(onChange).toHaveBeenCalledWith("b");
  });
});

describe("Toggle", () => {
  it("네이티브 체크박스이고 클릭하면 checked 값을 넘긴다", () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="공개" />);
    const checkbox = screen.getByRole("checkbox", { name: "공개" });

    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("ActionButton", () => {
  it("기본 type은 button이고 클릭 시 onClick을 부른다", () => {
    const onClick = vi.fn();
    render(<ActionButton onClick={onClick}>저장</ActionButton>);
    const button = screen.getByRole("button", { name: "저장" });

    expect(button).toHaveAttribute("type", "button");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disabled를 넘기면 비활성화된다", () => {
    render(<ActionButton disabled>저장</ActionButton>);

    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
  });
});
