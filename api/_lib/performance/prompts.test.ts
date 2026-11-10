// 수행평가 주제 추천의 이전 주제 반복 금지 증거 테스트 (사 #58 앞부분, 결정 107.18).
//
// 위닝 운영 로직에 이미 있는 규칙이라 코드는 바꾸지 않고, 프롬프트에 그 규칙과
// 이전 주제가 실제로 실리는지만 고정한다. 성장설계 대주제 반영(사 #58 뒷부분)은
// 이번 범위가 아니다.
import { describe, expect, it } from "vitest";
import {
  buildTopicExclusionBlock,
  buildTopicRecommendationSystem,
  buildTopicRecommendationUser,
  CORE_PRINCIPLES,
  NO_PREVIOUS_TOPIC_TEXT,
} from "./prompts.js";

describe("주제 추천 프롬프트의 이전 주제 반복 금지", () => {
  it("system 프롬프트에 단순 반복하지 않고 심화하는 핵심 원칙이 들어간다", () => {
    const system = buildTopicRecommendationSystem();

    expect(system).toContain(CORE_PRINCIPLES);
    expect(CORE_PRINCIPLES).toContain(
      "학생이 이전에 탐구한 주제가 있다면 단순 반복하지 않고 한 단계 더 깊이 들어가거나",
    );
  });

  it("user 프롬프트에 같은 과목 이전 주제가 실리고 반복 금지 작업 지시가 있다", () => {
    const user = buildTopicRecommendationUser({
      gradeLabel: "고2",
      subject: "생명과학",
      previousTopic: "미세플라스틱이 토양 미생물에 미치는 영향",
    });

    expect(user).toContain(
      "- 같은 과목에서 이전에 한 주제: 미세플라스틱이 토양 미생물에 미치는 영향",
    );
    expect(user).toContain("같은 과목 이전 주제가 있으면 추천 1은 반드시");
    expect(user).toContain("이미 했던 주제는 반복하지 말고");
  });

  it("이전 주제가 없으면 없음으로 적는다", () => {
    const user = buildTopicRecommendationUser({ subject: "생명과학" });

    expect(user).toContain(
      `- 같은 과목에서 이전에 한 주제: ${NO_PREVIOUS_TOPIC_TEXT}`,
    );
  });

  it("재추천 블록은 이전 라운드 주제명을 제외 대상으로 나열한다", () => {
    const block = buildTopicExclusionBlock(["주제 A", " 주제 B ", ""]);

    expect(block).toContain("[이미 추천한 주제");
    expect(block).toContain("- 주제 A\n- 주제 B");
    expect(block).toContain("다시 제안하지 않는다");
  });

  it("제외할 주제가 없으면 재추천 블록은 비어 있다", () => {
    expect(buildTopicExclusionBlock([])).toBe("");
  });
});
