import { describe, expect, test } from "vitest";
import { SURVEY_QUESTIONS } from "../../../../api/_lib/growth/intake/survey.js";
import { SURVEY_LABELS } from "./surveyLabels";

describe("SURVEY_LABELS", () => {
  test("서버 문항 key 24개와 1:1 이다", () => {
    const serverKeys = SURVEY_QUESTIONS.map((q) => q.key).sort();
    expect(Object.keys(SURVEY_LABELS).sort()).toEqual(serverKeys);
    expect(serverKeys).toHaveLength(24);
  });

  test("선택지가 서버 options 와 순서까지 같다", () => {
    for (const q of SURVEY_QUESTIONS) {
      expect(SURVEY_LABELS[q.key]?.options, q.key).toEqual(q.options);
    }
  });

  test("모든 문항에 제목이 있다", () => {
    for (const q of SURVEY_QUESTIONS) {
      expect(SURVEY_LABELS[q.key]?.title.length, q.key).toBeGreaterThan(0);
    }
  });

  test("QA 반영 문항 제목", () => {
    expect(SURVEY_LABELS.q7?.title).toBe(
      "평소 SNS나 뉴스에서 접한 정보에서 불편하거나 이상하다고 느낀 사건이나 사실과 그 이유는 무엇인가요?",
    );
    expect(SURVEY_LABELS.q12?.title).toBe(
      "탐구활동 과제를 스스로 찾아본 것이 있나요? 있으면 내용을 적어 주세요",
    );
  });
});
