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
