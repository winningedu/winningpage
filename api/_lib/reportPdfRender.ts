// puppeteer-core + @sparticuz/chromium-min으로 자립 HTML 문서를 PDF 버퍼로
// 렌더한다 — api/report-pdf.ts의 유일한 브라우저 실행 지점.
//
// vitest로는 검증하지 않는다(실 브라우저 바이너리가 필요해 CI에서 안정적으로 돌
// 수 없다) — scripts/dev/report-pdf-smoke.mts가 로컬 Chrome으로 이 함수를 직접
// 태워 통합 검증한다.
import chromium from "@sparticuz/chromium-min";
import puppeteer, { type Browser } from "puppeteer-core";
import {
  acquireWithTimeout,
  createSemaphore,
  isServerlessRuntime,
  RENDER_CONCURRENCY_LIMIT,
  RENDER_QUEUE_TIMEOUT_MS,
  type RuntimeEnv,
  resolveChromiumPackUrl,
  resolveLocalExecutablePath,
} from "./reportPdf.js";

// 브라우저 인스턴스는 모듈 스코프에 캐시한다 — 서버리스 웜 재사용 시 매 요청마다
// 콜드 스타트(바이너리 인플레이트 + 프로세스 기동)를 반복하지 않기 위함이다.
let browserPromise: Promise<Browser> | null = null;

// 인스턴스 하나가 동시에 처리할 렌더 수를 제한한다 — 브라우저 프로세스가
// 메모리 압박으로 죽는 것을 막는다(순수 로직은 reportPdf.ts에서 단위 테스트).
const renderSemaphore = createSemaphore(RENDER_CONCURRENCY_LIMIT);

async function resolveExecutablePath(env: RuntimeEnv): Promise<string> {
  if (isServerlessRuntime(env)) {
    return chromium.executablePath(resolveChromiumPackUrl(env));
  }
  return resolveLocalExecutablePath(env);
}

async function launchBrowser(env: RuntimeEnv): Promise<Browser> {
  const executablePath = await resolveExecutablePath(env);
  const serverless = isServerlessRuntime(env);
  const browser = await puppeteer.launch({
    // chromium.args(--single-process, --no-zygote 등)는 Lambda/Vercel 서버리스
    // 컨테이너 전용이다 — 로컬 데스크톱 Chrome에 그대로 주면 렌더러가 즉시
    // 죽는다(스모크 스크립트 실측: ConnectionClosedError). 로컬은 puppeteer
    // 기본 인자만 쓴다.
    args: serverless ? chromium.args : [],
    executablePath,
    headless: "shell",
  });
  // 브라우저 프로세스가 죽거나 명시적으로 close()되면 캐시를 비워, 다음 요청이
  // 죽은 브라우저를 계속 재사용하지 않고 새로 띄우게 한다.
  browser.on("disconnected", () => {
    browserPromise = null;
  });
  return browser;
}

async function getBrowser(env: RuntimeEnv): Promise<Browser> {
  if (browserPromise) {
    const cached = await browserPromise;
    if (cached.connected) {
      return cached;
    }
    // disconnected 이벤트가 아직 안 왔더라도(레이스), connected가 false면
    // 죽은 브라우저다 — 캐시를 비우고 아래에서 새로 띄운다.
    browserPromise = null;
  }

  browserPromise = launchBrowser(env).catch((error) => {
    // 실패한 launch를 캐시해 두면 다음 요청이 영원히 같은 실패를 재현한다 —
    // 다음 호출이 재시도할 수 있게 캐시를 비운다.
    browserPromise = null;
    throw error;
  });
  return browserPromise;
}

export interface RenderReportPdfInput {
  html: string;
  /** 요청 인터셉션 허용 오리진(SSRF 방지) — reportPdf.ts의 isAllowedBaseUrl로
   * 이미 검증된 값이어야 한다. */
  baseUrl: string;
  env: RuntimeEnv;
}

export async function renderReportPdf({
  html,
  baseUrl,
  env,
}: RenderReportPdfInput): Promise<Buffer> {
  const allowedOrigin = new URL(baseUrl).origin;

  // 인스턴스 동시 렌더 수를 제한한다 — 초과분은 최대 RENDER_QUEUE_TIMEOUT_MS
  // 만큼만 대기하고, 그래도 자리가 안 나면 RenderQueueTimeoutError를 던진다
  // (api/report-pdf.ts가 503으로 변환한다).
  const release = await acquireWithTimeout(
    renderSemaphore,
    RENDER_QUEUE_TIMEOUT_MS,
  );

  try {
    const browser = await getBrowser(env);
    // 요청마다 별도 브라우저 컨텍스트를 써서 쿠키·캐시·스토리지를 격리한다 —
    // 동시 요청끼리 상태가 새지 않게 한다.
    const context = await browser.createBrowserContext();

    try {
      const page = await context.newPage();

      try {
        await page.setJavaScriptEnabled(false);
        await page.setRequestInterception(true);
        page.on("request", (request) => {
          const url = request.url();
          if (url.startsWith("data:")) {
            request.continue();
            return;
          }
          try {
            if (new URL(url).origin === allowedOrigin) {
              request.continue();
              return;
            }
          } catch {
            // URL 파싱 실패 — 아래 abort로 떨어진다.
          }
          request.abort();
        });

        // puppeteer-core 25의 SetContentWaitForOptions는 setContent()에서
        // networkidle0/networkidle2를 타입 레벨에서 막는다(Exclude<...>) — setContent는
        // 실제 내비게이션이 아니라 load 이벤트가 더 안정적이라는 판단. 요청 인터셉션이
        // 이미 이 페이지가 부를 수 있는 리소스를 baseUrl 오리진 + data:로 제한하므로
        // load 대기로도 폰트·CSS 로딩을 충분히 기다린다.
        await page.setContent(html, { waitUntil: "load", timeout: 20000 });
        await page.emulateMediaType("print");

        const pdf = await page.pdf({
          format: "A4",
          printBackground: true,
          preferCSSPageSize: true,
        });

        return Buffer.from(pdf);
      } finally {
        await page.close();
      }
    } finally {
      await context.close();
    }
  } finally {
    release();
  }
}

/** 스모크 스크립트(scripts/dev/report-pdf-smoke.mts) 전용 — 모듈 스코프 캐시를 정리해
 * 브라우저 프로세스가 스크립트 종료 후 고아로 남지 않게 한다. 실제 요청 경로에서는
 * 부르지 않는다(웜 재사용이 목적이므로). */
export async function closeRenderBrowserForTesting(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise;
  browserPromise = null;
  await browser.close();
}
