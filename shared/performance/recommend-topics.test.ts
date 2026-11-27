import { describe, expect, test } from "vitest";
import {
  recommendTopicsBody,
  recommendTopicsResponse,
} from "./recommend-topics.js";

const ID = "3f2b8c1e-9d4a-4b6e-8a1c-0e5d7f9a2b3c";

describe("recommendTopicsBody", () => {
  test("round 는 생략하거나 1 이상 정수다", () => {
    const ok = (over: Record<string, unknown>) =>
      recommendTopicsBody.safeParse({ sessionId: ID, ...over }).success;
    expect(ok({})).toBe(true);
    expect(ok({ round: 2 })).toBe(true);
    expect(ok({ round: 0 })).toBe(false);
    expect(ok({ round: 1.5 })).toBe(false);
    expect(ok({ round: "2" })).toBe(false);
  });

  test("sessionId 는 uuid 여야 한다", () => {
    expect(recommendTopicsBody.safeParse({ sessionId: "x" }).success).toBe(
      false,
    );
  });
});

describe("recommendTopicsResponse", () => {
  const topic = {
    id: "t1",
    round: 1,
    idx: 0,
    title: "주제",
    subtitle: null,
    tags: [],
    detail: [],
    selected: false,
  };
  const base = {
    round: 1,
    topics: [topic],
    quotaRemaining: 2,
    charged: true,
    maxRounds: 2,
  };

  test("새 추천 응답과 재생 응답이 통과한다", () => {
    expect(recommendTopicsResponse.safeParse(base).success).toBe(true);
    expect(
      recommendTopicsResponse.safeParse({
        ...base,
        reused: true,
        charged: false,
      }).success,
    ).toBe(true);
  });

  test("주제 카드에 title 이 없으면 거절한다", () => {
    expect(
      recommendTopicsResponse.safeParse({
        ...base,
        topics: [{ ...topic, title: undefined }],
      }).success,
    ).toBe(false);
  });
});
