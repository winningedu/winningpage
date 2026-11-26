// 수행평가 주제 추천의 이전 주제 반복 금지 증거 테스트 (사 #58 앞부분, 결정 107.18).
//
// 위닝 운영 로직에 이미 있는 규칙이라 코드는 바꾸지 않고, 프롬프트에 그 규칙과
// 이전 주제가 실제로 실리는지만 고정한다. 성장설계 대주제 반영(사 #58 뒷부분)은
// 이번 범위가 아니다.
import { describe, expect, it } from "vitest";
import {
  buildDesignReportUser,
  buildEvaluationUser,
  buildTopicExclusionBlock,
  buildTopicRecommendationSystem,
  buildTopicRecommendationUser,
  CORE_PRINCIPLES,
  formatPreviousTopicsForPrompt,
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

describe("이전 주제 여러 개 렌더링", () => {
  it("formatter는 0개면 없음, 1개면 그대로, 2개 이상이면 들여쓴 목록이다", () => {
    expect(formatPreviousTopicsForPrompt("")).toBe(NO_PREVIOUS_TOPIC_TEXT);
    expect(formatPreviousTopicsForPrompt(" \n ")).toBe(NO_PREVIOUS_TOPIC_TEXT);
    expect(formatPreviousTopicsForPrompt(" 주제A ")).toBe("주제A");
    expect(formatPreviousTopicsForPrompt("주제A\n\n주제B")).toBe(
      "\n  - 주제A\n  - 주제B",
    );
    expect(formatPreviousTopicsForPrompt("주제A\n주제B", "block")).toBe(
      "- 주제A\n- 주제B",
    );
  });

  it("주제 추천 user 프롬프트는 여러 개를 라벨 아래 목록으로 싣는다", () => {
    const user = buildTopicRecommendationUser({
      subject: "생명과학",
      previousTopic: "주제A\n주제B",
    });

    expect(user).toContain(
      "- 같은 과목에서 이전에 한 주제: \n  - 주제A\n  - 주제B\n",
    );
    expect(user).toContain("같은 과목 이전 주제가 있으면 추천 1은 반드시");
    expect(user).toContain("여러 개면 그중 하나 이상");
  });

  it("설계 보고서 user 프롬프트는 여러 개를 목록으로, 없으면 없음으로 싣는다", () => {
    expect(buildDesignReportUser({ previousTopic: "주제A\n주제B" })).toContain(
      "- 이전 주제: \n  - 주제A\n  - 주제B\n",
    );
    expect(buildDesignReportUser({ previousTopic: "" })).toContain(
      `- 이전 주제: ${NO_PREVIOUS_TOPIC_TEXT}\n`,
    );
  });

  it("평가 user 프롬프트는 이전 주제 블록에 한 줄씩 싣는다", () => {
    expect(buildEvaluationUser({ previousTopic: "주제A\n주제B" })).toContain(
      "[이전에 했던 주제]\n- 주제A\n- 주제B\n",
    );
    expect(buildEvaluationUser({ previousTopic: "주제A" })).toContain(
      "[이전에 했던 주제]\n주제A\n",
    );
    expect(buildEvaluationUser({ previousTopic: "" })).toContain(
      `[이전에 했던 주제]\n${NO_PREVIOUS_TOPIC_TEXT}\n`,
    );
  });
});
