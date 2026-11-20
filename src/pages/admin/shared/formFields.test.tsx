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

describe("Select", () => {
  it("네이티브 combobox로 옵션을 보여주고 고른 값을 문자열로 넘기며 래퍼가 w-full이다", () => {
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
    expect(select.parentElement?.className).toContain("w-full");
    expect(select.parentElement?.className).not.toContain("w-fit");

    fireEvent.change(select, { target: { value: "b" } });
    expect(onChange).toHaveBeenCalledWith("b");
  });
});

describe("Toggle", () => {
  it("네이티브 체크박스이고 클릭하면 checked 값을 넘기며 accent-primary를 쓴다", () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="공개" />);
    const checkbox = screen.getByRole("checkbox", { name: "공개" });

    expect(checkbox).not.toBeChecked();
    expect(checkbox.className).toContain("accent-primary");
    expect(screen.getByText("공개", { selector: "label" }).className).toContain(
      "font-medium",
    );

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
    expect(button.className).toContain("bg-primary");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("danger는 destructive 스타일, light는 outline 스타일로 매핑한다", () => {
    render(
      <>
        <ActionButton variant="danger">삭제</ActionButton>
        <ActionButton variant="light">취소</ActionButton>
      </>,
    );

    expect(screen.getByRole("button", { name: "삭제" }).className).toContain(
      "text-destructive",
    );
    expect(screen.getByRole("button", { name: "취소" }).className).toContain(
      "bg-background",
    );
  });

  it("disabled를 넘기면 비활성화된다", () => {
    render(<ActionButton disabled>저장</ActionButton>);

    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
  });
});

describe("focus 표시", () => {
  it("입력, 텍스트영역, 선택, 버튼 모두 focus-visible ring 클래스를 가진다", () => {
    render(
      <>
        <TextInput value="" onChange={() => {}} aria-label="입력" />
        <Textarea value="" onChange={() => {}} />
        <Select value="" onChange={() => {}}>
          <option value="">선택</option>
        </Select>
        <ActionButton>저장</ActionButton>
      </>,
    );

    for (const element of [
      screen.getByRole("textbox", { name: "입력" }),
      screen.getByRole("textbox", { name: "" }),
      screen.getByRole("combobox"),
      screen.getByRole("button", { name: "저장" }),
    ]) {
      expect(element.className).toContain("focus-visible:ring");
    }
  });
});
