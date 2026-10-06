import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
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

function row(id: number, text = "") {
  const sections = { ...EMPTY };
  const key = Object.keys(EMPTY)[id] as keyof typeof EMPTY;
  sections[key] = text;
  return buildSectionRows(sections)[id];
}

describe("SectionEditor", () => {
  test("번호 제목 라벨이 textarea 와 연결되고 hint 와 카운터가 보인다", () => {
    const r = row(0, "가".repeat(120));
    if (!r) throw new Error("row");
    render(
      <SectionEditor row={r} value={"가".repeat(120)} onChange={vi.fn()} />,
    );
    expect(screen.getByRole("textbox", { name: /Ⅰ.*탐구 동기/ })).toBeVisible();
    expect(
      screen.getByText("출발 활동, 무엇이 걸렸는가, 왜 지금 이 질문인가"),
    ).toBeVisible();
    expect(screen.getByText("120자 / 권장 300자 이상")).toBeVisible();
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
