import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Page03Grades from "./Page03Grades";
import { FRONT_PAGES } from "./testPages";

const p3 = FRONT_PAGES.p3;

describe("Page03Grades", () => {
  it("shows metrics, grade bars, the subject verdict table and exam ops", () => {
    render(<Page03Grades page={p3} tocTitle="성적 진단" />);
    expect(screen.getByText(p3.gpa)).toBeInTheDocument();
    expect(screen.getByText(p3.recent)).toBeInTheDocument();
    const school = screen.getByRole("list", { name: "내신 과목별 등급" });
    expect(school).toHaveTextContent("수학1.5");
    const mock = screen.getByRole("list", { name: "최근 모의고사 등급 9월" });
    expect(mock).toHaveTextContent("한국사2");
    const table = screen.getByRole("table");
    const row = within(table).getByText("수학").closest("tr") as HTMLElement;
    expect(within(row).getByText("점검")).toBeInTheDocument();
    expect(
      within(row).getByText("오답 원인을 확인합니다."),
    ).toBeInTheDocument();
    expect(screen.getByText("판정 규칙 안내문")).toBeInTheDocument();
    expect(screen.getByText(p3.examOps.heading)).toBeInTheDocument();
    expect(screen.getByText(p3.examOps.body)).toBeInTheDocument();
    expect(screen.getByText("3 / 16")).toBeInTheDocument();
  });

  it("shows the exam ops evidence line as PDF p4: 8-15 answer and the 10번 pick", () => {
    const { rerender } = render(
      <Page03Grades page={p3} tocTitle="성적 진단" />,
    );
    const line = screen.getByText(/^8-15 /);
    expect(line).toHaveTextContent(
      "8-15 별로 그렇지 않다 \u00b7 10번 시험장에서 답안 표시를 실수해 점수를 잃어요. 선택",
    );
    rerender(
      <Page03Grades
        page={{ ...p3, examOpsEvidence: { item: "8-15", answer: "보통이다" } }}
        tocTitle="성적 진단"
      />,
    );
    expect(screen.getByText(/^8-15 /)).toHaveTextContent(/^8-15 보통이다$/);
  });

  it("shows the exam ops verdict word beside the card title (spec row 76)", () => {
    render(<Page03Grades page={p3} tocTitle="성적 진단" />);
    const title = screen.getByText(p3.examOps.heading);
    expect(title.parentElement).toContainElement(
      screen.getByText(p3.examOpsVerdict as string),
    );
  });

  it("draws no mock grade card when the mock month has no grades", () => {
    const bars = {
      school: p3.bars?.school ?? [],
      mock: { month: 9, grades: [] },
    };
    render(<Page03Grades page={{ ...p3, bars }} tocTitle="성적 진단" />);
    expect(screen.queryByText("최근 모의고사 등급")).toBeNull();
  });

  it("lists 역사 in the grade bars and the verdict table (M3, six subjects)", () => {
    render(
      <Page03Grades
        page={{
          ...p3,
          bars: { school: [{ subject: "HISTORY", grade: 70 }] },
          subjects: {
            kind: "table",
            rows: [{ subject: "HISTORY", verdict: "KEEP", text: "유지 문구" }],
            note: "판정 규칙 안내문",
          },
        }}
        tocTitle="성적 진단"
      />,
    );
    expect(
      screen.getByRole("list", { name: "내신 과목별 등급" }),
    ).toHaveTextContent("역사70");
    expect(
      within(screen.getByRole("table")).getByText("역사"),
    ).toBeInTheDocument();
  });

  it("skip note replaces the table and absent bars draw nothing", () => {
    const { bars: _bars, ...rest } = p3;
    render(
      <Page03Grades
        page={{ ...rest, subjects: { kind: "skip", note: "판정 생략 안내" } }}
        tocTitle="성적 진단"
      />,
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("판정 생략 안내")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
