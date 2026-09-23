// api/report-pdf.ts 가 쓰는 순수 로직(HTML 크기·baseUrl 허용 목록·<script> 제거·
// 실행 환경 판별). 실제 브라우저 렌더는 scripts/dev/report-pdf-smoke.mts(통합
// 스크립트)로만 검증한다 — vitest는 네트워크/브라우저를 띄우지 않는다.
import { describe, expect, it } from "vitest";
import {
  isHtmlTooLarge,
  MAX_HTML_BYTES,
  stripScriptTags,
} from "./reportPdf.js";

describe("isHtmlTooLarge", () => {
  it("3MB 이하 html은 false다", () => {
    expect(isHtmlTooLarge("a".repeat(100))).toBe(false);
  });

  it(`${MAX_HTML_BYTES}바이트를 초과하면 true다`, () => {
    expect(isHtmlTooLarge("a".repeat(MAX_HTML_BYTES + 1))).toBe(true);
  });
});

describe("stripScriptTags", () => {
  it("<script>...</script> 전체(속성 포함)를 제거한다", () => {
    const html =
      '<html><head><script src="x.js">var a=1;</script></head><body><p>본문</p></body></html>';
    expect(stripScriptTags(html)).toBe(
      "<html><head></head><body><p>본문</p></body></html>",
    );
  });

  it("script가 없으면 그대로 반환한다", () => {
    const html = "<p>스크립트 없음</p>";
    expect(stripScriptTags(html)).toBe(html);
  });
});
