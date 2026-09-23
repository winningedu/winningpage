// 서버 PDF 경로(모바일·인앱)가 캡처하는 자립 HTML 문서 빌더 — 클라이언트가 만드는
// 이 문자열이 그대로 api/report-pdf.ts의 puppeteer setContent() 입력이 된다.
import { afterEach, describe, expect, it } from "vitest";
import { buildPrintDocument } from "./buildPrintDocument";

function resetHead() {
  document.head.innerHTML = "";
  document.documentElement.removeAttribute("class");
  document.documentElement.removeAttribute("lang");
  for (const attr of Array.from(document.documentElement.attributes)) {
    if (attr.name.startsWith("data-")) {
      document.documentElement.removeAttribute(attr.name);
    }
  }
}

afterEach(resetHead);

describe("buildPrintDocument", () => {
  it("root의 outerHTML을 <body>에 담고 <title>을 넣은 완전한 HTML 문서를 만든다", () => {
    const root = document.createElement("main");
    root.className = "fd-print-area";
    root.innerHTML = "<p>안녕하세요</p>";

    const html = buildPrintDocument({ root, title: "리포트" });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>리포트</title>");
    expect(html).toContain('<main class="fd-print-area"><p>안녕하세요</p></main>');
  });

  it("현재 문서의 <link rel=stylesheet> href를 절대 URL로, <style> 텍스트를 그대로 head에 모은다", () => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/assets/index.css";
    document.head.appendChild(link);

    const style = document.createElement("style");
    style.textContent = ".x { color: red; }";
    document.head.appendChild(style);

    const root = document.createElement("main");
    const html = buildPrintDocument({ root, title: "리포트" });

    expect(html).toContain(
      `<link rel="stylesheet" href="${window.location.origin}/assets/index.css">`,
    );
    expect(html).toContain("<style>.x { color: red; }</style>");
  });
});
