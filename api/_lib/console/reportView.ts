// W9b 리포트 보기 전용. 서비스마다 다른 리포트 JSON 에서 읽을 수 있는 글만 뽑아 제목과 문단으로 만든다.
// 화면은 이 글만 그리고 인쇄와 내려받기는 두지 않는다.

export interface ReportSection {
  title: string;
  text: string;
}

const MAX_TEXT = 4000;
// 글이 아니라 구조를 나타내는 키.
const META_KEYS = new Set([
  "title",
  "id",
  "status",
  "format",
  "badge",
  "evidence_ids",
]);

/** JSON 안의 문장을 줄바꿈으로 이어 붙인다. 숫자와 불리언, 빈 값은 건너뛴다. */
export function flattenText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map(flattenText).filter(Boolean).join("\n");
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).map(flattenText).filter(Boolean).join("\n");
  }
  return "";
}

/** 제목이 있는 항목 배열({title, body})은 항목마다, 그 밖의 값은 한 문단으로. 글이 없는 항목은 뺀다. */
export function reportSections(sections: unknown): ReportSection[] {
  const clip = (s: string) => s.slice(0, MAX_TEXT);
  if (Array.isArray(sections)) {
    return sections
      .map((item): ReportSection => {
        const obj = (
          typeof item === "object" && item !== null ? item : {}
        ) as Record<string, unknown>;
        const rest = Object.fromEntries(
          Object.entries(obj).filter(([key]) => !META_KEYS.has(key)),
        );
        const title = obj.title;
        return {
          title: typeof title === "string" ? title : "",
          text: clip(flattenText(rest)),
        };
      })
      .filter((s) => s.text !== "");
  }
  const text = clip(flattenText(sections));
  return text ? [{ title: "", text }] : [];
}
