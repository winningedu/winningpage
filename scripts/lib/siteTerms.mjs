// 사이트별 약관 오버라이드 — scripts/site-terms/<site>/ 아래 manifest.json +
// 원문 txt 파일을 읽어 scripts/seed-prod-from-dev.mjs의 applySiteTerms가
// 소비할 수 있는 형태로 변환하는 순수 모듈. 네트워크·DB 접속 없음.

import { readFileSync } from "node:fs";
import path from "node:path";

// dir/manifest.json + dir/<file> 을 읽어 [{code, title, content}] 로 변환한다.
export function loadSiteTerms(dir) {
  const manifest = JSON.parse(
    readFileSync(path.join(dir, "manifest.json"), "utf8"),
  );
  return manifest.map(({ code, title, file }) => ({
    code,
    title,
    // 에디터가 저장 시 덧붙이는 trailing newline(들)은 문서 내용이 아니다 —
    // DB content(terms 테이블)에는 그 줄바꿈이 없으므로 여기서 잘라 맞춘다.
    content: readFileSync(path.join(dir, file), "utf8").replace(/\n+$/, ""),
  }));
}

// code의 기존 version("vN") 중 최댓값 다음 값. 없으면 "v1".
function nextVersion(existingRows, code) {
  const numbers = existingRows
    .filter((row) => row.code === code)
    .map((row) => Number(row.version.replace(/^v/, "")))
    .filter((n) => Number.isFinite(n));
  const max = numbers.length ? Math.max(...numbers) : 0;
  return `v${max + 1}`;
}

// existingRows(타깃 DB terms 전체) + siteTerms(로드된 사이트 전용 약관)로
// 반영 계획을 만든다 — DB 접속 없음, 순수 계산.
export function planSiteTermsRows(existingRows, siteTerms) {
  const upserts = siteTerms.map(({ code, title, content }) => ({
    code,
    version: nextVersion(existingRows, code),
    title,
    content,
    is_active: true,
  }));

  return { upserts };
}
