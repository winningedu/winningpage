// QA 2차 시트 행72 — report-print.css의 `@page { margin: 0 }`는 클래스로 스코프가 안 되고
// Vite 전역 번들에 실려, 학습진단 리포트를 한 번이라도 방문하면 이후 다른 화면(성장 리포트·
// 수행평가 리포트)을 인쇄해도 여백이 0으로 새는 원인이었다. DiagnosisReportView가 마운트된
// 동안에만 문서에 @page 규칙이 존재하도록 옮겼는지 검증한다.
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

function hasFontSize3mmRule() {
  return Array.from(document.querySelectorAll("style")).some((style) =>
    /html[\s\S]*?font-size:\s*3mm/.test(style.textContent ?? ""),
  );
}

function hasScopedHeaderFooterHideRule() {
  return Array.from(document.querySelectorAll("style")).some((style) =>
    /#root\s*>\s*header,\s*\n\s*#root\s*>\s*footer/.test(
      style.textContent ?? "",
    ),
  );
}

// report-print.css에 `header,\n  footer {`처럼 스코프 없는(클래스 접두 없는) 태그
// 셀렉터 규칙이 남아 있는지 확인한다 — SiteLayout 밖 중첩 <header>(GoalPageHeader 등)까지
// 잡는 과대 셀렉터가 전역 번들에 재유입되지 않았는지 보는 게 목적이다.
function hasUnscopedHeaderFooterRule(css: string) {
  return /(^|\n)\s*header,\s*\n\s*footer\s*\{/.test(css);
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

  it("report-print.css 파일 텍스트에 @page 규칙이 더 이상 없다(전역 번들 재유입 방지)", () => {
    const css = readFileSync(
      join(process.cwd(), "src/styles/report-print.css"),
      "utf8",
    );

    expect(css.includes("@page")).toBe(false);
  });
});

// QA 행72 후속 — html font-size:3mm(rem 균등 축소 트릭)도 @page와 같은 이유로 전역
// 누수였다. 같은 SPA 세션에서 학습진단 리포트를 연 뒤 성장·수행평가 리포트를 인쇄하면
// rem이 71%로 축소된다. @page와 동일하게 마운트 스코프 <style>로 옮겼는지 검증한다.
describe("DiagnosisReportView — font-size:3mm 마운트 스코프", () => {
  it("렌더 중에는 문서에 font-size:3mm 규칙이 존재한다", () => {
    const data = buildReportFromInput(makeInput()) as DiagnosisReportData;
    render(<DiagnosisReportView data={data} />);

    expect(hasFontSize3mmRule()).toBe(true);
  });

  it("언마운트 후에는 font-size:3mm 규칙이 사라진다", () => {
    const data = buildReportFromInput(makeInput()) as DiagnosisReportData;
    const { unmount } = render(<DiagnosisReportView data={data} />);

    unmount();

    expect(hasFontSize3mmRule()).toBe(false);
  });

  it("report-print.css 파일 텍스트에 font-size: 3mm 규칙이 더 이상 없다(전역 번들 재유입 방지)", () => {
    const css = readFileSync(
      join(process.cwd(), "src/styles/report-print.css"),
      "utf8",
    );

    expect(css.includes("font-size: 3mm")).toBe(false);
  });
});

// QA 행72 후속 — `header, footer { display: none }` 도 태그 셀렉터라 SiteLayout 밖의
// 중첩 <header>(예: 목표관리 GoalPageHeader)까지 인쇄에서 숨겨버리는 과대 규칙이었다.
// #root 직계 자식만 겨냥하도록 좁혀 옮겼는지 검증한다.
describe("DiagnosisReportView — 헤더·푸터 인쇄 숨김 스코프", () => {
  it("렌더 중에는 #root 직계 header·footer만 겨냥한 인쇄 숨김 규칙이 존재한다", () => {
    const data = buildReportFromInput(makeInput()) as DiagnosisReportData;
    render(<DiagnosisReportView data={data} />);

    expect(hasScopedHeaderFooterHideRule()).toBe(true);
  });

  it("언마운트 후에는 그 규칙이 사라진다", () => {
    const data = buildReportFromInput(makeInput()) as DiagnosisReportData;
    const { unmount } = render(<DiagnosisReportView data={data} />);

    unmount();

    expect(hasScopedHeaderFooterHideRule()).toBe(false);
  });

  it("report-print.css 파일에는 스코프 없는 header/footer 태그 셀렉터 규칙이 없다(전역 번들 재유입 방지)", () => {
    const css = readFileSync(
      join(process.cwd(), "src/styles/report-print.css"),
      "utf8",
    );

    expect(hasUnscopedHeaderFooterRule(css)).toBe(false);
  });
});
