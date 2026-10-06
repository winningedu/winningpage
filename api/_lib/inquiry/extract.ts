// 보고서 작성본에서 확정 적립 7항목을 뽑는다(명세 No.104, 173, 174, §6 6, 10). 순수 함수만 둔다.
import { MAX_EXTRACTED_NUMBERS } from "./constants.js";
import type { ActivityFields, SubmissionSections } from "./types.js";

const splitLines = (text: string): string[] => text.split(/\r?\n/);

/** 빈 줄(공백만 있는 줄 포함) 기준 첫 문단. 문단이 없으면 빈 문자열. */
export function firstParagraph(text: string): string {
  const paragraph = text
    .trim()
    .split(/\n[^\S\n]*\n/)
    .map((p) => p.trim())
    .find((p) => p !== "");
  return paragraph ?? "";
}

/** 줄 앞의 번호("1.", "1)")와 목록 기호("-", "*", 가운뎃점 계열)를 걷어 낸다. 뒤에 공백이 있을 때만. */
const BULLET_CHARS = `-*${String.fromCharCode(0x2022, 0xb7, 0x318d)}`;
const LIST_MARKER_RE = new RegExp(
  `^(?:\\d+[.)](?=\\s)|[${BULLET_CHARS}](?=\\s|$))\\s*`,
);

/**
 * Ⅵ절 첫 항목(§6 6). 목록처럼 줄이 여러 개면 첫 줄이고,
 * 한 줄뿐이면 "다." 로 끝나는 첫 문장(없으면 그 줄 전체).
 */
export function firstItem(text: string): string {
  const items = splitLines(text)
    .map((line) => line.trim().replace(LIST_MARKER_RE, "").trim())
    .filter((line) => line !== "");
  const first = items[0];
  if (first === undefined) return "";
  if (items.length > 1) return first;
  return first.match(/^.*?다\.(?=\s|$)/)?.[0] ?? first;
}

/** 아라비아 숫자가 든 문장(마침표, 물음표, 느낌표, 줄바꿈 기준). 상한을 넘으면 앞에서부터 자른다. */
export function sentencesWithNumbers(text: string): string[] {
  const out: string[] = [];
  for (const line of splitLines(text)) {
    for (const sentence of line.split(/(?<=[.?!])\s+/)) {
      const trimmed = sentence.trim();
      if (trimmed !== "" && /[0-9]/.test(trimmed)) out.push(trimmed);
    }
  }
  return out.slice(0, MAX_EXTRACTED_NUMBERS);
}

/** Ⅷ절의 비어 있지 않은 줄. */
export function sourceLines(text: string): string[] {
  return splitLines(text)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

type TextField = "topic" | "concept" | "method" | "result" | "limitation";
const TEXT_FIELDS: readonly TextField[] = [
  "topic",
  "concept",
  "method",
  "result",
  "limitation",
];

/** 7항목 추출. 비어 있는 텍스트 항목은 missing 으로 알려 직접 입력을 요청한다(No.174). */
export function extractActivityFields(input: {
  topicTitle: string;
  concepts: string[];
  sections: SubmissionSections;
}): { fields: ActivityFields; missing: (keyof ActivityFields)[] } {
  const { sections } = input;
  const fields: ActivityFields = {
    topic: input.topicTitle.trim(),
    concept: input.concepts
      .map((c) => c.trim())
      .filter((c) => c !== "")
      .join(", "),
    method: firstParagraph(sections.III),
    result: firstParagraph(sections.IV),
    limitation: firstItem(sections.VI),
    numbers: [
      ...sentencesWithNumbers(sections.IV),
      ...sentencesWithNumbers(sections.V),
    ].slice(0, MAX_EXTRACTED_NUMBERS),
    sources: sourceLines(sections.VIII),
  };
  const missing = TEXT_FIELDS.filter((key) => fields[key] === "");
  return { fields, missing };
}

/** 문자열 배열이면 trim 하고 빈 항목을 버려 돌려준다. 없으면 빈 배열, 형식이 틀리면 null. */
function cleanStringArray(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  if (!value.every((v) => typeof v === "string")) return null;
  return value.map((v: string) => v.trim()).filter((v) => v !== "");
}

/** 클라이언트가 고쳐 보낸 7항목 검증(No.104). text 5개는 trim 1자 이상이어야 한다. */
export function validateFinalFields(
  input: unknown,
): { ok: true; fields: ActivityFields } | { ok: false; missing: string[] } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, missing: [...TEXT_FIELDS] };
  }
  const record = input as Record<string, unknown>;
  const missing: string[] = [];

  const texts = {} as Record<TextField, string>;
  for (const key of TEXT_FIELDS) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") {
      texts[key] = value.trim();
    } else {
      missing.push(key);
    }
  }
  const numbers = cleanStringArray(record.numbers);
  if (numbers === null) missing.push("numbers");
  const sources = cleanStringArray(record.sources);
  if (sources === null) missing.push("sources");

  if (missing.length > 0 || numbers === null || sources === null) {
    return { ok: false, missing };
  }
  return { ok: true, fields: { ...texts, numbers, sources } };
}
