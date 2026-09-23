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
    expect(html).toContain(
      '<main class="fd-print-area"><p>안녕하세요</p></main>',
    );
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

  it("<base href>를 origin으로, <html> class/lang/data-* 속성을 그대로 복사한다", () => {
    document.documentElement.setAttribute("lang", "ko");
    document.documentElement.setAttribute("class", "dark");
    document.documentElement.setAttribute("data-theme", "winning");

    const root = document.createElement("main");
    const html = buildPrintDocument({ root, title: "리포트" });

    expect(html).toContain(`<base href="${window.location.origin}/">`);
    expect(html).toContain(
      '<html lang="ko" class="dark" data-theme="winning">',
    );
  });

  it("extraCss를 head 맨 끝 <style>로 추가하고, 어떤 경우에도 <script>는 포함하지 않는다", () => {
    const style = document.createElement("style");
    style.textContent = ".a{}";
    document.head.appendChild(style);

    const root = document.createElement("div");
    // 실행 방지를 위해 innerHTML이 아니라 템플릿으로 <script> 노드를 만든다
    // (jsdom은 라이브 문서에 삽입된 <script>를 실행 시도한다).
    const template = document.createElement("template");
    template.innerHTML = "<script>alert(2)</script><p>본문</p>";
    root.appendChild(template.content.cloneNode(true));

    const html = buildPrintDocument({
      root,
      title: "리포트",
      extraCss: "@page { margin: 15mm; }",
    });

    const styleIndex = html.indexOf(".a{}");
    const extraIndex = html.indexOf("@page { margin: 15mm; }");
    expect(styleIndex).toBeGreaterThan(-1);
    expect(extraIndex).toBeGreaterThan(styleIndex);
    expect(html).not.toContain("<script");
  });
});
