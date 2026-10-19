// QA 2차 시트 행37·51 — 학습진단 리포트 첫 시트에 공용 표지(ReportCoverPage)를 붙인다.
// 화면·인쇄 모두 A4 시트 스택의 첫 자식이어야 한다("표지는 화면·인쇄 모두 첫 시트로"
// 결정).
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
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

  it("표지 정보 줄에 학생명과 진단일을 반영하고 희망 학과는 넣지 않는다", () => {
    const data = buildReportFromInput(
      makeInput({
        goal: { targetMajor: "컴퓨터공학과" },
        meta: {
          schemaVersion: "test",
          diagnosedAt: "2026-10-15T16:00:00.000Z",
        },
      }),
    ) as DiagnosisReportData;
    render(<DiagnosisReportView data={data} studentName="김민준" />);

    const cover = screen.getByLabelText(/리포트 표지/);
    const info = within(cover).getByTestId("cover-info");
    expect(info).toHaveTextContent("학생명김민준");
    expect(info).toHaveTextContent("진단일2026. 10. 16");
    expect(info).not.toHaveTextContent("컴퓨터공학과");
  });

  it("학생 이름이 없으면 표지에 '미입력'을 찍지 않고 학생명 칸을 렌더하지 않는다", () => {
    // 표지는 표시용 폴백("미입력")을 그대로 받으면 안 된다(no-fallback-constants 원칙).
    const data = buildReportFromInput(makeInput()) as DiagnosisReportData;
    render(<DiagnosisReportView data={data} />);

    const cover = screen.getByLabelText(/리포트 표지/);
    expect(cover).not.toHaveTextContent("미입력");
    expect(cover).not.toHaveTextContent("학생명");
  });

  it("표지 정보 줄에 학년을 표기용 문구로 반영한다", () => {
    const data = buildReportFromInput(
      makeInput({
        profile: { name: null, gradeLevel: "H2", schoolType: null },
      }),
    ) as DiagnosisReportData;
    render(<DiagnosisReportView data={data} />);

    const info = within(screen.getByLabelText(/리포트 표지/)).getByTestId(
      "cover-info",
    );
    expect(info).toHaveTextContent("학년고등학교 2학년");
  });

  it("학년이 없으면 표지에 학년 칸을 렌더하지 않는다", () => {
    const data = buildReportFromInput(makeInput()) as DiagnosisReportData;
    render(<DiagnosisReportView data={data} studentName="김민준" />);

    const info = within(screen.getByLabelText(/리포트 표지/)).getByTestId(
      "cover-info",
    );
    expect(info).not.toHaveTextContent("학년");
  });
});
