import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSiteTerms, planSiteTermsRows } from "./siteTerms.mjs";

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

  it("파일 끝 개행(들)을 잘라 DB content와 동일하게 정규화한다", () => {
    const dir = makeTermsDir({
      "manifest.json": JSON.stringify([
        { code: "privacy_policy", title: "개인정보처리방침", file: "p.txt" },
      ]),
      // 에디터가 저장 시 붙이는 trailing newline(들)은 실제 문서 내용이 아니다.
      "p.txt": "본문 마지막 줄\n\n",
    });

    try {
      const [{ content }] = loadSiteTerms(dir);
      expect(content).toBe("본문 마지막 줄");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("planSiteTermsRows", () => {
  it("기존 최대 버전(v4) 다음 버전(v5)으로 활성 upsert를 만든다", () => {
    const existingRows = [
      { code: "service_fulltext", version: "v3", is_active: false },
      { code: "service_fulltext", version: "v4", is_active: true },
    ];
    const siteTerms = [
      {
        code: "service_fulltext",
        title: "위닝로직 서비스 이용약관",
        content: "제1조...",
      },
    ];

    const { upserts } = planSiteTermsRows(existingRows, siteTerms);

    expect(upserts).toEqual([
      {
        code: "service_fulltext",
        version: "v5",
        title: "위닝로직 서비스 이용약관",
        content: "제1조...",
        is_active: true,
      },
    ]);
  });

  it("해당 code가 기존에 없으면 v1로 upsert를 만든다", () => {
    const { upserts } = planSiteTermsRows(
      [{ code: "refund_policy", version: "v3", is_active: true }],
      [{ code: "privacy_policy", title: "개인정보처리방침", content: "..." }],
    );

    expect(upserts).toEqual([
      {
        code: "privacy_policy",
        version: "v1",
        title: "개인정보처리방침",
        content: "...",
        is_active: true,
      },
    ]);
  });

  it("code와 무관하게 현재 활성 행 전부를 deactivate 대상으로 돌려준다", () => {
    const existingRows = [
      { code: "service_fulltext", version: "v4", is_active: true },
      { code: "service_fulltext", version: "v3", is_active: false },
      { code: "refund_policy", version: "v2", is_active: true },
      { code: "student_service", version: "v1", is_active: true },
    ];

    const { deactivate } = planSiteTermsRows(existingRows, []);

    expect(deactivate).toEqual([
      { code: "service_fulltext", version: "v4" },
      { code: "refund_policy", version: "v2" },
      { code: "student_service", version: "v1" },
    ]);
  });
});
