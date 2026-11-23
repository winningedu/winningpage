import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { GenerationSections, Sentence } from "@/lib/selfeval/types";
import ReportText from "./ReportText";

const sentence = (
  id: string,
  text: string,
  over: Partial<Sentence> = {},
): Sentence => ({
  id,
  text,
  evidence: [],
  feeling: false,
  confirmed: false,
  ...over,
});

const SECTIONS: GenerationSections = {
  paragraphs: [
    {
      sentences: [
        sentence("a", "배차표를 비교함.", {
          evidence: [
            { sourceType: "P", refId: "r1", item: "method", weight: "main" },
            { sourceType: "H", refId: "m1", item: "action", weight: "sub" },
          ],
        }),
        sentence("b", "직접 고친 문장임.", {
          evidence: [
            {
              sourceType: "S",
              refId: null,
              item: "student_input",
              weight: "main",
            },
          ],
        }),
      ],
    },
    { sentences: [sentence("c", "근거 없는 문장임.", { feeling: true })] },
  ],
};

describe("ReportText", () => {
  test("문장마다 본문 순서대로 동그라미 번호를 보인다", () => {
    render(
      <ReportText sections={SECTIONS} selectedId={null} onSelect={() => {}} />,
    );
    expect(screen.getByText("\u2460")).toBeTruthy();
    expect(screen.getByText("\u2461")).toBeTruthy();
    expect(screen.getByText("\u2462")).toBeTruthy();
  });

  test("근거 칩에 유형 글자와 항목 이름을 보이고 근거가 없으면 칩이 없다", () => {
    render(
      <ReportText sections={SECTIONS} selectedId={null} onSelect={() => {}} />,
    );
    expect(screen.getByText("P 방법")).toBeTruthy();
    expect(screen.getByText("H 한 일")).toBeTruthy();
    expect(screen.getByText("S 학생 입력")).toBeTruthy();
    expect(screen.getAllByText(/^[PDAHS] /)).toHaveLength(3);
  });

  test("근거가 없는 문장도 눌러서 고를 수 있고 번호와 칩은 버튼 이름에 들어가지 않는다", () => {
    const onSelect = vi.fn();
    render(
      <ReportText sections={SECTIONS} selectedId={null} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "근거 없는 문장임." }));
    expect(onSelect).toHaveBeenCalledWith("c");
  });
});
