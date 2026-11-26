import { describe, expect, it } from "vitest";

import {
  isPreviousTopicValid,
  joinPreviousTopics,
  PREVIOUS_TOPIC_MAX_COUNT,
  PREVIOUS_TOPIC_MAX_LENGTH,
  splitPreviousTopics,
} from "./previous-topics.js";

describe("previous-topics 상수", () => {
  it("최대 5개, 항목당 80자다", () => {
    expect(PREVIOUS_TOPIC_MAX_COUNT).toBe(5);
    expect(PREVIOUS_TOPIC_MAX_LENGTH).toBe(80);
  });
});

describe("splitPreviousTopics / joinPreviousTopics", () => {
  it("줄 단위로 나누고 앞뒤 공백과 빈 줄을 버린다", () => {
    expect(splitPreviousTopics(" a \n\n  \nb\n")).toEqual(["a", "b"]);
  });

  it("null, undefined, 빈 문자열은 빈 배열이다", () => {
    expect(splitPreviousTopics(null)).toEqual([]);
    expect(splitPreviousTopics(undefined)).toEqual([]);
    expect(splitPreviousTopics("")).toEqual([]);
  });

  it("join은 항목을 다듬고 빈 항목을 버리고 줄바꿈으로 잇는다", () => {
    expect(joinPreviousTopics([" a ", "", "b"])).toBe("a\nb");
  });

  it("split과 join은 왕복해도 같은 값이다", () => {
    expect(splitPreviousTopics(joinPreviousTopics(["a", "b", "c"]))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("isPreviousTopicValid", () => {
  it("빈 값은 유효하다", () => {
    expect(isPreviousTopicValid("")).toBe(true);
  });

  it("5줄은 유효하고 6줄은 거절한다", () => {
    expect(isPreviousTopicValid("1\n2\n3\n4\n5")).toBe(true);
    expect(isPreviousTopicValid("1\n2\n3\n4\n5\n6")).toBe(false);
  });

  it("빈 줄은 개수에 세지 않는다", () => {
    expect(isPreviousTopicValid("1\n\n2\n\n3\n4\n5\n")).toBe(true);
  });

  it("한 줄 80자는 유효하고 81자는 거절한다", () => {
    expect(isPreviousTopicValid("가".repeat(80))).toBe(true);
    expect(isPreviousTopicValid("가".repeat(81))).toBe(false);
  });
});
