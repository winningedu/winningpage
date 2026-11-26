import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SITES } from "./src/config/sites";
import { transformSiteHtml } from "./vite.siteHtml.mjs";

const REAL_INDEX_HTML = readFileSync(
  path.join(process.cwd(), "index.html"),
  "utf-8",
);

describe("transformSiteHtml — 위닝에듀", () => {
  it("실제 index.html에 적용해도 바이트 단위로 동일하다(winning이 baseline)", () => {
    expect(transformSiteHtml(REAL_INDEX_HTML, "winning")).toBe(REAL_INDEX_HTML);
  });
});

describe("transformSiteHtml — 스쿨멘토", () => {
  it("<title>을 스쿨멘토로 바꾼다", () => {
    const result = transformSiteHtml(REAL_INDEX_HTML, "schoolmentor");

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

  it("실제 index.html에 적용하면 winning 로고 svg 경로가 0회, 스쿨멘토 png 경로가 preload+스플래시 img 2회 등장한다", () => {
    const result = transformSiteHtml(REAL_INDEX_HTML, "schoolmentor");

    expect(result).not.toContain("winning-logo-horizontal.svg");
    expect(
      result.split("/images/schoolmentor-logo-horizontal.png").length - 1,
    ).toBe(2);
  });

  it("manifest 링크를 /schoolmentor/site.webmanifest로 바꾼다", () => {
    const result = transformSiteHtml(REAL_INDEX_HTML, "schoolmentor");

    expect(result).toContain(
      '<link rel="manifest" href="/schoolmentor/site.webmanifest" />',
    );
    expect(result).not.toContain('href="/site.webmanifest"');
  });
});

// 네이버 서치어드바이저가 요구하는 description, og 태그(사이트마다 한 번씩, 그 사이트 값으로).
const SEO_EXPECTED = {
  winning: {
    brandName: "위닝에듀",
    url: "https://www.winningedu.com/",
    image: "https://www.winningedu.com/images/og/og-winning.png",
  },
  schoolmentor: {
    brandName: "스쿨멘토",
    url: "https://www.schoolmentor.kr/",
    image: "https://www.schoolmentor.kr/images/og/og-schoolmentor.png",
  },
} as const;

function countOf(html: string, needle: string) {
  return html.split(needle).length - 1;
}

describe.each(["winning", "schoolmentor"] as const)(
  "transformSiteHtml SEO 태그(%s)",
  (siteKey) => {
    const result = transformSiteHtml(REAL_INDEX_HTML, siteKey);
    const expected = SEO_EXPECTED[siteKey];
    const description = SITES[siteKey].seo.description;

    it("description과 og 태그를 그 사이트 값으로 한 번씩 넣는다", () => {
      expect(description.length).toBeGreaterThan(0);
      const tags = [
        `<meta name="description" content="${description}" />`,
        '<meta property="og:type" content="website" />',
        `<meta property="og:site_name" content="${expected.brandName}" />`,
        `<meta property="og:title" content="${expected.brandName}" />`,
        `<meta property="og:description" content="${description}" />`,
        `<meta property="og:url" content="${expected.url}" />`,
        `<meta property="og:image" content="${expected.image}" />`,
      ];
      for (const tag of tags) {
        expect(countOf(result, tag)).toBe(1);
      }
      expect(countOf(result, 'name="description"')).toBe(1);
      for (const key of [
        "type",
        "site_name",
        "title",
        "description",
        "url",
        "image",
      ]) {
        expect(countOf(result, `property="og:${key}"`)).toBe(1);
      }
    });
  },
);

describe("transformSiteHtml — 치환 지점을 못 찾으면 throw한다", () => {
  it.each([
    /\n\s*<meta name="description"[^>]*>/,
    /\n\s*<meta property="og:image"[^>]*>/,
  ])("SEO 태그(%s)가 없는 index.html이면 에러를 던진다", (tag) => {
    const html = REAL_INDEX_HTML.replace(tag, "");
    expect(html).not.toBe(REAL_INDEX_HTML);
    expect(() => transformSiteHtml(html, "schoolmentor")).toThrow(
      /치환 지점을 찾지 못했다/,
    );
  });

  it("favicon 블록이 없는 html이면 에러를 던진다", () => {
    expect(() =>
      transformSiteHtml("<title>위닝에듀</title>", "winning"),
    ).toThrow(/치환 지점을 찾지 못했다/);
  });
});
