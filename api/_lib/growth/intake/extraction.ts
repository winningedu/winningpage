// 성장설계 활동 업로드의 검증, 추출 프롬프트, 응답 파싱, 활동 행 변환(명세 No.42, 43, 122, 145).
// 순수 함수와 변환만 다루며 네트워크와 Gemini 호출은 호출자가 맡는다.
import mammoth from "mammoth";

export const ALLOWED_UPLOAD_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "text/plain": "txt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
};

// 가정: 명세에 상한이 없어 10MB 로 둔다.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const GRADE_LABELS = ["고1", "고2", "고3"] as const;
export type UploadGradeLabel = (typeof GRADE_LABELS)[number];

export interface UploadRequest {
  fileName: string;
  mimeType: string;
  byteSize: number;
  gradeLabel: UploadGradeLabel;
  semester: 1 | 2;
  consent: true;
}

export type UploadValidation =
  | { ok: true; value: UploadRequest & { ext: string } }
  | {
      ok: false;
      reason: string;
      code: "UNSUPPORTED_MIME" | "FILE_TOO_LARGE" | "INVALID_BODY";
    };

const invalid = (reason: string): UploadValidation => ({
  ok: false,
  reason,
  code: "INVALID_BODY",
});

function hasControlChar(text: string): boolean {
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export function validateUploadRequest(raw: unknown): UploadValidation {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return invalid("본문 형식 오류");
  const b = raw as Record<string, unknown>;
  if (typeof b.fileName !== "string") return invalid("파일명 필요");
  const fileName = b.fileName.trim();
  if (fileName === "" || fileName.length > 255)
    return invalid("파일명 길이 오류");
  // 제어 문자(U+0000~U+001F, U+007F)는 파일명에 허용하지 않는다.
  if (hasControlChar(fileName)) return invalid("파일명에 제어 문자 포함");
  if (typeof b.mimeType !== "string") return invalid("mimeType 필요");
  const ext = ALLOWED_UPLOAD_MIME[b.mimeType];
  if (ext === undefined)
    return {
      ok: false,
      reason: "지원하지 않는 형식",
      code: "UNSUPPORTED_MIME",
    };
  if (
    typeof b.byteSize !== "number" ||
    !Number.isInteger(b.byteSize) ||
    b.byteSize < 1
  ) {
    return invalid("파일 크기 오류");
  }
  if (b.byteSize > MAX_UPLOAD_BYTES)
    return { ok: false, reason: "파일이 너무 큼", code: "FILE_TOO_LARGE" };
  if (
    typeof b.gradeLabel !== "string" ||
    !(GRADE_LABELS as readonly string[]).includes(b.gradeLabel)
  ) {
    return invalid("학년 오류");
  }
  if (b.semester !== 1 && b.semester !== 2) return invalid("학기 오류");
  if (b.consent !== true) return invalid("동의 필요");
  return {
    ok: true,
    value: {
      fileName,
      mimeType: b.mimeType,
      byteSize: b.byteSize,
      gradeLabel: b.gradeLabel as UploadGradeLabel,
      semester: b.semester,
      consent: true,
      ext,
    },
  };
}

/**
 * 업로드 객체 경로. 업로드는 학생과 학기 단위라 회차(reportId)가 바뀌어도 객체를 찾을 수
 * 있어야 하므로 reportId 를 넣지 않는다. 크론도 DB 행(학생 id, 업로드 id, 확장자)만으로
 * 경로를 재구성한다.
 */
export function uploadObjectPath(
  userId: string,
  uploadId: string,
  ext: string,
): string {
  return `${userId}/${uploadId}.${ext}`;
}

/**
 * 추출 응답 최대 출력 토큰. 한국어 4항목이 각 1000자(VALUE_LIMIT)면 JSON 한 개가
 * 한글 4000자 안팎이라 모델 기본값 1800 과 2200 으로는 응답이 잘린다.
 */
export const EXTRACTION_MAX_OUTPUT_TOKENS = 4096;

export const EXTRACTION_FIELDS = [
  "topic",
  "concept",
  "result",
  "limitation",
] as const;
export type ExtractionField = (typeof EXTRACTION_FIELDS)[number];
export type Extracted = Record<ExtractionField, string | null>;

const nullableString = { type: ["string", "null"] } as const;

// Gemini responseSchema 용 JSON 스키마.
export const EXTRACTION_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    topic: nullableString,
    concept: nullableString,
    result: nullableString,
    limitation: nullableString,
  },
  required: [...EXTRACTION_FIELDS],
  additionalProperties: false,
} as const;

const TEXT_LIMIT = 20000;

export interface ExtractionPromptInput {
  fileName: string;
  gradeLabel: string;
  semester: number;
  mode: "vision" | "text";
  text?: string;
}

export function buildExtractionPrompt(input: ExtractionPromptInput): {
  system: string;
  user: string;
} {
  const system = [
    "너는 고등학생이 올린 활동 자료에서 항목을 옮겨 적는 도우미다.",
    "다음 네 항목만 추출한다.",
    "- topic: 탐구나 활동의 주제",
    "- concept: 활동에서 다룬 핵심 개념",
    "- result: 활동의 결과나 알게 된 점",
    "- limitation: 활동의 한계나 아쉬운 점",
    "자료에 없는 항목은 null 로 둔다.",
    "자료에 없는 내용을 지어내지 않는다.",
    "학생 실명과 학교명은 쓰지 않는다.",
    "원문을 요약하지 말고 항목에 맞게 그대로 옮긴다.",
    "응답은 위 네 항목을 키로 가진 JSON 객체 하나만 낸다.",
  ].join("\n");
  const head = `파일명: ${input.fileName}\n학년: ${input.gradeLabel}\n학기: ${input.semester}학기`;
  const user =
    input.mode === "text"
      ? `${head}\n\n[원문]\n${(input.text ?? "").slice(0, TEXT_LIMIT)}`
      : `${head}\n\n첨부된 파일에서 네 항목을 추출해 줘.`;
  return { system, user };
}

const VALUE_LIMIT = 1000;

export type ExtractionParse =
  | { ok: true; extracted: Extracted }
  | { ok: false; reason: string };

export function parseExtractionResponse(raw: string): ExtractionParse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "JSON 파싱 실패" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "객체가 아님" };
  }
  const obj = parsed as Record<string, unknown>;
  const extracted = {} as Extracted;
  for (const f of EXTRACTION_FIELDS) {
    const v = obj[f];
    if (v === undefined) return { ok: false, reason: `${f} 누락` };
    if (v !== null && typeof v !== "string")
      return { ok: false, reason: `${f} 형식 오류` };
    const t = v === null ? "" : v.trim().slice(0, VALUE_LIMIT);
    extracted[f] = t === "" ? null : t;
  }
  if (EXTRACTION_FIELDS.every((f) => extracted[f] === null)) {
    return { ok: false, reason: "추출된 항목 없음" };
  }
  return { ok: true, extracted };
}

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type UploadText =
  | { kind: "text"; text: string }
  | { kind: "binary" }
  | { kind: "unsupported" };

export async function textFromUpload(input: {
  mimeType: string;
  bytes: Uint8Array;
}): Promise<UploadText> {
  const { mimeType, bytes } = input;
  if (mimeType === "text/plain") {
    return {
      kind: "text",
      text: new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, ""),
    };
  }
  if (mimeType === DOCX_MIME) {
    const { value } = await mammoth.extractRawText({
      buffer: Buffer.from(bytes),
    });
    return { kind: "text", text: value };
  }
  if (
    mimeType === "application/pdf" ||
    mimeType === "image/png" ||
    mimeType === "image/jpeg"
  ) {
    return { kind: "binary" };
  }
  return { kind: "unsupported" };
}

export interface ActivityRecordFromExtractionInput {
  profileId: string;
  uploadId: string;
  fileName: string;
  gradeLabel: string;
  semester: number;
  extracted: Extracted;
}

export function toActivityRecordFromExtraction(
  input: ActivityRecordFromExtractionInput,
) {
  const { extracted } = input;
  return {
    profile_id: input.profileId,
    source_program: "upload" as const,
    source_ref_id: input.uploadId,
    status: "draft" as const,
    grade_label: input.gradeLabel,
    semester: input.semester,
    subject_group: null,
    subject: null,
    topic: extracted.topic,
    concept: extracted.concept,
    method: null,
    result: extracted.result,
    limitation: extracted.limitation,
    numbers: null,
    sources: [{ type: "upload" as const, file: input.fileName }],
  };
}
