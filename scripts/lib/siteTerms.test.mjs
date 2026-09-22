import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSiteTerms } from "./siteTerms.mjs";

// loadSiteTerms(dir) — manifest.json + 원문 txt 파일을 읽어
// [{code, title, content}] 로 변환한다(scripts/seed-prod-from-dev.mjs의
// applySiteTerms가 소비하는 입력 형태).
function makeTermsDir(files) {
  const dir = mkdtempSync(path.join(tmpdir(), "site-terms-"));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), content, "utf8");
  }
  return dir;
}

describe("loadSiteTerms", () => {
  it("manifest 순서대로 code·title·content를 읽어 온다", () => {
    const dir = makeTermsDir({
      "manifest.json": JSON.stringify([
        {
          code: "service_fulltext",
          title: "위닝로직 서비스 이용약관",
          file: "service_fulltext.txt",
        },
      ]),
      "service_fulltext.txt": "제1조 (목적)\n본 약관은...",
    });

    try {
      const result = loadSiteTerms(dir);
      expect(result).toEqual([
        {
          code: "service_fulltext",
          title: "위닝로직 서비스 이용약관",
          content: "제1조 (목적)\n본 약관은...",
        },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
