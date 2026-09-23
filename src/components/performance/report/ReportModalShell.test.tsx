// QA 2차 시트 행72 — 수행평가 리포트 모달의 인쇄 스타일이 공용 REPORT_PRINT_PAGE_BASE_STYLE
// (@page margin 15mm)을 그대로 포함하고, 모달 크롬 전용 규칙(본문 padding 제거 등)이 그
// 뒤에 이어붙는지 확인한다 — 순서가 뒤집히면 padding 제거 규칙이 @page보다 먼저 와
// 향후 다른 규칙이 끼어들 여지를 만든다.
import { describe, expect, it } from "vitest";
import { REPORT_PRINT_PAGE_BASE_STYLE } from "@/lib/report/printPageStyle";
import { PRINT_PAGE_STYLE } from "./ReportModalShell";

describe("ReportModalShell PRINT_PAGE_STYLE", () => {
  it("공용 베이스 스타일(@page 15mm)을 포함한다", () => {
    expect(PRINT_PAGE_STYLE).toContain(REPORT_PRINT_PAGE_BASE_STYLE);
  });

  it("공용 베이스 스타일이 모달 크롬 전용 규칙보다 앞에 온다", () => {
    const baseIndex = PRINT_PAGE_STYLE.indexOf(REPORT_PRINT_PAGE_BASE_STYLE);
    const chromeIndex = PRINT_PAGE_STYLE.indexOf(".performance-report-head");

    expect(baseIndex).toBeGreaterThanOrEqual(0);
    expect(chromeIndex).toBeGreaterThan(baseIndex);
  });
});
