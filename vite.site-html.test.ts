import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { transformSiteHtml } from "./vite.siteHtml.mjs";

const REAL_INDEX_HTML = readFileSync(
  path.join(process.cwd(), "index.html"),
  "utf-8",
);

describe("transformSiteHtml — 위닝에듀", () => {
  it("실제 index.html에 적용해도 바이트 단위로 동일하다(winning이 baseline)", () => {
    expect(transformSiteHtml(REAL_INDEX_HTML, "winning")).toBe(
      REAL_INDEX_HTML,
    );
  });
});

describe("transformSiteHtml — 스쿨멘토", () => {
  it("<title>을 스쿨멘토로 바꾼다", () => {
    const html = "<title>위닝에듀</title>";
    const result = transformSiteHtml(html, "schoolmentor");

    expect(result).toContain("<title>스쿨멘토</title>");
  });

  it("실제 index.html에 적용하면 favicon 링크가 /schoolmentor/ 3종으로 바뀌고 svg 링크는 없다", () => {
    const result = transformSiteHtml(REAL_INDEX_HTML, "schoolmentor");

    expect(result).toContain(
      '<link rel="icon" type="image/png" href="/schoolmentor/favicon-96x96.png" sizes="96x96" />',
    );
    expect(result).toContain(
      '<link rel="shortcut icon" href="/schoolmentor/favicon.ico" />',
    );
    expect(result).toContain(
      '<link rel="apple-touch-icon" sizes="180x180" href="/schoolmentor/apple-touch-icon.png" />',
    );
    expect(result).not.toContain("favicon.svg");
    expect(result).not.toContain('type="image/svg+xml"');
  });
});
