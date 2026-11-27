import { describe, expect, test } from "vitest";
import { finalizeBody, finalizeResponse, promotedRecord } from "./finalize.js";

const SID = "3f2b8c1e-9d4a-4b6e-8a1c-0e5d7f9a2b3c";
const promoted = {
  topic: "주제",
  concept: "개념",
  method: "방법",
  result: "결과",
  limitation: "한계",
  numbers: ["3회"],
  sources: ["교과서"],
};

describe("finalizeBody", () => {
  test("fulfillsPlanItem 기본값은 true, acknowledgeMandatory 기본값은 false 다", () => {
    expect(finalizeBody.parse({ sessionId: SID, promoted })).toEqual({
      sessionId: SID,
      promoted,
      fulfillsPlanItem: true,
      acknowledgeMandatory: false,
    });
  });

  test("fulfillsPlanItem 과 acknowledgeMandatory 를 줄 수 있다", () => {
    const parsed = finalizeBody.parse({
      sessionId: SID,
      promoted,
      fulfillsPlanItem: false,
      acknowledgeMandatory: true,
    });
    expect(parsed.fulfillsPlanItem).toBe(false);
    expect(parsed.acknowledgeMandatory).toBe(true);
  });

  test("승격 항목의 모양은 요청 형식 검사가 보지 않는다(PROMOTED_INVALID 는 라우트가 낸다)", () => {
    expect(finalizeBody.safeParse({ sessionId: SID }).success).toBe(true);
    expect(
      finalizeBody.safeParse({ sessionId: SID, promoted: { topic: 1 } })
        .success,
    ).toBe(true);
  });

  test("sessionId 나 boolean 항목의 형식이 틀리면 거절한다", () => {
    expect(finalizeBody.safeParse({ sessionId: "x", promoted }).success).toBe(
      false,
    );
    expect(
      finalizeBody.safeParse({
        sessionId: SID,
        promoted,
        fulfillsPlanItem: "yes",
      }).success,
    ).toBe(false);
    expect(
      finalizeBody.safeParse({
        sessionId: SID,
        promoted,
        acknowledgeMandatory: "yes",
      }).success,
    ).toBe(false);
    expect(finalizeBody.safeParse(null).success).toBe(false);
  });
});

describe("promotedRecord", () => {
  test("7항목이 있으면 통과하고 topic 은 앞뒤 공백을 지운다", () => {
    expect(promotedRecord.parse({ ...promoted, topic: " 주제 " })).toEqual(
      promoted,
    );
  });

  test("topic 이 비면 거절한다", () => {
    expect(promotedRecord.safeParse({ ...promoted, topic: "  " }).success).toBe(
      false,
    );
  });

  test("항목 형식이 틀리거나 빠지면 거절한다", () => {
    expect(
      promotedRecord.safeParse({ ...promoted, numbers: "x" }).success,
    ).toBe(false);
    expect(
      promotedRecord.safeParse({ ...promoted, method: undefined }).success,
    ).toBe(false);
    expect(promotedRecord.safeParse(undefined).success).toBe(false);
  });
});

describe("finalizeResponse", () => {
  test("ok 필드 없이 활동 기록, 최종 리비전, 회신 결과를 읽는다", () => {
    const parsed = finalizeResponse.parse({
      activityRecordId: "a1",
      finalRevision: 3,
      reply: { status: "failed", code: "UPSTREAM" },
      currentStep: 6,
    });
    expect(parsed.reply.status).toBe("failed");
    expect(
      finalizeResponse.safeParse({
        activityRecordId: "a1",
        finalRevision: 3,
        reply: { status: "zzz" },
        currentStep: 6,
      }).success,
    ).toBe(false);
  });
});
