// QA 2차 시트 행72 — report-print.css의 `@page { margin: 0 }`는 클래스로 스코프가 안 되고
// Vite 전역 번들에 실려, 학습진단 리포트를 한 번이라도 방문하면 이후 다른 화면(성장 리포트·
// 수행평가 리포트)을 인쇄해도 여백이 0으로 새는 원인이었다. DiagnosisReportView가 마운트된
// 동안에만 문서에 @page 규칙이 존재하도록 옮겼는지 검증한다.
import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildReportFromInput } from "@/lib/diagnosisReportBuild";
import { makeInput } from "@/lib/diagnosisScoringTestFixtures";
import DiagnosisReportView, {
  type DiagnosisReportData,
} from "./DiagnosisReportView";

function hasZeroMarginPageRule() {
  return Array.from(document.querySelectorAll("style")).some((style) =>
    /@page[\s\S]*?margin:\s*0/.test(style.textContent ?? ""),
  );
}

describe("DiagnosisReportView — @page margin:0 마운트 스코프", () => {
  it("렌더 중에는 문서에 @page margin:0 규칙이 존재한다", () => {
    const data = buildReportFromInput(makeInput()) as DiagnosisReportData;
    render(<DiagnosisReportView data={data} />);

    expect(hasZeroMarginPageRule()).toBe(true);
  });

  it("언마운트 후에는 @page margin:0 규칙이 사라진다", () => {
    const data = buildReportFromInput(makeInput()) as DiagnosisReportData;
    const { unmount } = render(<DiagnosisReportView data={data} />);

    unmount();

    expect(hasZeroMarginPageRule()).toBe(false);
  });
});
