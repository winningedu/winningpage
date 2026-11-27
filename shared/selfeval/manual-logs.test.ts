// 자기평가서 수기 메모 계약: 요청 본문과 응답 스키마.

import { describe, expect, test } from "vitest";
import {
  manualLogsBody,
  manualLogsListResponseSchema,
  manualLogsMemoResponseSchema,
  manualLogsUploadResponseSchema,
  manualMemoSchema,
} from "./manual-logs.js";

const SID = "11111111-1111-4111-8111-111111111111";
const MID = "22222222-2222-4222-8222-222222222222";

const memo = {
  id: MID,
  writtenAt: "2026-04-03",
  text: "광합성 실험",
  ocr: false,
  confirmed: false,
  included: true,
  nameNotice: false,
};

describe("manualLogsBody", () => {
  test("list 는 세션 id 만 있으면 된다", () => {
    const body = { sessionId: SID, action: "list" };
    expect(manualLogsBody.parse(body)).toEqual(body);
  });

  test("세션 id 나 동작이 이상하면 거절한다", () => {
    for (const body of [
      null,
      { action: "list" },
      { sessionId: "x", action: "list" },
      { sessionId: SID, action: "nope" },
      { sessionId: SID },
    ]) {
      expect(manualLogsBody.safeParse(body).success).toBe(false);
    }
  });

  test("upload 는 글이나 파일 하나의 모양을 받는다(길이, 형식 규칙은 서버가 본다)", () => {
    const text = { sessionId: SID, action: "upload", text: "오늘 실험" };
    expect(manualLogsBody.parse(text)).toEqual(text);
    const file = {
      sessionId: SID,
      action: "upload",
      file: { mimeType: "application/pdf", data: "AAAA" },
    };
    expect(manualLogsBody.parse(file)).toEqual(file);
    expect(
      manualLogsBody.safeParse({ ...file, file: { mimeType: "a" } }).success,
    ).toBe(false);
    expect(
      manualLogsBody.safeParse({ sessionId: SID, action: "upload", text: 1 })
        .success,
    ).toBe(false);
  });

  test("update 는 메모 id 와 바꿀 값을 받는다", () => {
    const body = {
      sessionId: SID,
      action: "update",
      memoId: MID,
      writtenAt: "2026-04-03",
      text: "고친 글",
      confirmed: true,
    };
    expect(manualLogsBody.parse(body)).toEqual(body);
  });

  test("update 의 날짜 형식과 값 형식을 막는다", () => {
    const base = { sessionId: SID, action: "update", memoId: MID };
    for (const extra of [
      { writtenAt: "4월 3일" },
      { writtenAt: "2026-02-30" },
      { text: 3 },
      { confirmed: "yes" },
    ]) {
      expect(manualLogsBody.safeParse({ ...base, ...extra }).success).toBe(
        false,
      );
    }
    expect(manualLogsBody.safeParse({ ...base, memoId: "x" }).success).toBe(
      false,
    );
  });

  test("set-included 와 delete", () => {
    const base = { sessionId: SID, memoId: MID };
    expect(
      manualLogsBody.safeParse({
        ...base,
        action: "set-included",
        included: false,
      }).success,
    ).toBe(true);
    expect(
      manualLogsBody.safeParse({ ...base, action: "set-included" }).success,
    ).toBe(false);
    expect(
      manualLogsBody.safeParse({ ...base, action: "delete" }).success,
    ).toBe(true);
  });
});

describe("응답 스키마", () => {
  test("메모 한 건과 목록, 업로드, 단건 응답은 ok 필드 없이 받는다", () => {
    expect(manualMemoSchema.parse(memo)).toEqual(memo);
    expect(manualLogsListResponseSchema.parse({ memos: [memo] })).toEqual({
      memos: [memo],
    });
    const upload = { memos: [memo], personNameDetected: true };
    expect(manualLogsUploadResponseSchema.parse(upload)).toEqual(upload);
    expect(manualLogsMemoResponseSchema.parse({ memo })).toEqual({ memo });
  });

  test("필드가 빠진 메모는 거절한다", () => {
    const { nameNotice: _n, ...rest } = memo;
    expect(manualMemoSchema.safeParse(rest).success).toBe(false);
  });
});
