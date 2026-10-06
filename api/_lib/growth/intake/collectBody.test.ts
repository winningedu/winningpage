// intake/collectBody.ts 의 바디 검증을 확인한다.

import { describe, expect, test } from "vitest";
import { validateCollectBody } from "./collectBody.js";

const UPLOAD_ID = "98af95da-47bf-4cee-8a2e-7d70d07fb1c9";

describe("validateCollectBody commit", () => {
  test("summary 와 같은 바디를 받아 action 만 commit 으로 돌려준다", () => {
    expect(
      validateCollectBody({
        action: "commit",
        track: "고2",
        directGrades: { "고1-1": 2 },
        current: { grade: 2, semester: 1 },
      }),
    ).toEqual({
      ok: true,
      body: {
        action: "commit",
        track: "고2",
        directGrades: { "고1-1": 2 },
        current: { grade: 2, semester: 1 },
      },
    });
  });
  test("track 이 없으면 400 INVALID_BODY", () => {
    expect(validateCollectBody({ action: "commit" })).toMatchObject({
      ok: false,
      status: 400,
      code: "INVALID_BODY",
    });
  });
});

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
