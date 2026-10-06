// 성장설계 활동 업로드 추출 프롬프트와 파싱 테스트(명세 No.42, 43, 122, 145).
import { describe, expect, test, vi } from "vitest";

vi.mock("mammoth", () => ({
  default: {
    extractRawText: vi.fn(async ({ buffer }: { buffer: Buffer }) => ({
      value: `docx:${buffer.length}`,
    })),
  },
}));

import {
  buildExtractionPrompt,
  EXTRACTION_FIELDS,
  EXTRACTION_RESPONSE_SCHEMA,
  MAX_UPLOAD_BYTES,
  parseExtractionResponse,
  textFromUpload,
  toActivityRecordFromExtraction,
  validateUploadRequest,
} from "./extraction.js";

const validBody = {
  fileName: "탐구보고서.pdf",
  mimeType: "application/pdf",
  byteSize: 1024,
  gradeLabel: "고2",
  semester: 1,
  consent: true,
};

describe("validateUploadRequest", () => {
  test("허용 mime 과 정상 본문은 ok 이고 확장자 종류가 붙는다", () => {
    const r = validateUploadRequest(validBody);
    expect(r).toEqual({ ok: true, value: { ...validBody, ext: "pdf" } });
  });

  test("허용 목록 밖 mime 은 UNSUPPORTED_MIME", () => {
    const r = validateUploadRequest({
      ...validBody,
      mimeType: "application/zip",
    });
    expect(r).toMatchObject({ ok: false, code: "UNSUPPORTED_MIME" });
  });

  test("크기 상한 경계는 허용하고 초과는 FILE_TOO_LARGE", () => {
    expect(
      validateUploadRequest({ ...validBody, byteSize: MAX_UPLOAD_BYTES }).ok,
    ).toBe(true);
    expect(
      validateUploadRequest({ ...validBody, byteSize: MAX_UPLOAD_BYTES + 1 }),
    ).toMatchObject({
      ok: false,
      code: "FILE_TOO_LARGE",
    });
  });

  test("크기 0 이하와 정수가 아닌 값은 INVALID_BODY", () => {
    expect(validateUploadRequest({ ...validBody, byteSize: 0 })).toMatchObject({
      ok: false,
      code: "INVALID_BODY",
    });
    expect(
      validateUploadRequest({ ...validBody, byteSize: "10" }),
    ).toMatchObject({ ok: false, code: "INVALID_BODY" });
  });

  test("동의 누락과 false 는 INVALID_BODY 이고 사유는 동의 필요", () => {
    const { consent: _c, ...noConsent } = validBody;
    expect(validateUploadRequest(noConsent)).toMatchObject({
      ok: false,
      code: "INVALID_BODY",
      reason: "동의 필요",
    });
    expect(
      validateUploadRequest({ ...validBody, consent: false }),
    ).toMatchObject({
      ok: false,
      code: "INVALID_BODY",
      reason: "동의 필요",
    });
  });

  test("파일명 비어 있음, 학년, 학기 오류는 INVALID_BODY", () => {
    expect(
      validateUploadRequest({ ...validBody, fileName: "  " }),
    ).toMatchObject({ ok: false, code: "INVALID_BODY" });
    expect(
      validateUploadRequest({ ...validBody, gradeLabel: "중3" }),
    ).toMatchObject({ ok: false, code: "INVALID_BODY" });
    expect(validateUploadRequest({ ...validBody, semester: 3 })).toMatchObject({
      ok: false,
      code: "INVALID_BODY",
    });
    expect(validateUploadRequest(null)).toMatchObject({
      ok: false,
      code: "INVALID_BODY",
    });
  });
});

describe("추출 스키마와 프롬프트", () => {
  const base = { fileName: "a.pdf", gradeLabel: "고2", semester: 1 } as const;

  test("스키마는 네 항목을 string 또는 null 로 요구하고 추가 속성을 막는다", () => {
    expect(EXTRACTION_FIELDS).toEqual([
      "topic",
      "concept",
      "result",
      "limitation",
    ]);
    expect(EXTRACTION_RESPONSE_SCHEMA.type).toBe("object");
    expect(Object.keys(EXTRACTION_RESPONSE_SCHEMA.properties)).toEqual([
      ...EXTRACTION_FIELDS,
    ]);
    expect(EXTRACTION_RESPONSE_SCHEMA.required).toEqual([...EXTRACTION_FIELDS]);
    expect(EXTRACTION_RESPONSE_SCHEMA.additionalProperties).toBe(false);
    expect(EXTRACTION_RESPONSE_SCHEMA.properties.topic.type).toEqual([
      "string",
      "null",
    ]);
  });

  test("system 에 네 항목 이름과 금지 지시가 들어간다", () => {
    const { system } = buildExtractionPrompt({ ...base, mode: "vision" });
    for (const f of EXTRACTION_FIELDS) expect(system).toContain(f);
    expect(system).toContain("null");
    expect(system).toContain("지어내지");
    expect(system).toContain("실명");
    expect(system).toContain("학교명");
    expect(system).toContain("요약");
  });

  test("text 모드는 원문을 user 에 넣고 20000자에서 자른다", () => {
    const text = "가".repeat(25000);
    const { user } = buildExtractionPrompt({ ...base, mode: "text", text });
    expect(user).toContain("가".repeat(20000));
    expect(user).not.toContain("가".repeat(20001));
  });

  test("vision 모드 user 에는 원문이 없고 학년과 학기가 들어간다", () => {
    const { user } = buildExtractionPrompt({
      ...base,
      mode: "vision",
      text: "무시될 원문",
    });
    expect(user).not.toContain("무시될 원문");
    expect(user).toContain("고2");
    expect(user).toContain("1학기");
  });
});

describe("parseExtractionResponse", () => {
  const full = {
    topic: "광합성",
    concept: "엽록소",
    result: "속도 증가",
    limitation: "표본 적음",
  };

  test("정상 JSON 은 네 항목을 돌려준다", () => {
    expect(parseExtractionResponse(JSON.stringify(full))).toEqual({
      ok: true,
      extracted: full,
    });
  });

  test("일부만 null 이어도 성공하고 null 로 유지된다", () => {
    const r = parseExtractionResponse(
      JSON.stringify({ ...full, limitation: null }),
    );
    expect(r).toEqual({ ok: true, extracted: { ...full, limitation: null } });
  });

  test("비JSON, 배열, 필드 누락, 전부 null 은 실패", () => {
    expect(parseExtractionResponse("not json").ok).toBe(false);
    expect(parseExtractionResponse("[]").ok).toBe(false);
    expect(parseExtractionResponse("null").ok).toBe(false);
    const { limitation: _l, ...missing } = full;
    expect(parseExtractionResponse(JSON.stringify(missing)).ok).toBe(false);
    const allNull = {
      topic: null,
      concept: null,
      result: null,
      limitation: null,
    };
    expect(parseExtractionResponse(JSON.stringify(allNull)).ok).toBe(false);
    const allBlank = {
      topic: " ",
      concept: "",
      result: null,
      limitation: "\n",
    };
    expect(parseExtractionResponse(JSON.stringify(allBlank)).ok).toBe(false);
  });

  test("문자열이 아닌 값이 섞이면 실패", () => {
    expect(
      parseExtractionResponse(JSON.stringify({ ...full, topic: 3 })).ok,
    ).toBe(false);
  });

  test("값은 trim 하고 빈 문자열은 null 로 바꾸며 1000자 초과는 자른다", () => {
    const raw = JSON.stringify({
      topic: "  주제  ",
      concept: "   ",
      result: "가".repeat(1500),
      limitation: null,
    });
    const r = parseExtractionResponse(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.extracted.topic).toBe("주제");
    expect(r.extracted.concept).toBeNull();
    expect(r.extracted.result).toBe("가".repeat(1000));
  });
});

describe("textFromUpload", () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  const DOCX =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  test("text/plain 은 UTF-8 로 디코드하고 BOM 을 제거한다", async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...enc("안녕 탐구")]);
    expect(await textFromUpload({ mimeType: "text/plain", bytes })).toEqual({
      kind: "text",
      text: "안녕 탐구",
    });
    expect(
      await textFromUpload({ mimeType: "text/plain", bytes: enc("BOM 없음") }),
    ).toEqual({
      kind: "text",
      text: "BOM 없음",
    });
  });

  test("docx 는 mammoth 변환 텍스트를 돌려준다", async () => {
    expect(
      await textFromUpload({ mimeType: DOCX, bytes: new Uint8Array(7) }),
    ).toEqual({ kind: "text", text: "docx:7" });
  });

  test("pdf 와 이미지는 binary, 그 외는 unsupported", async () => {
    const bytes = new Uint8Array(3);
    expect(
      await textFromUpload({ mimeType: "application/pdf", bytes }),
    ).toEqual({ kind: "binary" });
    expect(await textFromUpload({ mimeType: "image/png", bytes })).toEqual({
      kind: "binary",
    });
    expect(await textFromUpload({ mimeType: "image/jpeg", bytes })).toEqual({
      kind: "binary",
    });
    expect(
      await textFromUpload({ mimeType: "application/zip", bytes }),
    ).toEqual({ kind: "unsupported" });
  });
});

describe("toActivityRecordFromExtraction", () => {
  test("추출 결과를 draft 업로드 활동 행으로 바꾼다", () => {
    const extracted = {
      topic: "광합성",
      concept: null,
      result: "속도 증가",
      limitation: "표본 적음",
    };
    expect(
      toActivityRecordFromExtraction({
        profileId: "p1",
        uploadId: "u1",
        fileName: "보고서.pdf",
        gradeLabel: "고2",
        semester: 1,
        extracted,
      }),
    ).toEqual({
      profile_id: "p1",
      source_program: "upload",
      source_ref_id: "u1",
      status: "draft",
      grade_label: "고2",
      semester: 1,
      subject_group: null,
      subject: null,
      topic: "광합성",
      concept: null,
      method: null,
      result: "속도 증가",
      limitation: "표본 적음",
      numbers: null,
      sources: [{ type: "upload", file: "보고서.pdf" }],
    });
  });
});
