// index.html의 <title>·favicon <link> 4줄을 사이트별(위닝에듀/스쿨멘토)로 치환하는
// 순수 함수. vite.config.js의 siteHtml() 플러그인(transformIndexHtml)이 이 함수를
// 부른다 — 로직을 여기로 뺀 이유는 vite.config.js 자체는 vitest로 직접 실행하기
// 까다로워서다(플러그인 훅 실행 환경을 흉내내야 함). 브랜드 데이터 정본은
// src/config/sites.ts 하나(site.ts·이 파일 둘 다 그것만 본다) — import.meta.env를
// 못 쓰는 이 파일도 같은 데이터를 쓴다.
import { SITES } from "./src/config/sites.ts";

// 원본 index.html의 favicon 4줄과 정확히 같은 모양(들여쓰기 4칸)을 재구성한다 —
// winning 사이트로 돌리면 원본과 바이트 단위로 같아야 하기 때문(회귀 시 즉시 드러남).
function buildFaviconLinks(favicon) {
  const lines = [
    `    <link rel="icon" type="image/png" href="${favicon.png96}" sizes="96x96" />`,
  ];
  if (favicon.svg) {
    lines.push(
      `    <link rel="icon" type="image/svg+xml" href="${favicon.svg}" />`,
    );
  }
  lines.push(`    <link rel="shortcut icon" href="${favicon.ico}" />`);
  lines.push(
    `    <link rel="apple-touch-icon" sizes="180x180" href="${favicon.appleTouch}" />`,
  );
  return lines.join("\n");
}

const FAVICON_BLOCK_RE =
  / {4}<link rel="icon" type="image\/png" href="[^"]*" sizes="96x96" \/>\n {4}<link rel="icon" type="image\/svg\+xml" href="[^"]*" \/>\n {4}<link rel="shortcut icon" href="[^"]*" \/>\n {4}<link rel="apple-touch-icon" sizes="180x180" href="[^"]*" \/>/;

export function transformSiteHtml(html, siteKey) {
  const config = SITES[siteKey];
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${config.brandName}</title>`)
    .replace(FAVICON_BLOCK_RE, buildFaviconLinks(config.favicon));
}
