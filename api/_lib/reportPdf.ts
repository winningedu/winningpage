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
const VERCEL_PREVIEW_RE = /^winningpage[a-z0-9-]*\.vercel\.app$/i;
const LOCALHOST_RE = /^(localhost|127\.0\.0\.1)$/;

export function isAllowedBaseUrl(
  baseUrl: string,
  env: RuntimeEnv = {},
): boolean {
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

  if (
    url.protocol === "http:" &&
    LOCALHOST_RE.test(url.hostname) &&
    !isServerlessRuntime(env)
  ) {
    return true;
  }

  return false;
}

// 경로 문자(/, \)와 제어 문자(0x00-0x1F, 0x7F)를 제거한다 — Content-Disposition
// 헤더 값·다운로드 파일명에 그대로 실리므로 헤더 인젝션·경로 탈출을 막는다.
// biome-ignore lint/suspicious/noControlCharactersInRegex: 제어 문자를 의도적으로 제거하는 필터다.
const UNSAFE_FILENAME_RE = /[\\/\x00-\x1f\x7f]/g;

export function sanitizeFileName(rawFileName: string): string {
  const cleaned = rawFileName.replace(UNSAFE_FILENAME_RE, "");
  return /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned}.pdf`;
}

const ASCII_ONLY_RE = /^[\x20-\x7e]+$/;

/** RFC 6266 filename*(UTF-8) + ASCII filename 폴백을 함께 담은 Content-Disposition
 * 값을 만든다 — 한글 파일명은 filename만으로는 구형 클라이언트에서 깨지므로
 * 인코딩된 filename*를 함께 준다(RFC 6266 §5 예시와 동일한 조합). */
export function buildContentDispositionHeader(fileName: string): string {
  const asciiFallback = ASCII_ONLY_RE.test(fileName) ? fileName : "report.pdf";
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export interface RuntimeEnv {
  VERCEL?: string;
  AWS_LAMBDA_FUNCTION_NAME?: string;
  CHROMIUM_PACK_URL?: string;
  PUPPETEER_EXECUTABLE_PATH?: string;
}

/** Vercel/Lambda 서버리스 실행인지 판별 — true면 @sparticuz/chromium-min 바이너리
 * (원격 pack) 경로를 쓰고, false(로컬 개발)면 로컬 설치된 Chrome을 쓴다. */
export function isServerlessRuntime(env: RuntimeEnv): boolean {
  return Boolean(env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME);
}

// chromium v153 릴리스 pack — 실제 존재 확인(curl -sIL, 302→200) 완료.
export const DEFAULT_CHROMIUM_PACK_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar";

export function resolveChromiumPackUrl(env: RuntimeEnv): string {
  return env.CHROMIUM_PACK_URL ?? DEFAULT_CHROMIUM_PACK_URL;
}

export const DEFAULT_LOCAL_CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export function resolveLocalExecutablePath(env: RuntimeEnv): string {
  return env.PUPPETEER_EXECUTABLE_PATH ?? DEFAULT_LOCAL_CHROME_PATH;
}
