import { describe, expect, test } from "vitest";
import type { ManualMemo } from "@/lib/selfeval/api";
import {
  canConfirm,
  checkUploadFile,
  draftOf,
  FILE_MAX_BYTES,
  fileToBase64,
  isDirty,
  MEMO_MAX_CHARS,
  NAME_NOTICE,
  RECORD_BOOK_NOTICE,
} from "./manualLogsLogic";

const memo = (over: Partial<ManualMemo> = {}): ManualMemo => ({
  id: "m1",
  writtenAt: "2026-04-03",
  text: "실험을 했다",
  ocr: true,
  confirmed: false,
  included: true,
  nameNotice: false,
  ...over,
});

describe("안내 문구", () => {
  test("생활기록부 안내는 하단 고지 문구와 같다", () => {
    expect(RECORD_BOOK_NOTICE).toBe("생활기록부 원문은 받지 않아요");
  });

  test("이름 안내는 지우거나 바꾸라고 말한다", () => {
    expect(NAME_NOTICE).toContain("지우거나");
  });
});

describe("checkUploadFile", () => {
  test("허용 형식과 크기면 통과다", () => {
    expect(checkUploadFile({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(
      checkUploadFile({ type: "application/pdf", size: FILE_MAX_BYTES }),
    ).toBeNull();
  });

  test("형식이 다르면 안내한다", () => {
    expect(checkUploadFile({ type: "application/zip", size: 10 })).toContain(
      "사진",
    );
  });

  test("3MB 를 넘으면 안내한다", () => {
    expect(
      checkUploadFile({ type: "image/png", size: FILE_MAX_BYTES + 1 }),
    ).toContain("3MB");
  });
});

describe("fileToBase64", () => {
  test("data URL 접두사 없이 base64 만 돌려준다", async () => {
    const f = new File(["abc"], "a.png", { type: "image/png" });
    expect(await fileToBase64(f)).toBe("YWJj");
  });
});

describe("메모 초안", () => {
  test("날짜가 없으면 빈 문자열 초안이다", () => {
    expect(draftOf(memo({ writtenAt: null }))).toEqual({
      writtenAt: "",
      text: "실험을 했다",
    });
  });

  test("바뀐 것이 있어야 dirty 다", () => {
    const m = memo();
    expect(isDirty(m, draftOf(m))).toBe(false);
    expect(isDirty(m, { ...draftOf(m), text: "다른 글" })).toBe(true);
  });

  test("날짜와 글이 있고 300자 이하여야 확인을 시도할 수 있다", () => {
    expect(canConfirm({ writtenAt: "2026-04-03", text: "글" })).toBe(true);
    expect(canConfirm({ writtenAt: "", text: "글" })).toBe(false);
    expect(canConfirm({ writtenAt: "2026-04-03", text: "  " })).toBe(false);
    expect(
      canConfirm({
        writtenAt: "2026-04-03",
        text: "a".repeat(MEMO_MAX_CHARS + 1),
      }),
    ).toBe(false);
  });
});
