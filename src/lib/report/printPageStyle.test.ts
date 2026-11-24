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

  // 표지가 @page :first 여백 0 이라 Chrome 이 문서를 210mm 폭으로 배치하는 경우가 있다(flex 열
  // 루트인 자기평가서, 심화탐구 리포트 상세에서 실측). 15mm 여백인 2쪽 이후는 오른쪽 30mm 가 잘린다.
  // 인쇄 루트를 인쇄 가능 폭(210mm - 15mm x 2 = 180mm)으로 묶어 표지만 전면 폭을 갖게 한다.
  it("인쇄 루트(body의 직계)를 인쇄 가능 폭 180mm 로 묶는다", () => {
    expect(REPORT_PRINT_PAGE_BASE_STYLE).toMatch(
      /@media\s+print\s*\{[^@]*body\s*>\s*\*\s*\{[^}]*max-width:\s*180mm/,
    );
  });
});
