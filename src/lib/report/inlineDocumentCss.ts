// 배포 뒤에 해시가 바뀐 CSS(/assets/index-<hash>.css)는 이전 URL이 404가 된다.
// 화면은 이미 메모리에 올라온 CSS로 멀쩡해 보이지만, 인쇄(react-to-print iframe)와
// 서버 PDF 문서가 URL로 다시 받으면 스타일 없이 나온다. 그래서 이미 로드된 시트의
// 규칙 텍스트를 읽어 URL 없이 인라인한다.

/** 시트의 규칙 텍스트. 교차 출처 등으로 규칙을 읽을 수 없으면 null. */
export function readSheetCss(sheet: CSSStyleSheet | null): string | null {
  if (!sheet) return null;
  try {
    return Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n");
  } catch {
    return null;
  }
}

/** 문서 순서대로 이어붙인 현재 문서의 CSS. 읽을 수 없는 시트는 건너뛴다. */
export function inlineDocumentCss(doc: Document): string {
  return Array.from(doc.styleSheets, readSheetCss)
    .filter((css): css is string => css !== null)
    .join("\n");
}
