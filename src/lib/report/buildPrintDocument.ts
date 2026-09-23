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

function serializeHtmlAttributes(htmlEl: HTMLElement): string {
  const parts: string[] = [];
  const lang = htmlEl.getAttribute("lang");
  if (lang) parts.push(`lang="${escapeHtml(lang)}"`);
  const className = htmlEl.getAttribute("class");
  if (className) parts.push(`class="${escapeHtml(className)}"`);
  for (const attr of Array.from(htmlEl.attributes)) {
    if (attr.name.startsWith("data-")) {
      parts.push(`${attr.name}="${escapeHtml(attr.value)}"`);
    }
  }
  return parts.length ? ` ${parts.join(" ")}` : "";
}

/** root를 그대로 쓰지 않고 복제본에서 <script>를 제거한 뒤 outerHTML을 뽑는다 —
 * 이 문서는 절대 <script>를 포함해선 안 된다(서버는 setJavaScriptEnabled(false)로
 * 실행 자체를 한 번 더 막지만, 그 전에 마크업 단계에서도 넣지 않는다). */
function serializeWithoutScripts(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;
  for (const script of Array.from(clone.querySelectorAll("script"))) {
    script.remove();
  }
  return clone.outerHTML;
}

export function buildPrintDocument({
  root,
  title,
  extraCss,
}: BuildPrintDocumentInput): string {
  const doc = root.ownerDocument;
  const win = doc.defaultView;

  const styleTags = Array.from(
    doc.querySelectorAll<HTMLLinkElement | HTMLStyleElement>(
      'link[rel="stylesheet"], style',
    ),
  ).map((node) => {
    if (node.tagName === "LINK") {
      // .href는 document.baseURI 기준으로 이미 절대 URL을 반환한다.
      return `<link rel="stylesheet" href="${escapeHtml((node as HTMLLinkElement).href)}">`;
    }
    return `<style>${node.textContent ?? ""}</style>`;
  });

  const headParts: string[] = [
    '<meta charset="UTF-8">',
    ...(win ? [`<base href="${escapeHtml(win.location.origin)}/">`] : []),
    `<title>${escapeHtml(title)}</title>`,
    ...styleTags,
    ...(extraCss ? [`<style>${extraCss}</style>`] : []),
  ];

  return [
    "<!DOCTYPE html>",
    `<html${serializeHtmlAttributes(doc.documentElement)}>`,
    "<head>",
    ...headParts,
    "</head>",
    `<body>${serializeWithoutScripts(root)}</body>`,
    "</html>",
  ].join("\n");
}
