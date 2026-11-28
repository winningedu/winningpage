import { describe, expect, test } from "vitest";
import { adminEmbedBody } from "./admin-embed.js";

describe("adminEmbedBody", () => {
  test("action 을 생략하면 embed-one 이다", () => {
    expect(
      adminEmbedBody.parse({ id: "k1", knowledgeType: "topic_pattern" }),
    ).toEqual({
      action: "embed-one",
      id: "k1",
      knowledgeType: "topic_pattern",
    });
  });

  test("backfill 은 limit 숫자와 force 를 받는다", () => {
    expect(
      adminEmbedBody.parse({
        action: "backfill",
        knowledgeType: "topic_pattern",
        limit: 30,
        force: "true",
      }),
    ).toEqual({
      action: "backfill",
      knowledgeType: "topic_pattern",
      limit: 30,
      force: "true",
    });
    expect(
      adminEmbedBody.safeParse({
        action: "backfill",
        knowledgeType: "topic_pattern",
        force: true,
      }).success,
    ).toBe(true);
  });

  test("knowledgeType 이 없으면 거절한다", () => {
    expect(adminEmbedBody.safeParse({ action: "backfill" }).success).toBe(
      false,
    );
  });

  test("모르는 action, 숫자가 아닌 limit, 그 밖의 force 는 거절한다", () => {
    expect(
      adminEmbedBody.safeParse({ action: "nope", knowledgeType: "x" }).success,
    ).toBe(false);
    expect(adminEmbedBody.safeParse({ limit: "30" }).success).toBe(false);
    expect(adminEmbedBody.safeParse({ force: "yes" }).success).toBe(false);
    expect(adminEmbedBody.safeParse({ id: 5 }).success).toBe(false);
  });
});
