// 지식 DB 라우트의 권한 키가 요청의 knowledgeType 에서 레지스트리 섹션으로 정해지는지 확인한다.

import { describe, expect, it } from "vitest";
import { RouteParamError } from "../handler.js";
import { knowledgeSectionKey } from "./permission.js";

describe("knowledgeSectionKey", () => {
  it("topic_pattern 은 주제 DB 섹션 키다", () => {
    expect(knowledgeSectionKey({ knowledgeType: "topic_pattern" })).toBe(
      "winningSuhaengTopicDb",
    );
  });

  it("verified_resource 는 자료 DB 섹션 키다", () => {
    expect(knowledgeSectionKey({ knowledgeType: "verified_resource" })).toBe(
      "winningSuhaengResourceDb",
    );
  });

  it.each([
    ["모르는 값", { knowledgeType: "other" }],
    ["값 없음", {}],
    ["본문 없음", undefined],
    ["객체가 아닌 값", { knowledgeType: { x: 1 } }],
    ["프로토타입 키", { knowledgeType: "constructor" }],
  ])("%s 이면 knowledgeType 경로의 RouteParamError 다", (_label, body) => {
    expect(() => knowledgeSectionKey(body)).toThrow(RouteParamError);
    try {
      knowledgeSectionKey(body);
    } catch (error) {
      expect((error as RouteParamError).path).toBe("knowledgeType");
    }
  });
});
