// 통합 스모크 — api/report-pdf.ts의 유일한 브라우저 실행 지점(renderReportPdf)을
// 로컬 Chrome으로 직접 태워 PDF 버퍼를 만든다. vitest는 브라우저 바이너리를
// 요구하는 이 경로를 검증하지 않으므로(api/_lib/reportPdfRender.ts 주석 참고)
// 이 스크립트가 대신 확인한다.
//
// 실행: npx tsx scripts/dev/report-pdf-smoke.mts [출력 경로]
// dev 서버(5303)는 필요 없다 — HTML을 네트워크로 가져오지 않고 문자열로 직접 넘긴다.
import { writeFile } from "node:fs/promises";
import {
  closeRenderBrowserForTesting,
  renderReportPdf,
} from "../../api/_lib/reportPdfRender.js";

// 한글 텍스트 + 인라인 스타일 + @page{margin:15mm} + 2페이지(page-break-before)를
// 검증하는 스모크 스펙.
const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>report-pdf-smoke</title>
<style>
  @page { margin: 15mm; }
  body { font-family: sans-serif; color: #013262; }
  .page-break { page-break-before: always; }
</style>
</head>
<body>
  <h1>위닝에듀 학습진단리포트</h1>
  <p>한글 텍스트 렌더 확인 — 홍길동 학생, 2026년 9월 23일.</p>
  <div class="page-break">
    <h1>2페이지</h1>
    <p>두 번째 페이지 본문입니다.</p>
  </div>
</body>
</html>`;

const PDF_PAGE_OBJECT_RE = /\/Type\s*\/Page(?!s)\b/g;

async function main() {
  const outPath = process.argv[2] ?? "/tmp/report-pdf-smoke.pdf";

  // FIX-6 측정 — 폼이 실제로 보내는 urlencoded 인코딩 후 크기(html 필드만).
  // 서버의 MAX_HTML_BYTES(3MB)는 디코딩 후 기준이라 이 값과 다르다 —
  // api/_lib/reportPdf.ts 주석 참고. 클라이언트 downloadReportPdf.ts는 전체
  // 필드 인코딩 후 4MB를 넘으면 폼 제출 전에 막는다.
  const encodedSize = new URLSearchParams({ html: SAMPLE_HTML }).toString()
    .length;
  console.log(
    `샘플 HTML 인코딩 후 크기(html 필드만, urlencoded): ${encodedSize} bytes`,
  );

  let pdf: Buffer;
  try {
    pdf = await renderReportPdf({
      html: SAMPLE_HTML,
      baseUrl: "http://localhost:5173",
      env: process.env,
    });
  } finally {
    await closeRenderBrowserForTesting();
  }

  const signature = pdf.subarray(0, 5).toString("latin1");
  if (signature !== "%PDF-") {
    throw new Error(`%PDF- 시그니처가 없습니다(받은 값: ${signature}).`);
  }

  const pageCount = (pdf.toString("latin1").match(PDF_PAGE_OBJECT_RE) ?? [])
    .length;
  if (pageCount < 2) {
    throw new Error(
      `페이지 수가 2 미만입니다(감지된 /Type /Page: ${pageCount}).`,
    );
  }

  await writeFile(outPath, pdf);

  console.log(
    `OK — ${pdf.length} bytes, /Type /Page ${pageCount}개, 저장 위치: ${outPath}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
