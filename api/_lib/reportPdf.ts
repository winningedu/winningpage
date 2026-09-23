// api/report-pdf.ts(모바일·인앱용 서버 PDF 생성, QA 2차 시트 행39·56)가 쓰는 순수
// 로직 — HTML 크기 검증·baseUrl 허용 목록·filename 인코딩·<script> 제거·실행 환경
// 판별. 브라우저 실행(puppeteer-core)은 여기 두지 않는다 — 네트워크/바이너리를
// 요구해 vitest로 안정적으로 돌릴 수 없다(scripts/dev/report-pdf-smoke.mts가
// 대신 통합 검증한다).

/** 폼 본문 html 필드 상한 — 초과 시 413. */
export const MAX_HTML_BYTES = 3 * 1024 * 1024;

export function isHtmlTooLarge(html: string): boolean {
  return Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES;
}

// 방어적 2차 필터(1차는 클라이언트 buildPrintDocument, 3차는 렌더 단계
// setJavaScriptEnabled(false) + 요청 인터셉션) — 서버가 신뢰하지 않는 클라이언트
// 입력에서 <script> 요소를 통째로 걷어낸다.
const SCRIPT_TAG_RE = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;

export function stripScriptTags(html: string): string {
  return html.replace(SCRIPT_TAG_RE, "");
}

// baseUrl 허용 목록 — puppeteer의 요청 인터셉션이 이 오리진(+ data:) 외 요청을
// 전부 abort하므로, 여기서 거부하면 페이지 자체를 렌더할 수 없다(SSRF 방지).
const EXACT_ALLOWED_ORIGINS = new Set([
  "https://www.winningedu.com",
  "https://winningedu.com",
  "https://www.schoolmentor.kr",
  "https://schoolmentor.kr",
]);
const VERCEL_PREVIEW_RE = /^[a-z0-9-]+\.vercel\.app$/i;
const LOCALHOST_RE = /^(localhost|127\.0\.0\.1)$/;

export function isAllowedBaseUrl(baseUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return false;
  }

  if (EXACT_ALLOWED_ORIGINS.has(url.origin)) return true;

  if (url.protocol === "https:" && VERCEL_PREVIEW_RE.test(url.hostname)) {
    return true;
  }

  if (url.protocol === "http:" && LOCALHOST_RE.test(url.hostname)) {
    return true;
  }

  return false;
}
