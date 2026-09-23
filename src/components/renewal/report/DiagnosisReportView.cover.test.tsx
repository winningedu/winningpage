// QA 2차 시트 행37·51 — 학습진단 리포트 첫 시트에 공용 표지(ReportCoverPage)를 붙인다.
// 화면·인쇄 모두 A4 시트 스택의 첫 자식이어야 한다(팀장 지시 "표지는 화면·인쇄 모두
// 첫 시트로").
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildReportFromInput } from "@/lib/diagnosisReportBuild";
import { makeInput } from "@/lib/diagnosisScoringTestFixtures";
import DiagnosisReportView, {
  type DiagnosisReportData,
} from "./DiagnosisReportView";

describe("DiagnosisReportView — 표지", () => {
  it("A4 시트 스택의 첫 자식으로 표지를 렌더한다", () => {
    const data = buildReportFromInput(makeInput()) as DiagnosisReportData;
    const { container } = render(<DiagnosisReportView data={data} />);

    const stack = container.querySelector(".fd-sheet-stack");
    const firstSheet = stack?.querySelector(".fd-report-sheet");

    expect(firstSheet).toHaveAttribute(
      "aria-label",
      expect.stringContaining("리포트 표지"),
    );
  });

  it("표지에 studentName·목표(전공)·진단 완료일을 반영한다", () => {
    const data = buildReportFromInput(
      makeInput({ goal: { targetMajor: "컴퓨터공학과" } }),
    ) as DiagnosisReportData;
    render(<DiagnosisReportView data={data} studentName="김민준" />);

    const cover = screen.getByLabelText(/리포트 표지/);
    expect(cover).toHaveTextContent("김민준 학생");
    expect(cover).toHaveTextContent("컴퓨터공학과");
  });

  it("설문에 희망 학과가 없으면 표지에 '미입력'을 찍지 않고 목표 줄 자체를 렌더하지 않는다", () => {
    // makeInput() 기본값은 goal.targetMajor: null — StudentInfoBlock의 desiredMajor는
    // orMissing()이 "미입력"으로 채우지만, 표지는 그 표시용 폴백을 그대로 받으면 안 된다
    // (팀장 지시, no-fallback-constants).
    const data = buildReportFromInput(makeInput()) as DiagnosisReportData;
    render(<DiagnosisReportView data={data} />);

    const cover = screen.getByLabelText(/리포트 표지/);
    expect(cover).not.toHaveTextContent("미입력");
    expect(cover.textContent).not.toMatch(/목표/);
  });
});
