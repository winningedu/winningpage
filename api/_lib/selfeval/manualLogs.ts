import { SCHOOL_NAME_PATTERN } from "./dictionaries.js";

// 수기 수행보고 메모의 순수 규칙(명세 No.158~161, 90, 91, 140). DB 와 모델 호출은 하지 않는다.

const pad = (n: number) => String(n).padStart(2, "0");

function lastDayOfFebruary(year: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return leap ? 29 : 28;
}

/** 학년도 창. 학년도 Y 는 Y년 3월 1일부터 Y+1년 2월 말일까지다(한국 날짜, 명세 No.140). */
export function academicYearWindow(year: number): {
  start: string;
  end: string;
} {
  return {
    start: `${year}-03-01`,
    end: `${year + 1}-02-${pad(lastDayOfFebruary(year + 1))}`,
  };
}

/** 작성일(YYYY-MM-DD)이 학년도 창 안인지. 형식이 같은 문자열이라 사전순 비교로 충분하다. */
export function isInAcademicYear(date: string, year: number): boolean {
  const { start, end } = academicYearWindow(year);
  return date >= start && date <= end;
}

/** 메모 한 건의 최대 글자 수(명세 No.159). */
export const MEMO_MAX_CHARS = 300;

/**
 * 학교생활기록부 양식 낱말(명세 No.91). 앞의 둘은 명세 예시이고, 나머지는 학교생활기록부의
 * 표준 영역 제목이다. 읽은 글에 하나라도 있으면 업로드 전체를 거절한다.
 */
export const RECORD_BOOK_WORDS: readonly string[] = [
  "세부능력 및 특기사항",
  "행동특성 및 종합의견",
  "창의적 체험활동상황",
  "교과학습발달상황",
  "출결상황",
  "수상경력",
  "자격증 및 인증 취득상황",
  "독서활동상황",
];

const squash = (v: string) => v.replace(/\s+/g, "");

/** 글에 생활기록부 양식 낱말이 있으면 그 낱말을, 없으면 null 을 돌려준다. 공백 차이는 무시한다. */
export function detectRecordBook(text: string): string | null {
  const flat = squash(text);
  return RECORD_BOOK_WORDS.find((w) => flat.includes(squash(w))) ?? null;
}

/** 300자를 넘는 글을 문장 끝에서 나눈다. 문장 하나가 300자를 넘으면 글자 수로 자른다. 내용은 잃지 않는다. */
export function splitMemoText(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((x) => x.trim())
    .filter((x) => x !== "");
  const out: string[] = [];
  let cur = "";
  const flush = () => {
    if (cur !== "") out.push(cur);
    cur = "";
  };
  for (const sentence of sentences) {
    if (sentence.length > MEMO_MAX_CHARS) {
      flush();
      for (let i = 0; i < sentence.length; i += MEMO_MAX_CHARS) {
        out.push(sentence.slice(i, i + MEMO_MAX_CHARS));
      }
      continue;
    }
    if (cur !== "" && cur.length + 1 + sentence.length > MEMO_MAX_CHARS) {
      flush();
    }
    cur = cur === "" ? sentence : `${cur} ${sentence}`;
  }
  flush();
  return out;
}

export type ExtractedMemo = { writtenAt: string | null; text: string };

export type Extraction =
  | { ok: true; memos: ExtractedMemo[]; containsPersonName: boolean }
  | { ok: false };

function validDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

/** 모델이 돌려준 JSON 문자열을 메모 목록과 사람 이름 표시로 바꾼다. 긴 메모는 나눈다. */
export function parseExtraction(raw: string): Extraction {
  const body = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { ok: false };
  }
  if (typeof json !== "object" || json === null) return { ok: false };
  const { memos, contains_person_name } = json as Record<string, unknown>;
  if (!Array.isArray(memos)) return { ok: false };
  const out: ExtractedMemo[] = [];
  for (const item of memos) {
    if (typeof item !== "object" || item === null) continue;
    const { written_at, text } = item as Record<string, unknown>;
    if (typeof text !== "string") continue;
    const writtenAt = validDate(written_at);
    for (const part of splitMemoText(text)) out.push({ writtenAt, text: part });
  }
  if (out.length === 0) return { ok: false };
  return {
    ok: true,
    memos: out,
    containsPersonName: contains_person_name === true,
  };
}

/** 학교 이름이 보이거나 모델이 사람 이름을 봤으면 학생에게 지우거나 바꾸라고 안내한다(명세 No.90). */
export function needsNameNotice(text: string, containsPersonName: boolean) {
  return containsPersonName || SCHOOL_NAME_PATTERN.test(text);
}
