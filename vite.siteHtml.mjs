// index.html의 <title>·favicon·manifest·로고 preload·스플래시 pre-logo를
// 사이트별(위닝에듀/스쿨멘토)로 치환하는 순수 함수. vite.config.js의 siteHtml()
// 플러그인(transformIndexHtml)이 이 함수를 부른다 — 로직을 여기로 뺀 이유는
// vite.config.js 자체는 vitest로 직접 실행하기 까다로워서다(플러그인 훅 실행
// 환경을 흉내내야 함). 브랜드 데이터 정본은 src/config/sites.ts 하나(site.ts·이
// 파일 둘 다 그것만 본다) — import.meta.env를 못 쓰는 이 파일도 같은 데이터를 쓴다.
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
const TITLE_RE = /<title>[^<]*<\/title>/;
const MANIFEST_RE = /<link rel="manifest" href="[^"]*" \/>/;
const PRELOAD_LOGO_RE =
  /<link rel="preload" as="image" href="[^"]*" fetchpriority="high" \/>/;
// 스플래시(#pre-header) 로고 — class="pre-logo" 다음 줄의 src만 좁게 매치한다(다른
// src="..." 속성과 혼동하지 않도록). 들여쓰기 폭은 \s+로 흡수해 포맷 변경에 덜 민감하게 둔다.
const PRE_LOGO_SRC_RE = /(class="pre-logo"\s*\n\s*src=")[^"]*(")/;

// 매치 0건이면 무음으로 넘어가지 않고 즉시 throw한다 — index.html 구조가 바뀌어
// 치환 지점이 사라지면(리팩터 등) 스쿨멘토 빌드가 조용히 위닝에듀 자산을 섞어
// 배포하는 사고를 막기 위함이다.
function requireReplace(html, regex, replacement, label) {
  if (!regex.test(html)) {
    throw new Error(
      `vite.siteHtml: index.html에서 "${label}" 치환 지점을 찾지 못했다`,
    );
  }
  return html.replace(regex, replacement);
}

export function transformSiteHtml(html, siteKey) {
  const config = SITES[siteKey];

  let result = html;
  result = requireReplace(
    result,
    TITLE_RE,
    `<title>${config.brandName}</title>`,
    "title",
  );
  result = requireReplace(
    result,
    FAVICON_BLOCK_RE,
    buildFaviconLinks(config.favicon),
    "favicon",
  );
  result = requireReplace(
    result,
    MANIFEST_RE,
    `<link rel="manifest" href="${config.manifest}" />`,
    "manifest",
  );
  result = requireReplace(
    result,
    PRELOAD_LOGO_RE,
    `<link rel="preload" as="image" href="${config.logo.horizontal}" fetchpriority="high" />`,
    "로고 preload",
  );
  result = requireReplace(
    result,
    PRE_LOGO_SRC_RE,
    `$1${config.logo.horizontal}$2`,
    "스플래시 pre-logo",
  );

  return result;
}
