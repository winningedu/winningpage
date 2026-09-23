// api/report-pdf.ts(모바일·인앱용 서버 PDF 생성, QA 2차 시트 행39·56)가 쓰는 순수
// 로직 — HTML 크기 검증·baseUrl 허용 목록·filename 인코딩·<script> 제거·실행 환경
// 판별. 브라우저 실행(puppeteer-core)은 여기 두지 않는다 — 네트워크/바이너리를
// 요구해 vitest로 안정적으로 돌릴 수 없다(scripts/dev/report-pdf-smoke.mts가
// 대신 통합 검증한다).

/** 폼 본문 html 필드 상한 — 초과 시 413. 이 값은 **디코딩 후** html 문자열의
 * UTF-8 바이트 수 기준이다(isHtmlTooLarge가 Buffer.byteLength로 잰다) —
 * 폼 전체를 urlencoded로 인코딩한 뒤(대략 3배 부풀림) 크기와는 다르다.
 * 클라이언트의 4MB 인코딩 후 상한은 src/lib/report/downloadReportPdf.ts
 * 참고. */
export const MAX_HTML_BYTES = 3 * 1024 * 1024;

export function isHtmlTooLarge(html: string): boolean {
  return Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES;
}

// 방어적 2차 필터(1차는 클라이언트 buildPrintDocument, 3차는 렌더 단계
// setJavaScriptEnabled(false) + 요청 인터셉션) — 서버가 신뢰하지 않는 클라이언트
// 입력에서 <script> 요소를 통째로 걷어낸다.
const SCRIPT_TAG_RE = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
// 닫는 태그 없이 끝나는 <script>는 브라우저가 문서 끝까지를 스크립트 콘텐츠로
// 삼킨다 — 위 정규식(비탐욕적, 닫는 태그 필수)이 못 잡으므로 남은 여는 태그부터
// 끝까지 통째로 제거한다.
const UNCLOSED_SCRIPT_TAG_RE = /<script\b[^>]*>[\s\S]*$/gi;

// iframe은 self-closing(<iframe .../>)일 수도, 여는/닫는 태그 쌍(콘텐츠 포함)일
// 수도 있다 — self-closing부터 먼저 걷어내야 쌍 매칭 정규식이 뒤 이어지는
// 진짜 </iframe>을 엉뚱하게 삼키지 않는다.
const SELF_CLOSING_IFRAME_TAG_RE = /<iframe\b[^>]*\/>/gi;
const IFRAME_TAG_RE = /<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi;

// object도 iframe처럼 외부/플러그인 콘텐츠를 끼워 넣을 수 있어 여닫는 쌍
// 전체를 제거한다(self-closing은 스펙상 없다 — 항상 </object>가 필요하다).
const OBJECT_TAG_RE = /<object\b[^>]*>[\s\S]*?<\/object\s*>/gi;

// embed는 HTML void 요소라 닫는 태그가 없다 — 여는 태그 하나만 제거하면 된다.
const EMBED_TAG_RE = /<embed\b[^>]*>/gi;

// frameset은 콘텐츠(그 안의 frame들 포함)를 통째로 제거한다 — frame은 항상
// frameset 안에서만 유효하므로 별도 정규식이 필요 없다.
const FRAMESET_TAG_RE = /<frameset\b[^>]*>[\s\S]*?<\/frameset\s*>/gi;

// frameset 밖에 홀로 남은 <frame>(잘못된 마크업·frameset이 이미 제거된 뒤의
// 잔여물)도 void 요소로 취급해 여는 태그를 제거한다.
const FRAME_TAG_RE = /<frame\b[^>]*>/gi;

// HTML Imports(<link rel="import">)는 폐기된 스펙이지만 일부 구형 Chromium
// 빌드가 여전히 지원해 외부 문서를 끼워 넣을 수 있다 — rel="import" 속성이
// 있는 <link>만 골라 제거하고, rel="stylesheet" 등 다른 <link>는 남긴다.
const LINK_IMPORT_TAG_RE = /<link\b(?=[^>]*\brel\s*=\s*["']?import\b)[^>]*>/gi;

// onclick·onerror 등 인라인 이벤트 핸들러 속성 — 값이 큰따옴표/작은따옴표/
// 따옴표 없는 세 형태 중 무엇이든 속성 전체(공백 포함)를 제거한다.
const EVENT_HANDLER_ATTR_RE = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

// 위 필터들을 뚫는 새 우회가 나와도 브라우저 단에서 한 번 더 막는 심층 방어 —
// script/object/frame 전면 차단 + 이미지·스타일·폰트만 최소 허용한다.
// puppeteer는 page.setContent()로 문서를 넣는데, 이 문서의 오리진은
// about:blank라 CSP의 'self'는 base href(baseOrigin) 오리진을 가리키지
// 않는다 — 'self' 대신 검증을 통과한 baseOrigin을 명시해야 baseOrigin에서
// 오는 로고·웹폰트·CSS(<link>)가 실제로 로드된다(회귀: 'self'였을 때 prod에서
// 로고·폰트·외부 스타일시트가 전부 차단돼 스타일 없는 PDF가 됐다).
// <base> 태그 앞이 아니라 head 맨 앞(첫 자식)에 심는다 — base는 그대로 둔다.
function buildContentSecurityPolicyMeta(baseOrigin: string): string {
  const content = `default-src 'none'; img-src ${baseOrigin} data:; style-src ${baseOrigin} 'unsafe-inline'; font-src ${baseOrigin} data:; script-src 'none'; frame-src 'none'; object-src 'none'`;
  return `<meta http-equiv="Content-Security-Policy" content="${content}">`;
}
const HEAD_OPEN_TAG_RE = /<head\b[^>]*>/i;

function injectContentSecurityPolicy(html: string, baseOrigin: string): string {
  if (!HEAD_OPEN_TAG_RE.test(html)) return html;
  const meta = buildContentSecurityPolicyMeta(baseOrigin);
  return html.replace(
    HEAD_OPEN_TAG_RE,
    (headOpenTag) => `${headOpenTag}${meta}`,
  );
}

export interface SanitizePrintHtmlOptions {
  /** isAllowedBaseUrl로 이미 검증된 baseUrl의 origin — CSP의 img-src/style-src/
   * font-src에 'self' 대신 이 값을 명시한다. */
  baseOrigin: string;
}

export function sanitizePrintHtml(
  html: string,
  { baseOrigin }: SanitizePrintHtmlOptions,
): string {
  return injectContentSecurityPolicy(
    html
      .replace(SCRIPT_TAG_RE, "")
      .replace(UNCLOSED_SCRIPT_TAG_RE, "")
      .replace(SELF_CLOSING_IFRAME_TAG_RE, "")
      .replace(IFRAME_TAG_RE, "")
      .replace(OBJECT_TAG_RE, "")
      .replace(EMBED_TAG_RE, "")
      .replace(FRAMESET_TAG_RE, "")
      .replace(FRAME_TAG_RE, "")
      .replace(LINK_IMPORT_TAG_RE, "")
      .replace(EVENT_HANDLER_ATTR_RE, ""),
    baseOrigin,
  );
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

// 경로 문자(/, \), 큰따옴표(")와 제어 문자(0x00-0x1F, 0x7F)를 제거한다 —
// buildContentDispositionHeader의 filename="..." 값에 그대로 실리므로
// 헤더 인젝션(따옴표 탈출)·경로 탈출을 막는다.
// biome-ignore lint/suspicious/noControlCharactersInRegex: 제어 문자를 의도적으로 제거하는 필터다.
const UNSAFE_FILENAME_RE = /[\\/"\x00-\x1f\x7f]/g;

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

// 인스턴스 하나가 렌더 요청을 동시에 너무 많이 받으면 브라우저 프로세스가
// 메모리 압박으로 죽는다 — reportPdfRender.ts가 이 세마포어로 동시 렌더 수를
// 제한한다. 순수 로직만 여기 둔다(브라우저 자체는 vitest로 검증할 수 없다).
export interface Semaphore {
  /** 슬롯을 획득하면 release 함수를 담은 프라미스를 반환한다 — 슬롯이 꽉 찼으면
   * 다른 acquire가 release를 부를 때까지 대기한다(선입선출 큐). */
  acquire(): Promise<() => void>;
}

export function createSemaphore(maxConcurrent: number): Semaphore {
  let active = 0;
  const queue: Array<() => void> = [];

  function release(): void {
    active -= 1;
    const next = queue.shift();
    if (next) next();
  }

  return {
    acquire(): Promise<() => void> {
      return new Promise((resolve) => {
        const grant = () => {
          active += 1;
          resolve(release);
        };
        if (active < maxConcurrent) {
          grant();
        } else {
          queue.push(grant);
        }
      });
    },
  };
}

// 인스턴스 하나가 브라우저 렌더를 동시에 처리할 최대 개수 — 이보다 많으면
// 큐에서 대기한다(메모리 압박으로 브라우저 프로세스가 죽는 것을 막는다).
export const RENDER_CONCURRENCY_LIMIT = 2;

// 큐 대기가 이 시간(ms)을 넘으면 503으로 응답한다 — 사용자를 무한정 붙잡지
// 않는다.
export const RENDER_QUEUE_TIMEOUT_MS = 20_000;

// 사용자별(요청 body의 인증된 userId 기준) 인메모리 슬라이딩 윈도우 속도 제한 —
// 인스턴스 로컬이라 인스턴스가 여러 개면 한도가 인스턴스 수만큼 느슨해질 수
// 있지만, 한 인스턴스가 무한정 렌더를 받는 남용을 막는 1차 방어선이다.
export interface RateLimiter {
  /** 이번 요청을 허용하면 true를 반환하고 창에 기록한다. 초과면 false. */
  tryConsume(key: string, now: number): boolean;
}

// api/report-pdf.ts가 사용자(userId)당 적용하는 한도 — 1분에 5회.
export const REPORT_PDF_RATE_LIMIT_MAX = 5;
export const REPORT_PDF_RATE_LIMIT_WINDOW_MS = 60_000;

export function createSlidingWindowRateLimiter(
  maxRequests: number,
  windowMs: number,
): RateLimiter {
  const hitsByKey = new Map<string, number[]>();

  return {
    tryConsume(key: string, now: number): boolean {
      const windowStart = now - windowMs;
      const recent = (hitsByKey.get(key) ?? []).filter(
        (timestamp) => timestamp > windowStart,
      );

      if (recent.length >= maxRequests) {
        hitsByKey.set(key, recent);
        return false;
      }

      recent.push(now);
      hitsByKey.set(key, recent);
      return true;
    },
  };
}

/** 큐 대기가 이 시간을 넘으면 acquireWithTimeout이 RenderQueueTimeoutError로
 * 거부한다 — reportPdfRender.ts가 503으로 변환한다. */
export class RenderQueueTimeoutError extends Error {
  constructor() {
    super("PDF 생성이 혼잡합니다. 잠시 후 다시 시도해 주세요.");
    this.name = "RenderQueueTimeoutError";
  }
}

/** semaphore.acquire()를 timeoutMs 안에 못 받으면 RenderQueueTimeoutError로
 * 거부한다. */
export function acquireWithTimeout(
  semaphore: Semaphore,
  timeoutMs: number,
): Promise<() => void> {
  return new Promise((resolve, reject) => {
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      reject(new RenderQueueTimeoutError());
    }, timeoutMs);

    semaphore.acquire().then((release) => {
      clearTimeout(timer);
      if (timedOut) {
        // 이미 타임아웃으로 거부한 뒤 뒤늦게 슬롯을 받았다 — 아무도 이 release를
        // 호출하지 못하면 슬롯이 영구히 새어(leak) 동시 처리 한도가 줄어든다.
        release();
        return;
      }
      resolve(release);
    });
  });
}

// 폼(application/x-www-form-urlencoded) 제출은 최상위 내비게이션이라, JSON
// 에러 응답이 그대로 화면을 덮어써 버린다(FIX-5) — report-pdf.ts가 폼 요청일
// 때 이 함수로 만든 HTML을 대신 응답한다. detail·backHref는 신뢰할 수 없는
// 값(detail은 고정 문구지만 backHref는 Referer 헤더)일 수 있어 이스케이프한다.
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderErrorPage(
  status: number,
  detail: string,
  backHref: string,
): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>PDF를 만들지 못했습니다</title>
</head>
<body>
<h1>PDF를 만들지 못했습니다</h1>
<p>${escapeHtml(detail)} (${status})</p>
<a href="${escapeHtml(backHref)}">돌아가기</a>
</body>
</html>`;
}
