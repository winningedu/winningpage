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
