import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { makeDesign } from "../design/designFixture";
import SectionEditor from "./SectionEditor";
import { buildSectionRows } from "./writeLogic";

const EMPTY = {
  I: "",
  II: "",
  III: "",
  IV: "",
  V: "",
  VI: "",
  VII: "",
  VIII: "",
};

function row(id: number, text = "", design = makeDesign()) {
  const sections = { ...EMPTY };
  const key = Object.keys(EMPTY)[id] as keyof typeof EMPTY;
  sections[key] = text;
  return buildSectionRows(sections, design)[id];
}

describe("SectionEditor", () => {
  test("번호 제목 라벨이 textarea 와 연결되고 role, tip, 카운터가 보인다", () => {
    const r = row(0, "가".repeat(120));
    if (!r) throw new Error("row");
    render(
      <SectionEditor row={r} value={"가".repeat(120)} onChange={vi.fn()} />,
    );
    expect(screen.getByRole("textbox", { name: /Ⅰ.*탐구 동기/ })).toBeVisible();
    expect(screen.getByText("I절의 역할")).toBeVisible();
    expect(screen.getByText("I 작성 요령")).toBeVisible();
    expect(
      screen.queryByText("출발 활동, 무엇이 걸렸는가, 왜 지금 이 질문인가"),
    ).toBeNull();
    expect(screen.getByText("120자 / 권장 300자 이상")).toBeVisible();
  });

  test("role 이나 tip 이 빈 문자열이면 그 줄을 그리지 않는다", () => {
    const design = makeDesign();
    design.sections = design.sections.map((s) =>
      s.id === "I" ? { ...s, role: "", tip: "" } : s,
    );
    const r = row(0, "", design);
    if (!r) throw new Error("row");
    const { container } = render(
      <SectionEditor row={r} value="" onChange={vi.fn()} />,
    );
    expect(screen.queryByText("I절의 역할")).toBeNull();
    expect(screen.queryByText("I 작성 요령")).toBeNull();
    expect(
      container.querySelector("textarea")?.hasAttribute("aria-describedby"),
    ).toBe(false);
  });

  test("작성 예시를 입력칸 위 박스로 보여주고 값이 있어도 유지하며 placeholder 로 쓰지 않는다", () => {
    const r = row(0);
    if (!r) throw new Error("row");
    const { rerender } = render(
      <SectionEditor row={r} value="" onChange={vi.fn()} />,
    );
    const box = screen.getByText(r.example, { exact: false });
    const textarea = screen.getByRole("textbox");
    expect(box).toBeVisible();
    expect(screen.getByText("예시")).toBeVisible();
    expect(textarea).toHaveAttribute("placeholder", "입력");
    expect(
      box.compareDocumentPosition(textarea) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    rerender(<SectionEditor row={r} value="작성함" onChange={vi.fn()} />);
    expect(screen.getByText(r.example, { exact: false })).toBeVisible();
  });

  test("과거 저장 예시의 [예시] 접두는 화면에 나오지 않는다", () => {
    const r = row(0);
    if (!r) throw new Error("row");
    const { container } = render(
      <SectionEditor
        row={{ ...r, example: `[예시] ${r.example}` }}
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(container).not.toHaveTextContent("[예시]");
    expect(screen.getByText(r.example, { exact: false })).toBeVisible();
  });

  test("부족하면 부족분을 강조해 알린다", () => {
    const r = row(0, "가".repeat(120));
    if (!r) throw new Error("row");
    render(
      <SectionEditor row={r} value={"가".repeat(120)} onChange={vi.fn()} />,
    );
    expect(screen.getByText("180자 부족")).toBeVisible();
  });

  test("비어 있으면 부족분 문구를 숨긴다", () => {
    const r = row(0);
    if (!r) throw new Error("row");
    render(<SectionEditor row={r} value="" onChange={vi.fn()} />);
    expect(screen.queryByText(/자 부족/)).toBeNull();
  });

  test("Ⅷ절은 분량 제한 없음", () => {
    const r = row(7);
    if (!r) throw new Error("row");
    render(<SectionEditor row={r} value="" onChange={vi.fn()} />);
    expect(screen.getByText("0자 / 분량 제한 없음")).toBeVisible();
  });

  test("입력하면 절 id 와 값으로 onChange", () => {
    const r = row(1);
    if (!r) throw new Error("row");
    const onChange = vi.fn();
    render(<SectionEditor row={r} value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "질문" },
    });
    expect(onChange).toHaveBeenCalledWith("II", "질문");
  });

  test("오류 표시 시 aria-invalid", () => {
    const r = row(2);
    if (!r) throw new Error("row");
    render(<SectionEditor row={r} value="" onChange={vi.fn()} invalid />);
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });
});
