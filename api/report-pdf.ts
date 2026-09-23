// POST /api/report-pdf  (application/x-www-form-urlencoded: html, filename, token, baseUrl)
//
// 모바일·인앱 리포트 PDF 다운로드(QA 2차 시트 행39·56, 파일48 영상) — 학습진단·
// 목표관리 성장 리포트·수행평가 리포트가 카카오톡 인앱 등에서는 window.print()/
// react-to-print(iframe 인쇄)가 무동작이라, 서버가 puppeteer-core로 PDF를 만들어
// Content-Disposition: attachment 로 응답한다(카카오 데브톡 공식 답변 — 인앱
// 다운로드는 이 방식만 된다).
//
// 클라이언트는 반드시 최상위 내비게이션(숨김 <form method=post> submit)으로
// 이 엔드포인트를 부른다(src/lib/report/downloadReportPdf.ts) — fetch+blob은
// 카카오 인앱에서 0바이트 파일이 된다.
//
// 토큰은 헤더가 아니라 폼 body(token 필드)로 온다 — <form> submit은 커스텀
// Authorization 헤더를 실을 수 없다. 그래서 httpAuth.ts의 resolveUser(헤더 전용)를
// 쓰지 않고, 같은 검증(auth.getUser)을 이 핸들러가 직접 부른다(auth:"none" +
// change-phone.ts와 동일한 선례).

import type { VercelResponse } from "@vercel/node";
import { defineHandler } from "./_lib/handler.js";
import {
  buildContentDispositionHeader,
  createSlidingWindowRateLimiter,
  isAllowedBaseUrl,
  isHtmlTooLarge,
  REPORT_PDF_RATE_LIMIT_MAX,
  REPORT_PDF_RATE_LIMIT_WINDOW_MS,
  RenderQueueTimeoutError,
  sanitizeFileName,
  stripScriptTags,
} from "./_lib/reportPdf.js";
import { renderReportPdf } from "./_lib/reportPdfRender.js";

export const config = { runtime: "nodejs", maxDuration: 60 };

function fail(res: VercelResponse, status: number, message: string) {
  res.status(status).json({ detail: message });
}

// 인스턴스 로컬 인메모리 한도 — 사용자당 1분에 5회. 인스턴스 재시작·다중
// 인스턴스 스케일아웃에서는 한도가 리셋/분산될 수 있지만, 브라우저 렌더는
// 비용이 크므로 한 인스턴스가 한 사용자에게 무제한으로 소모되는 것을 막는
// 1차 방어선이다.
const rateLimiter = createSlidingWindowRateLimiter(
  REPORT_PDF_RATE_LIMIT_MAX,
  REPORT_PDF_RATE_LIMIT_WINDOW_MS,
);

export default defineHandler({
  methods: ["POST"],
  auth: "none",
  errorShape: "detail",
  unhandledMessage: "PDF 생성 중 오류가 발생했습니다.",
  logLabel: "report-pdf",
  handler: async (req, res, ctx) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const html = typeof body.html === "string" ? body.html : "";
    const filenameInput =
      typeof body.filename === "string" ? body.filename : "";
    const token = typeof body.token === "string" ? body.token : "";
    const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl : "";

    if (!token) {
      return fail(res, 401, "로그인이 필요합니다.");
    }

    const { data: userData, error: userError } =
      await ctx.supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      return fail(res, 401, "로그인이 필요합니다.");
    }

    if (!rateLimiter.tryConsume(userData.user.id, Date.now())) {
      return fail(res, 429, "요청이 너무 잦습니다. 1분 뒤 다시 시도해 주세요.");
    }

    if (!html) {
      return fail(res, 400, "html이 비어 있습니다.");
    }
    if (isHtmlTooLarge(html)) {
      return fail(res, 413, "요청 본문이 너무 큽니다.");
    }
    if (!isAllowedBaseUrl(baseUrl, process.env)) {
      return fail(res, 400, "허용되지 않은 baseUrl입니다.");
    }
    if (!filenameInput) {
      return fail(res, 400, "filename이 비어 있습니다.");
    }

    const safeHtml = stripScriptTags(html);
    const fileName = sanitizeFileName(filenameInput);

    let pdf: Buffer;
    try {
      pdf = await renderReportPdf({
        html: safeHtml,
        baseUrl,
        env: process.env,
      });
    } catch (error) {
      if (error instanceof RenderQueueTimeoutError) {
        return fail(res, 503, error.message);
      }
      console.error("[report-pdf] 렌더 실패:", error);
      return fail(res, 500, "PDF 생성 중 오류가 발생했습니다.");
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      buildContentDispositionHeader(fileName),
    );
    res.setHeader("Content-Length", String(pdf.length));
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(pdf);
  },
});
