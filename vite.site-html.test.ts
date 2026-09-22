import { describe, expect, it } from "vitest";
import { transformSiteHtml } from "./vite.siteHtml.mjs";

describe("transformSiteHtml — 스쿨멘토", () => {
  it("<title>을 스쿨멘토로 바꾼다", () => {
    const html = "<title>위닝에듀</title>";
    const result = transformSiteHtml(html, "schoolmentor");

    expect(result).toContain("<title>스쿨멘토</title>");
  });
});
