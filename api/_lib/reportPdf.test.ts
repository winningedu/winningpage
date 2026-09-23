// api/report-pdf.ts 가 쓰는 순수 로직(HTML 크기·baseUrl 허용 목록·<script> 제거·
// 실행 환경 판별). 실제 브라우저 렌더는 scripts/dev/report-pdf-smoke.mts(통합
// 스크립트)로만 검증한다 — vitest는 네트워크/브라우저를 띄우지 않는다.
import { describe, expect, it, vi } from "vitest";
import {
  acquireWithTimeout,
  buildContentDispositionHeader,
  createSemaphore,
  createSlidingWindowRateLimiter,
  DEFAULT_CHROMIUM_PACK_URL,
  DEFAULT_LOCAL_CHROME_PATH,
  isAllowedBaseUrl,
  isHtmlTooLarge,
  isServerlessRuntime,
  MAX_HTML_BYTES,
  RENDER_CONCURRENCY_LIMIT,
  RENDER_QUEUE_TIMEOUT_MS,
  REPORT_PDF_RATE_LIMIT_MAX,
  REPORT_PDF_RATE_LIMIT_WINDOW_MS,
  RenderQueueTimeoutError,
  renderErrorPage,
  resolveChromiumPackUrl,
  resolveLocalExecutablePath,
  sanitizeFileName,
  sanitizePrintHtml,
} from "./reportPdf.js";

describe("isHtmlTooLarge", () => {
  it("3MB 이하 html은 false다", () => {
    expect(isHtmlTooLarge("a".repeat(100))).toBe(false);
  });

  it(`${MAX_HTML_BYTES}바이트를 초과하면 true다`, () => {
    expect(isHtmlTooLarge("a".repeat(MAX_HTML_BYTES + 1))).toBe(true);
  });
});

const TEST_ORIGIN = "https://www.winningedu.com";
const TEST_OPTIONS = { baseOrigin: TEST_ORIGIN };

function cspMeta(origin: string): string {
  const content = `default-src 'none'; img-src ${origin} data:; style-src ${origin} 'unsafe-inline'; font-src ${origin} data:; script-src 'none'; frame-src 'none'; object-src 'none'`;
  return `<meta http-equiv="Content-Security-Policy" content="${content}">`;
}
const CSP_META = cspMeta(TEST_ORIGIN);

describe("sanitizePrintHtml", () => {
  it("<script>...</script> 전체(속성 포함)를 제거한다", () => {
    const html =
      '<html><head><script src="x.js">var a=1;</script></head><body><p>본문</p></body></html>';
    expect(sanitizePrintHtml(html, TEST_OPTIONS)).toBe(
      `<html><head>${CSP_META}</head><body><p>본문</p></body></html>`,
    );
  });

  it("script가 없으면 그대로 반환한다", () => {
    const html = "<p>스크립트 없음</p>";
    expect(sanitizePrintHtml(html, TEST_OPTIONS)).toBe(html);
  });

  it("닫는 태그가 없는 <script>도 끝까지 통째로 제거한다", () => {
    const html = "<html><head><script>var a=1;var b=2;";
    expect(sanitizePrintHtml(html, TEST_OPTIONS)).toBe(
      `<html><head>${CSP_META}`,
    );
  });

  it("<iframe>...</iframe> 전체를 제거한다", () => {
    const html =
      '<body><iframe src="https://evil.com"></iframe><p>본문</p></body>';
    expect(sanitizePrintHtml(html, TEST_OPTIONS)).toBe(
      "<body><p>본문</p></body>",
    );
  });

  it("자체 닫힘(self-closing) <iframe/>도 제거한다", () => {
    const html = '<body><iframe src="https://evil.com"/><p>본문</p></body>';
    expect(sanitizePrintHtml(html, TEST_OPTIONS)).toBe(
      "<body><p>본문</p></body>",
    );
  });

  it("<object>...</object> 전체를 제거한다", () => {
    const html = '<body><object data="evil.swf"></object><p>본문</p></body>';
    expect(sanitizePrintHtml(html, TEST_OPTIONS)).toBe(
      "<body><p>본문</p></body>",
    );
  });

  it("<embed> 태그를 제거한다(닫는 태그 없는 void 요소)", () => {
    const html = '<body><embed src="evil.swf"><p>본문</p></body>';
    expect(sanitizePrintHtml(html, TEST_OPTIONS)).toBe(
      "<body><p>본문</p></body>",
    );
  });

  it("<frameset>...</frameset>과 그 안의 <frame> 태그를 제거한다", () => {
    const html =
      '<html><frameset><frame src="evil.html"></frameset><p>본문</p></html>';
    expect(sanitizePrintHtml(html, TEST_OPTIONS)).toBe(
      "<html><p>본문</p></html>",
    );
  });

  it("frameset 밖에 홀로 있는 <frame> 태그도 제거한다", () => {
    const html = '<body><frame src="evil.html"><p>본문</p></body>';
    expect(sanitizePrintHtml(html, TEST_OPTIONS)).toBe(
      "<body><p>본문</p></body>",
    );
  });

  it('<link rel="import">는 제거하지만 다른 rel의 <link>는 남긴다', () => {
    const html =
      '<head><link rel="import" href="x.html"><link rel="stylesheet" href="y.css"></head>';
    expect(sanitizePrintHtml(html, TEST_OPTIONS)).toBe(
      `<head>${CSP_META}<link rel="stylesheet" href="y.css"></head>`,
    );
  });

  it("on[a-z]+= 이벤트 핸들러 속성(큰따옴표)을 제거하고 나머지 속성은 남긴다", () => {
    const html = '<img src="x.png" onerror="alert(1)" alt="설명">';
    expect(sanitizePrintHtml(html, TEST_OPTIONS)).toBe(
      '<img src="x.png" alt="설명">',
    );
  });

  it("작은따옴표·따옴표 없는 이벤트 핸들러 값도 제거한다", () => {
    expect(
      sanitizePrintHtml("<div onclick='doEvil()'>본문</div>", TEST_OPTIONS),
    ).toBe("<div>본문</div>");
    expect(
      sanitizePrintHtml("<div onmouseover=doEvil()>본문</div>", TEST_OPTIONS),
    ).toBe("<div>본문</div>");
  });

  it("대문자·혼합 대소문자로 우회한 위험 태그·속성도 제거한다", () => {
    expect(sanitizePrintHtml("<SCRIPT>alert(1)</SCRIPT>", TEST_OPTIONS)).toBe(
      "",
    );
    expect(
      sanitizePrintHtml(
        '<IfRamE src="https://evil.com"></IFRAME>',
        TEST_OPTIONS,
      ),
    ).toBe("");
    expect(
      sanitizePrintHtml('<img src="x.png" OnError="alert(1)">', TEST_OPTIONS),
    ).toBe('<img src="x.png">');
  });

  it("<head> 맨 앞에 CSP meta 태그를 심층 방어로 주입한다", () => {
    const html = "<html><head><title>t</title></head><body></body></html>";
    expect(sanitizePrintHtml(html, TEST_OPTIONS)).toBe(
      `<html><head>${CSP_META}<title>t</title></head><body></body></html>`,
    );
  });

  it("CSP의 img-src/style-src/font-src는 'self'가 아니라 baseOrigin을 명시한다(page.setContent는 about:blank 오리진이라 'self'가 base href 오리진을 가리키지 않는다)", () => {
    const html = "<head></head>";
    const result = sanitizePrintHtml(html, {
      baseOrigin: "https://www.winningedu.com",
    });
    expect(result).not.toContain("'self'");
    expect(result).toContain("img-src https://www.winningedu.com data:");
    expect(result).toContain(
      "style-src https://www.winningedu.com 'unsafe-inline'",
    );
    expect(result).toContain("font-src https://www.winningedu.com data:");
  });
});

describe("isAllowedBaseUrl", () => {
  it.each([
    "https://www.winningedu.com",
    "https://winningedu.com",
    "https://www.schoolmentor.kr",
    "https://schoolmentor.kr",
    "https://winningpage-git-feat-x-team.vercel.app",
    "https://winningpage-schoolmentor-git-qa.vercel.app",
    "https://winningpage-git-qa-winningedu.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
  ])("%s 는 허용된다", (url) => {
    expect(isAllowedBaseUrl(url)).toBe(true);
  });

  it.each([
    "https://evil.com",
    "https://vercel.app.evil.com",
    "http://localhost.evil.com:5173",
    "ftp://localhost:5173",
    "not-a-url",
    "https://evil.vercel.app",
    "https://other-project.vercel.app",
  ])("%s 는 거부된다", (url) => {
    expect(isAllowedBaseUrl(url)).toBe(false);
  });

  it("serverless 환경(VERCEL)에서는 localhost/127.0.0.1이 거부된다(운영 루프백 SSRF 차단)", () => {
    expect(isAllowedBaseUrl("http://localhost:5173", { VERCEL: "1" })).toBe(
      false,
    );
    expect(isAllowedBaseUrl("http://127.0.0.1:3000", { VERCEL: "1" })).toBe(
      false,
    );
  });
});

describe("sanitizeFileName", () => {
  it("확장자가 없으면 .pdf를 강제로 붙인다", () => {
    expect(
      sanitizeFileName("위닝에듀 학습진단리포트_홍길동학생_20260101"),
    ).toBe("위닝에듀 학습진단리포트_홍길동학생_20260101.pdf");
  });

  it("이미 .pdf 확장자가 있으면 중복으로 붙이지 않는다", () => {
    expect(sanitizeFileName("리포트.pdf")).toBe("리포트.pdf");
  });

  it("경로 구분자·제어 문자를 제거한다", () => {
    expect(sanitizeFileName("../../etc/passwd\u0000\u0007")).toBe(
      "....etcpasswd.pdf",
    );
  });

  it('큰따옴표(")와 역슬래시(\\)를 제거한다(Content-Disposition 헤더 인젝션 방지)', () => {
    expect(sanitizeFileName('리포트"; x=1\\.pdf')).toBe("리포트; x=1.pdf");
  });
});

describe("buildContentDispositionHeader", () => {
  it("한글 파일명을 filename*=UTF-8'' 로 인코딩하고 ASCII 대체 filename도 함께 넣는다", () => {
    const header = buildContentDispositionHeader("위닝에듀 학습진단리포트.pdf");
    expect(header).toBe(
      `attachment; filename="report.pdf"; filename*=UTF-8''${encodeURIComponent("위닝에듀 학습진단리포트.pdf")}`,
    );
  });

  it("ASCII 파일명이면 filename에 그대로 쓴다", () => {
    const header = buildContentDispositionHeader("report-2026.pdf");
    expect(header).toBe(
      `attachment; filename="report-2026.pdf"; filename*=UTF-8''report-2026.pdf`,
    );
  });
});

describe("isServerlessRuntime", () => {
  it("VERCEL 환경변수가 있으면 true다", () => {
    expect(isServerlessRuntime({ VERCEL: "1" })).toBe(true);
  });

  it("AWS_LAMBDA_FUNCTION_NAME이 있으면 true다", () => {
    expect(
      isServerlessRuntime({ AWS_LAMBDA_FUNCTION_NAME: "report-pdf" }),
    ).toBe(true);
  });

  it("둘 다 없으면 false다(로컬)", () => {
    expect(isServerlessRuntime({})).toBe(false);
  });
});

describe("resolveChromiumPackUrl", () => {
  it("CHROMIUM_PACK_URL이 있으면 그 값을 쓴다", () => {
    expect(
      resolveChromiumPackUrl({
        CHROMIUM_PACK_URL: "https://example.com/x.tar",
      }),
    ).toBe("https://example.com/x.tar");
  });

  it("없으면 기본 Sparticuz chromium v153 pack URL을 쓴다", () => {
    expect(resolveChromiumPackUrl({})).toBe(DEFAULT_CHROMIUM_PACK_URL);
    expect(DEFAULT_CHROMIUM_PACK_URL).toBe(
      "https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar",
    );
  });
});

describe("resolveLocalExecutablePath", () => {
  it("PUPPETEER_EXECUTABLE_PATH이 있으면 그 값을 쓴다", () => {
    expect(
      resolveLocalExecutablePath({
        PUPPETEER_EXECUTABLE_PATH: "/usr/bin/chromium",
      }),
    ).toBe("/usr/bin/chromium");
  });

  it("없으면 로컬 macOS Chrome 기본 경로를 쓴다", () => {
    expect(resolveLocalExecutablePath({})).toBe(DEFAULT_LOCAL_CHROME_PATH);
    expect(DEFAULT_LOCAL_CHROME_PATH).toBe(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    );
  });
});

describe("createSemaphore", () => {
  it("최대 동시 개수까지는 즉시 획득된다", async () => {
    const semaphore = createSemaphore(2);
    const release1 = await semaphore.acquire();
    const release2 = await semaphore.acquire();
    expect(typeof release1).toBe("function");
    expect(typeof release2).toBe("function");
  });

  it("한도를 초과하면 release 전까지 대기하다가, release되면 다음 대기자가 획득한다", async () => {
    const semaphore = createSemaphore(1);
    const release1 = await semaphore.acquire();

    let acquired2 = false;
    const pending2 = semaphore.acquire().then((release) => {
      acquired2 = true;
      return release;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(acquired2).toBe(false);

    release1();
    const release2 = await pending2;
    expect(acquired2).toBe(true);
    expect(typeof release2).toBe("function");
  });
});

describe("acquireWithTimeout", () => {
  it("한도 내에서 즉시 획득되면 release 함수를 반환한다", async () => {
    const semaphore = createSemaphore(1);
    const release = await acquireWithTimeout(semaphore, 20_000);
    expect(typeof release).toBe("function");
    release();
  });

  it("대기가 timeoutMs를 넘으면 RenderQueueTimeoutError로 거부한다", async () => {
    vi.useFakeTimers();
    try {
      const semaphore = createSemaphore(1);
      await semaphore.acquire(); // 유일한 슬롯을 점유해 release하지 않는다.

      const pending = acquireWithTimeout(semaphore, 20_000);
      const assertion = expect(pending).rejects.toBeInstanceOf(
        RenderQueueTimeoutError,
      );
      await vi.advanceTimersByTimeAsync(20_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("timeout 후 뒤늦게 슬롯을 받으면 즉시 반납해 자리를 새지 않는다", async () => {
    vi.useFakeTimers();
    try {
      const semaphore = createSemaphore(1);
      const release1 = await semaphore.acquire();

      const timedOut = acquireWithTimeout(semaphore, 10);
      const assertion = expect(timedOut).rejects.toBeInstanceOf(
        RenderQueueTimeoutError,
      );
      await vi.advanceTimersByTimeAsync(10);
      await assertion;

      // timeout 뒤에 슬롯을 반납한다 — 대기 큐에 남아 있던 acquireWithTimeout의
      // 내부 acquire가 뒤늦게 슬롯을 받게 된다.
      release1();

      let acquired3 = false;
      semaphore.acquire().then(() => {
        acquired3 = true;
      });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();

      expect(acquired3).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("렌더 동시성 설정값", () => {
  it("동시 렌더 한도는 2, 대기 타임아웃은 20초다", () => {
    expect(RENDER_CONCURRENCY_LIMIT).toBe(2);
    expect(RENDER_QUEUE_TIMEOUT_MS).toBe(20_000);
  });
});

describe("createSlidingWindowRateLimiter", () => {
  it("윈도우 내 한도 이하 요청은 전부 허용한다", () => {
    const limiter = createSlidingWindowRateLimiter(5, 60_000);
    for (let i = 0; i < 5; i++) {
      expect(limiter.tryConsume("user-1", 1000 * i)).toBe(true);
    }
  });

  it("윈도우 내 한도를 넘는 요청은 거부한다", () => {
    const limiter = createSlidingWindowRateLimiter(5, 60_000);
    for (let i = 0; i < 5; i++) {
      limiter.tryConsume("user-1", 1000 * i);
    }
    expect(limiter.tryConsume("user-1", 5000)).toBe(false);
  });

  it("윈도우가 지나면 오래된 기록이 밀려나 다시 허용한다", () => {
    const limiter = createSlidingWindowRateLimiter(1, 60_000);
    expect(limiter.tryConsume("user-1", 0)).toBe(true);
    expect(limiter.tryConsume("user-1", 59_999)).toBe(false);
    expect(limiter.tryConsume("user-1", 60_001)).toBe(true);
  });

  it("키(사용자)가 다르면 한도를 독립적으로 센다", () => {
    const limiter = createSlidingWindowRateLimiter(1, 60_000);
    expect(limiter.tryConsume("user-1", 0)).toBe(true);
    expect(limiter.tryConsume("user-2", 0)).toBe(true);
  });
});

describe("리포트 PDF 속도 제한 설정값", () => {
  it("사용자당 1분에 5회까지 허용한다", () => {
    expect(REPORT_PDF_RATE_LIMIT_MAX).toBe(5);
    expect(REPORT_PDF_RATE_LIMIT_WINDOW_MS).toBe(60_000);
  });
});

describe("renderErrorPage", () => {
  it("사유 문구와 돌아가기 링크를 담은 간단한 HTML을 만든다", () => {
    const html = renderErrorPage(401, "로그인이 필요합니다.", "/mypage");
    expect(html).toContain("<title>PDF를 만들지 못했습니다</title>");
    expect(html).toContain("<h1>PDF를 만들지 못했습니다</h1>");
    expect(html).toContain("로그인이 필요합니다.");
    expect(html).toContain('<a href="/mypage">돌아가기</a>');
  });

  it("상태 코드를 화면에 함께 보여준다(QA·문의 시 원인 추적용)", () => {
    const html = renderErrorPage(429, "요청이 너무 잦습니다.", "/");
    expect(html).toContain("429");
  });

  it("backHref·detail의 HTML 특수문자를 이스케이프한다(반사 XSS 방지)", () => {
    const html = renderErrorPage(
      400,
      '<script>alert("x")</script>',
      '"><script>alert(1)</script>',
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
