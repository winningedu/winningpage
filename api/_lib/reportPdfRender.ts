// puppeteer-core + @sparticuz/chromium-min으로 자립 HTML 문서를 PDF 버퍼로
// 렌더한다 — api/report-pdf.ts의 유일한 브라우저 실행 지점.
//
// vitest로는 검증하지 않는다(실 브라우저 바이너리가 필요해 CI에서 안정적으로 돌
// 수 없다) — scripts/dev/report-pdf-smoke.mts가 로컬 Chrome으로 이 함수를 직접
// 태워 통합 검증한다.
import chromium from "@sparticuz/chromium-min";
import puppeteer, {
  type Browser,
  type BrowserContext,
  type Page,
} from "puppeteer-core";
import {
  acquireWithTimeout,
  createSemaphore,
  isServerlessRuntime,
  RENDER_CONCURRENCY_LIMIT,
  RENDER_QUEUE_TIMEOUT_MS,
  type RuntimeEnv,
  resolveChromiumPackUrl,
  resolveLocalExecutablePath,
  runWithCleanup,
  shouldIsolateContext,
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
  // 죽은 브라우저를 계속 재사용하지 않고 새로 띄우게 한다(단일 프로세스
  // chromium은 마지막 page.close()만으로도 프로세스가 내려갈 수 있다 — 아래
  // renderReportPdf의 cleanup 단계 참고). 재기동 비용은 크지 않다: @sparticuz/
  // chromium-min pack은 이미 /tmp에 풀려 있는 실행 파일 경로만 다시 가리키므로
  // (resolveExecutablePath), 콜드 스타트처럼 매번 tar를 새로 내려받아 푸는
  // 것이 아니라 프로세스 기동 수준의 비용만 든다.
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
    // 죽은 브라우저다 — 캐시를 비우고 아래에서 새로 띄운다(다음 getBrowser
    // 호출이 launchBrowser로 새 프로세스를 올린다).
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
  // 서버리스(--single-process, --no-zygote)는 incognito 컨텍스트 생성/해제이
  // 자체가 불안정하다 — 마지막 페이지가 닫히며 브라우저 프로세스가 내려가고,
  // 뒤이은 context.close()가 ConnectionClosedError를 던진다(실배포 실측). 그래서
  // 서버리스에서는 격리 컨텍스트를 만들지 않고 기본 컨텍스트의 page를 쓴다.
  // 로컬은 지금처럼 요청마다 격리 컨텍스트를 쓴다.
  const isolateContext = shouldIsolateContext(env);

  // 인스턴스 동시 렌더 수를 제한한다 — 초과분은 최대 RENDER_QUEUE_TIMEOUT_MS
  // 만큼만 대기하고, 그래도 자리가 안 나면 RenderQueueTimeoutError를 던진다
  // (api/report-pdf.ts가 503으로 변환한다).
  const release = await acquireWithTimeout(
    renderSemaphore,
    RENDER_QUEUE_TIMEOUT_MS,
  );

  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    return await runWithCleanup(async () => {
      const browser = await getBrowser(env);
      // 요청마다 별도 브라우저 컨텍스트를 쓰면 쿠키·캐시·스토리지가 격리돼
      // 동시 요청끼리 상태가 새지 않는다 — 로컬에서는 이 격리를 유지한다.
      context = isolateContext ? await browser.createBrowserContext() : null;
      page = await (context ?? browser).newPage();

      if (!isolateContext) {
        // 컨텍스트 격리를 포기한 대가로, 최소한 이전 요청의 캐시 리소스가
        // 이번 렌더에 섞여 들어가지 않도록 캐시는 꺼 둔다.
        await page.setCacheEnabled(false);
      }

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

      try {
        // puppeteer-core 25의 SetContentWaitForOptions는 setContent()에서
        // networkidle0/networkidle2를 타입 레벨에서 막는다(Exclude<...>) — setContent는
        // 실제 내비게이션이 아니라 load 이벤트가 더 안정적이라는 판단. 요청 인터셉션이
        // 이미 이 페이지가 부를 수 있는 리소스를 baseUrl 오리진 + data:로 제한하므로
        // load 대기로도 폰트·CSS 로딩을 충분히 기다린다.
        await page.setContent(html, { waitUntil: "load", timeout: 20000 });
      } catch (error) {
        console.warn(
          "[report-pdf] setContent 단계 실패",
          error instanceof Error ? error.message : error,
        );
        throw error;
      }

      await page.emulateMediaType("print");

      try {
        const pdf = await page.pdf({
          format: "A4",
          printBackground: true,
          preferCSSPageSize: true,
        });
        return Buffer.from(pdf);
      } catch (error) {
        console.warn(
          "[report-pdf] pdf 단계 실패",
          error instanceof Error ? error.message : error,
        );
        throw error;
      }
    }, [
      // 생성 역순으로 정리한다: page → context. 서버리스 single-process에서는
      // page.close()만으로 브라우저 프로세스가 내려갈 수 있어, 그 뒤 context.close()가
      // ConnectionClosedError를 던져도(runWithCleanup이 catch해 무시) 이미 성공한
      // 렌더 결과(PDF 버퍼)는 그대로 반환된다.
      async () => {
        if (page) await page.close();
      },
      async () => {
        if (context) await context.close();
      },
    ]);
  } finally {
    try {
      release();
    } catch (error) {
      console.warn(
        "[report-pdf] cleanup 단계 실패(세마포어 release)",
        error instanceof Error ? error.message : error,
      );
    }
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
