import { describe, expect, test } from "vitest";
import {
  MAX_EDIT_PARAGRAPHS,
  MAX_REPICKS,
  writeBody,
  writeEditResponse,
  writeGenerateResponse,
} from "./write.js";

const SID = "3f2b8c1e-9d4a-4b6e-8a1c-0e5d7f9a2b3c";
const ok = (body: unknown) => writeBody.safeParse(body).success;

describe("writeBody", () => {
  test("generate 는 sessionId 만 있으면 된다", () => {
    expect(ok({ sessionId: SID, action: "generate" })).toBe(true);
  });

  test("edit 는 1개 이상 상한 이하의 문자열 문단 배열이 필요하다", () => {
    const edit = (paragraphs: unknown) =>
      ok({ sessionId: SID, action: "edit", paragraphs });
    expect(edit(["a"])).toBe(true);
    expect(edit([])).toBe(false);
    expect(edit([1])).toBe(false);
    expect(edit(new Array(MAX_EDIT_PARAGRAPHS).fill("a"))).toBe(true);
    expect(edit(new Array(MAX_EDIT_PARAGRAPHS + 1).fill("a"))).toBe(false);
    expect(ok({ sessionId: SID, action: "edit" })).toBe(false);
  });

  test("confirm-feeling 은 비지 않은 sentenceId 가 필요하다", () => {
    expect(
      ok({ sessionId: SID, action: "confirm-feeling", sentenceId: "p1-s1" }),
    ).toBe(true);
    expect(ok({ sessionId: SID, action: "confirm-feeling" })).toBe(false);
    expect(
      ok({ sessionId: SID, action: "confirm-feeling", sentenceId: "" }),
    ).toBe(false);
  });

  test("repick-evidence 는 sentenceId 와 refId, item 문자열 목록이 필요하다", () => {
    const repick = (extra: Record<string, unknown>) =>
      ok({ sessionId: SID, action: "repick-evidence", ...extra });
    expect(
      repick({ sentenceId: "p1-s1", picks: [{ refId: "c1", item: "method" }] }),
    ).toBe(true);
    expect(repick({ sentenceId: "p1-s1", picks: [] })).toBe(true);
    expect(repick({ sentenceId: "p1-s1" })).toBe(false);
    expect(repick({ sentenceId: "", picks: [] })).toBe(false);
    expect(
      repick({ sentenceId: "p1-s1", picks: [{ refId: 1, item: "method" }] }),
    ).toBe(false);
    expect(
      repick({
        sentenceId: "p1-s1",
        picks: new Array(MAX_REPICKS + 1).fill({ refId: "c1", item: "m" }),
      }),
    ).toBe(false);
  });

  test("sessionId 나 action 이 틀리면 거절한다", () => {
    expect(ok({ sessionId: "x", action: "generate" })).toBe(false);
    expect(ok({ sessionId: SID, action: "zzz" })).toBe(false);
    expect(ok(null)).toBe(false);
  });
});

describe("writeGenerateResponse, writeEditResponse", () => {
  const report = {
    id: "r1",
    revision: 1,
    sections: { paragraphs: [{ sentences: [] }] },
    charCount: { withSpace: 10, withoutSpace: 8 },
  };

  test("generate 응답은 ok 필드 없이 리포트, 차감, 남은 재생성, 단계, 시도를 읽는다", () => {
    const parsed = writeGenerateResponse.parse({
      report,
      charged: false,
      regenerationsLeft: 2,
      currentStep: 4,
      attempts: 1,
      softIssues: [{ code: "LEN", message: "짧아요" }],
    });
    expect(parsed.charged).toBe(false);
    expect(parsed.regenerationsLeft).toBe(2);
    expect(writeGenerateResponse.safeParse({ report }).success).toBe(false);
  });

  test("본문의 문장이 계약 모양이 아니면 거절한다", () => {
    const bad = {
      ...report,
      sections: { paragraphs: [{ sentences: [{ id: "s1", text: "x" }] }] },
    };
    expect(writeGenerateResponse.safeParse({ report: bad }).success).toBe(
      false,
    );
    expect(writeEditResponse.safeParse({ report: bad }).success).toBe(false);
  });

  test("edit, confirm, repick 응답은 리포트만 준다", () => {
    expect(writeEditResponse.parse({ report }).report.id).toBe("r1");
    expect(writeEditResponse.safeParse({}).success).toBe(false);
  });
});
