// 지식 DB 편집 폼 작성 안내의 순수 함수.

/** 카드 핵심 내용 권장 분량(글자). */
export const RECOMMENDED_CONTENT_CHARS = 500;

/** 내용 필드 옆에 붙이는 글자 수 안내. */
export function contentLengthHelp(content: unknown): string {
  const length = typeof content === "string" ? content.length : 0;
  return `현재 ${length.toLocaleString("ko-KR")}자, 권장 ${RECOMMENDED_CONTENT_CHARS}자 안팎`;
}
