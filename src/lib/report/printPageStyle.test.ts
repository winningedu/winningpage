// QA 2차 시트 행72 — react-to-print(iframe 격리)는 이 베이스 문자열을 pageStyle로 받아
// 복사된 문서 스타일시트보다 먼저 iframe head에 심는다. 용지 여백(@page)이 이 상수 밖으로
// 새거나 15mm가 아닌 값으로 바뀌면 성장 리포트·수행평가 리포트 인쇄 여백이 함께 깨진다.
import { describe, expect, it } from "vitest";
import { REPORT_PRINT_PAGE_BASE_STYLE } from "./printPageStyle";

describe("REPORT_PRINT_PAGE_BASE_STYLE", () => {
  it("@page 여백을 15mm로 선언한다", () => {
    expect(REPORT_PRINT_PAGE_BASE_STYLE).toMatch(
      /@page\s*\{\s*margin:\s*15mm;?\s*\}/,
    );
  });

  it("@page 선언이 문자열 맨 앞이다(호출부가 이어붙이는 규칙보다 항상 먼저 삽입되게)", () => {
    expect(REPORT_PRINT_PAGE_BASE_STYLE.trimStart().startsWith("@page")).toBe(
      true,
    );
  });
});
