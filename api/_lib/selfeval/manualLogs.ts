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

// ---------------------------------------------------------------------------
// 요청 바디
// ---------------------------------------------------------------------------

/** 붙여넣은 글의 최대 글자 수. 한 번의 모델 호출로 처리할 수 있는 양으로 묶는다. */
export const PASTE_MAX_CHARS = 6000;

/** 파일 한 건의 원본 최대 바이트. base64 로 부풀어도 Vercel 본문 4.5MB 안에 든다. */
export const FILE_MAX_BYTES = 3 * 1024 * 1024;

export const ALLOWED_FILE_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];

export type UploadFile = { mimeType: string; data: string };

export type ManualLogsBody =
  | { sessionId: string; action: "list" }
  | { sessionId: string; action: "upload"; text?: string; file?: UploadFile }
  | {
      sessionId: string;
      action: "update";
      memoId: string;
      writtenAt?: string;
      text?: string;
      confirmed?: boolean;
    }
  | {
      sessionId: string;
      action: "set-included";
      memoId: string;
      included: boolean;
    }
  | { sessionId: string; action: "delete"; memoId: string };

export type ManualLogsValidation =
  | { ok: true; body: ManualLogsBody }
  | { ok: false; code: string; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const bad = (code: string, message: string): ManualLogsValidation => ({
  ok: false,
  code,
  message,
});
const invalid = () => bad("INVALID_BODY", "요청 형식이 올바르지 않아요.");

function decodedBytes(base64: string): number {
  const pad = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - pad;
}

function validateUpload(
  sessionId: string,
  b: Record<string, unknown>,
): ManualLogsValidation {
  const text = typeof b.text === "string" ? b.text.trim() : "";
  const hasFile = b.file !== undefined && b.file !== null;
  if ((text === "") === !hasFile) {
    return bad(
      "UPLOAD_INPUT",
      "글을 붙여넣거나 파일 하나를 올려 주세요. 둘을 함께 올릴 수는 없어요.",
    );
  }
  if (!hasFile) {
    if (text.length > PASTE_MAX_CHARS) {
      return bad(
        "TEXT_TOO_LONG",
        `한 번에 ${PASTE_MAX_CHARS}자까지 붙여넣을 수 있어요. 나눠서 올려 주세요.`,
      );
    }
    return { ok: true, body: { sessionId, action: "upload", text } };
  }
  const f = b.file as Record<string, unknown>;
  if (typeof f.mimeType !== "string" || typeof f.data !== "string") {
    return invalid();
  }
  if (!ALLOWED_FILE_TYPES.includes(f.mimeType)) {
    return bad(
      "FILE_TYPE",
      "사진(JPG, PNG, WEBP, HEIC)이나 PDF 파일만 올릴 수 있어요.",
    );
  }
  if (!BASE64.test(f.data)) {
    return bad("FILE_INVALID", "파일을 읽지 못했어요. 다시 올려 주세요.");
  }
  if (decodedBytes(f.data) > FILE_MAX_BYTES) {
    return bad("FILE_TOO_LARGE", "파일은 3MB까지 올릴 수 있어요.");
  }
  return {
    ok: true,
    body: {
      sessionId,
      action: "upload",
      file: { mimeType: f.mimeType, data: f.data },
    },
  };
}

function validateUpdate(
  sessionId: string,
  memoId: string,
  b: Record<string, unknown>,
): ManualLogsValidation {
  const out: ManualLogsBody & { action: "update" } = {
    sessionId,
    action: "update",
    memoId,
  };
  if (b.writtenAt !== undefined) {
    if (validDate(b.writtenAt) === null) {
      return bad("INVALID_BODY", "날짜는 YYYY-MM-DD 형식이어야 해요.");
    }
    out.writtenAt = b.writtenAt as string;
  }
  if (b.text !== undefined) {
    if (typeof b.text !== "string" || b.text.trim() === "") {
      return bad("TEXT_REQUIRED", "메모 글을 비워 둘 수 없어요.");
    }
    if (b.text.length > MEMO_MAX_CHARS) {
      return bad(
        "TEXT_TOO_LONG",
        `메모는 ${MEMO_MAX_CHARS}자까지 쓸 수 있어요. 나눠서 적어 주세요.`,
      );
    }
    out.text = b.text;
  }
  if (b.confirmed !== undefined) {
    if (typeof b.confirmed !== "boolean") return invalid();
    out.confirmed = b.confirmed;
  }
  return { ok: true, body: out };
}

export function validateManualLogsBody(raw: unknown): ManualLogsValidation {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return invalid();
  }
  const b = raw as Record<string, unknown>;
  const { sessionId, action } = b;
  if (typeof sessionId !== "string" || !UUID.test(sessionId)) return invalid();
  if (action === "list") return { ok: true, body: { sessionId, action } };
  if (action === "upload") return validateUpload(sessionId, b);
  if (action !== "update" && action !== "set-included" && action !== "delete") {
    return invalid();
  }
  const memoId = b.memoId;
  if (typeof memoId !== "string" || !UUID.test(memoId)) return invalid();
  if (action === "update") return validateUpdate(sessionId, memoId, b);
  if (action === "delete") {
    return { ok: true, body: { sessionId, action, memoId } };
  }
  if (typeof b.included !== "boolean") return invalid();
  return {
    ok: true,
    body: { sessionId, action, memoId, included: b.included },
  };
}

// ---------------------------------------------------------------------------
// 확인 조건(명세 No.158)
// ---------------------------------------------------------------------------

export type ConfirmCheck =
  | { ok: true }
  | { ok: false; code: string; message: string };

/** 메모를 확인(근거로 사용 가능)으로 바꿀 수 있는지. 날짜가 있고 세션 학년도 안이어야 한다. */
export function checkConfirmable(
  memo: { writtenAt: string | null; text: string },
  academicYear: number | null,
): ConfirmCheck {
  if (memo.text.trim() === "") {
    return {
      ok: false,
      code: "TEXT_REQUIRED",
      message: "메모 글을 채워 주세요.",
    };
  }
  if (memo.writtenAt === null) {
    return {
      ok: false,
      code: "DATE_REQUIRED",
      message: "작성일을 직접 넣어야 확인할 수 있어요.",
    };
  }
  if (academicYear === null) {
    return {
      ok: false,
      code: "NO_ACADEMIC_YEAR",
      message:
        "이 자기평가서의 학년도를 알 수 없어요. 기본 입력을 먼저 저장해 주세요.",
    };
  }
  if (!isInAcademicYear(memo.writtenAt, academicYear)) {
    const { start, end } = academicYearWindow(academicYear);
    return {
      ok: false,
      code: "DATE_OUT_OF_YEAR",
      message: `${academicYear}학년도(${start}부터 ${end}까지) 안의 날짜만 쓸 수 있어요. 작성일을 고쳐 주세요.`,
    };
  }
  return { ok: true };
}
