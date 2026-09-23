// puppeteer-core + @sparticuz/chromium-min으로 자립 HTML 문서를 PDF 버퍼로
// 렌더한다 — api/report-pdf.ts의 유일한 브라우저 실행 지점.
//
// vitest로는 검증하지 않는다(실 브라우저 바이너리가 필요해 CI에서 안정적으로 돌
// 수 없다) — scripts/dev/report-pdf-smoke.mts가 로컬 Chrome으로 이 함수를 직접
// 태워 통합 검증한다.
import chromium from "@sparticuz/chromium-min";
import puppeteer, { type Browser } from "puppeteer-core";
import {
  isServerlessRuntime,
  type RuntimeEnv,
  resolveChromiumPackUrl,
  resolveLocalExecutablePath,
} from "./reportPdf.js";

// 브라우저 인스턴스는 모듈 스코프에 캐시한다 — 서버리스 웜 재사용 시 매 요청마다
// 콜드 스타트(바이너리 인플레이트 + 프로세스 기동)를 반복하지 않기 위함이다.
let browserPromise: Promise<Browser> | null = null;

async function resolveExecutablePath(env: RuntimeEnv): Promise<string> {
  if (isServerlessRuntime(env)) {
    return chromium.executablePath(resolveChromiumPackUrl(env));
  }
  return resolveLocalExecutablePath(env);
}

async function getBrowser(env: RuntimeEnv): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const executablePath = await resolveExecutablePath(env);
      return puppeteer.launch({
        args: chromium.args,
        executablePath,
        headless: "shell",
      });
    })().catch((error) => {
      // 실패한 launch를 캐시해 두면 다음 요청이 영원히 같은 실패를 재현한다 —
      // 다음 호출이 재시도할 수 있게 캐시를 비운다.
      browserPromise = null;
      throw error;
    });
  }
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
  const browser = await getBrowser(env);
  const page = await browser.newPage();

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
}
