// api/growth/collect.ts 의 순수 함수만 검증한다. 핸들러 본문은 DB, Storage, Gemini 에 묶여 있어
// 로컬 스택 QA 로 확인한다(diagnosis/report.test.ts 와 같은 방침).

import { describe, expect, test } from "vitest";
import {
  buildExtractOutcome,
  decideExtractionMode,
  toActivityView,
  uploadObjectPath,
  validateCollectBody,
} from "./collect.js";

const UPLOAD_ID = "98af95da-47bf-4cee-8a2e-7d70d07fb1c9";

describe("validateCollectBody summary", () => {
  test("track 만 있으면 directGrades 는 null 로 정규화한다", () => {
    const r = validateCollectBody({ action: "summary", track: "고2" });
    expect(r).toEqual({
      ok: true,
      body: {
        action: "summary",
        track: "고2",
        directGrades: null,
        current: undefined,
      },
    });
  });

  test("범위 밖 track 은 400 INVALID_BODY", () => {
    const r = validateCollectBody({ action: "summary", track: "고4" });
    expect(r).toMatchObject({ ok: false, status: 400, code: "INVALID_BODY" });
  });
});

describe("validateCollectBody action", () => {
  test("모르는 action 은 400 INVALID_BODY", () => {
    const r = validateCollectBody({ action: "delete", track: "고2" });
    expect(r).toMatchObject({ ok: false, status: 400, code: "INVALID_BODY" });
  });
  test("바디가 객체가 아니면 400 INVALID_BODY", () => {
    expect(validateCollectBody(null)).toMatchObject({
      ok: false,
      code: "INVALID_BODY",
    });
  });
});

describe("validateCollectBody summary 성적과 현재 학기", () => {
  test("directGrades 는 1~9 숫자 또는 null 을 받는다", () => {
    const r = validateCollectBody({
      action: "summary",
      track: "고2",
      directGrades: { "고1-1": 2.5, "고1-2": null },
    });
    expect(r).toMatchObject({
      ok: true,
      body: { directGrades: { "고1-1": 2.5, "고1-2": null } },
    });
  });
  test("directGrades 값이 범위 밖이면 400", () => {
    for (const v of [0, 9.5, "3", NaN]) {
      const r = validateCollectBody({
        action: "summary",
        track: "고2",
        directGrades: { "고1-1": v },
      });
      expect(r).toMatchObject({ ok: false, code: "INVALID_BODY" });
    }
  });
  test("directGrades 키가 학기 키가 아니면 400", () => {
    const r = validateCollectBody({
      action: "summary",
      track: "고2",
      directGrades: { "고4-1": 2 },
    });
    expect(r).toMatchObject({ ok: false, code: "INVALID_BODY" });
  });
  test("current 는 학년 1~3, 학기 1~2 만 받는다", () => {
    expect(
      validateCollectBody({
        action: "summary",
        track: "고2",
        current: { grade: 2, semester: 1 },
      }),
    ).toMatchObject({ ok: true, body: { current: { grade: 2, semester: 1 } } });
    expect(
      validateCollectBody({
        action: "summary",
        track: "고2",
        current: { grade: 4, semester: 1 },
      }),
    ).toMatchObject({ ok: false, code: "INVALID_BODY" });
  });
});

const validUpload = {
  fileName: "탐구보고서.pdf",
  mimeType: "application/pdf",
  byteSize: 1024,
  gradeLabel: "고1",
  semester: 2,
  consent: true,
};

describe("validateCollectBody upload-url", () => {
  test("정상 업로드 요청은 ext 를 붙여 돌려준다", () => {
    const r = validateCollectBody({ action: "upload-url", ...validUpload });
    expect(r).toMatchObject({
      ok: true,
      body: {
        action: "upload-url",
        upload: { ext: "pdf", gradeLabel: "고1", semester: 2 },
      },
    });
  });
  test("검증 실패 코드와 상태를 그대로 위임한다", () => {
    expect(
      validateCollectBody({
        action: "upload-url",
        ...validUpload,
        mimeType: "video/mp4",
      }),
    ).toMatchObject({ ok: false, status: 415, code: "UNSUPPORTED_MIME" });
    expect(
      validateCollectBody({
        action: "upload-url",
        ...validUpload,
        byteSize: 11 * 1024 * 1024,
      }),
    ).toMatchObject({ ok: false, status: 413, code: "FILE_TOO_LARGE" });
    expect(
      validateCollectBody({
        action: "upload-url",
        ...validUpload,
        consent: false,
      }),
    ).toMatchObject({ ok: false, status: 400, code: "INVALID_BODY" });
  });
});

describe("validateCollectBody extract", () => {
  test("uuid 형식 uploadId 를 받는다", () => {
    expect(
      validateCollectBody({ action: "extract", uploadId: UPLOAD_ID }),
    ).toEqual({
      ok: true,
      body: { action: "extract", uploadId: UPLOAD_ID },
    });
  });
  test("uuid 가 아니면 400", () => {
    expect(
      validateCollectBody({ action: "extract", uploadId: "abc" }),
    ).toMatchObject({
      ok: false,
      status: 400,
      code: "INVALID_BODY",
    });
  });
});

describe("uploadObjectPath", () => {
  test("사용자/회차/업로드.확장자 형식으로 만든다", () => {
    expect(uploadObjectPath("u1", "r1", "up1", "pdf")).toBe("u1/r1/up1.pdf");
  });
});

describe("decideExtractionMode", () => {
  test("text 는 text, binary 는 vision, unsupported 는 unsupported", () => {
    expect(decideExtractionMode({ kind: "text", text: "x" })).toBe("text");
    expect(decideExtractionMode({ kind: "binary" })).toBe("vision");
    expect(decideExtractionMode({ kind: "unsupported" })).toBe("unsupported");
  });
});

describe("buildExtractOutcome", () => {
  const ctx = {
    uploadId: UPLOAD_ID,
    profileId: "p1",
    fileName: "a.pdf",
    gradeLabel: "고1",
    semester: 2,
    now: "2026-10-06T00:00:00.000Z",
  };
  const extracted = {
    topic: "주제",
    concept: null,
    result: "결과",
    limitation: null,
  };

  test("추출 성공이면 ok 갱신, 활동 행, 응답을 만든다", () => {
    const o = buildExtractOutcome({ ok: true, extracted }, ctx);
    expect(o.uploadUpdate).toEqual({
      extraction_status: "ok",
      extracted,
      updated_at: ctx.now,
    });
    expect(o.activityRow).toMatchObject({
      profile_id: "p1",
      source_program: "upload",
      source_ref_id: UPLOAD_ID,
      status: "draft",
      topic: "주제",
    });
    expect(o.response).toEqual({
      ok: true,
      uploadId: UPLOAD_ID,
      status: "ok",
      extracted,
    });
  });

  test("추출 실패면 failed 갱신과 사유 응답을 만들고 활동 행은 없다", () => {
    const o = buildExtractOutcome({ ok: false, reason: "JSON 파싱 실패" }, ctx);
    expect(o.uploadUpdate).toEqual({
      extraction_status: "failed",
      extraction_error: "JSON 파싱 실패",
      updated_at: ctx.now,
    });
    expect(o.activityRow).toBeNull();
    expect(o.response).toEqual({
      ok: true,
      uploadId: UPLOAD_ID,
      status: "failed",
      error: "JSON 파싱 실패",
    });
  });
});

describe("toActivityView", () => {
  test("planned 를 빼고 응답용 키로 바꾼다", () => {
    const base = {
      grade_label: "고1" as const,
      semester: 1 as const,
      subject_group: "수학",
      subject: "수학I",
      topic: "함수",
    };
    const out = toActivityView([
      {
        id: "a",
        source_program: "self" as const,
        status: "draft" as const,
        ...base,
      },
      {
        id: "b",
        source_program: "manual" as const,
        status: "planned" as const,
        ...base,
      },
    ]);
    expect(out).toEqual([
      {
        id: "a",
        source: "self",
        status: "draft",
        gradeLabel: "고1",
        semester: 1,
        subjectGroup: "수학",
        subject: "수학I",
        topic: "함수",
      },
    ]);
  });
});
