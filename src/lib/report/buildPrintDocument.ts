// 서버 PDF 경로(모바일·인앱, QA 2차 시트 행39·56)용 자립 HTML 문서 빌더.
//
// 인쇄 대상(root)의 outerHTML만으로는 CSS가 전혀 적용되지 않는다 — 이 함수가
// 현재 문서의 스타일시트(<link>/<style>)와 <html> 속성, <base>, <meta charset>을
// 모아 puppeteer의 page.setContent()가 그대로 렌더할 수 있는 완전한 문서 문자열을
// 만든다. <script>는 어떤 경우에도 포함하지 않는다(서버가 html을 그대로 렌더할
// 뿐 실행 컨텍스트를 신뢰하지 않는다 — api/report-pdf.ts도 setJavaScriptEnabled(false)로
// 같은 경계를 한 번 더 강제한다).
export interface BuildPrintDocumentInput {
  root: HTMLElement;
  title: string;
  /** react-to-print의 pageStyle 문자열 등, head 맨 끝에 추가로 심을 CSS. */
  extraCss?: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function buildPrintDocument({
  root,
  title,
  extraCss,
}: BuildPrintDocumentInput): string {
  const headParts: string[] = [
    '<meta charset="UTF-8">',
    `<title>${escapeHtml(title)}</title>`,
  ];

  return [
    "<!DOCTYPE html>",
    "<html>",
    "<head>",
    ...headParts,
    "</head>",
    `<body>${root.outerHTML}</body>`,
    "</html>",
  ].join("\n");
}
