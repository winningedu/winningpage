import { describe, expect, test } from "vitest";
import {
  buildInterviewAsset,
  candidateOrigin,
  INTERVIEW_QUESTIONS,
  selectedGaps,
  toggleSource,
} from "./interviewLogic";

describe("INTERVIEW_QUESTIONS", () => {
  test("7문항 제목이 번호 순서로 있다", () => {
    expect(INTERVIEW_QUESTIONS).toHaveLength(7);
    expect(INTERVIEW_QUESTIONS[0]).toBe("어떤 활동이었나요 (주제 한 줄, 필수)");
  });
});

describe("toggleSource", () => {
  test("없으면 넣고 있으면 뺀다", () => {
    expect(toggleSource([], "internet")).toEqual(["internet"]);
    expect(toggleSource(["internet", "paper"], "internet")).toEqual(["paper"]);
  });
});

describe("candidateOrigin", () => {
  test("4번은 답변에서 추정", () => {
    expect(
      candidateOrigin(
        { id: "g4-1", text: "x", source: 4 },
        { q1: "a", q4: "b" },
      ),
    ).toBe("4번 답변에서 추정");
  });

  test("3번은 고른 자료 출처 이름을 붙인다", () => {
    expect(
      candidateOrigin(
        { id: "g3-1", text: "x", source: 3 },
        { q1: "a", q3: ["internet", "paper"] },
      ),
    ).toBe("3번 답변(인터넷 검색, 논문)에서 추정");
  });

  test("5번은 마무리 방식 이름을 붙인다", () => {
    expect(
      candidateOrigin(
        { id: "g5-1", text: "x", source: 5 },
        { q1: "a", q5: "summary" },
      ),
    ).toBe("5번 답변(정리하고 끝냄)에서 추정");
  });
});

describe("selectedGaps", () => {
  const candidates = [
    { id: "g3-1", text: "원 출처를 확인하지 않고 인용함", source: 3 },
    { id: "g5-1", text: "자기 해석을 붙이지 못함", source: 5 },
  ];

  test("체크한 후보 문장과 직접 쓴 한 줄을 순서대로 모은다", () => {
    expect(
      selectedGaps(
        candidates,
        new Set(["자기 해석을 붙이지 못함"]),
        " 직접 적음 ",
      ),
    ).toEqual(["자기 해석을 붙이지 못함", "직접 적음"]);
  });

  test("후보에서 사라진 체크는 버리고 직접 쓴 값이 비면 넣지 않는다", () => {
    expect(selectedGaps(candidates, new Set(["없는 후보"]), "  ")).toEqual([]);
  });

  test("직접 쓴 값이 후보와 같으면 한 번만 넣는다", () => {
    expect(
      selectedGaps(
        candidates,
        new Set(["자기 해석을 붙이지 못함"]),
        "자기 해석을 붙이지 못함",
      ),
    ).toEqual(["자기 해석을 붙이지 못함"]);
  });
});

describe("buildInterviewAsset", () => {
  test("1번이 비면 저장할 수 없다", () => {
    expect(buildInterviewAsset({ q1: " " }, ["x"], "interview:1")).toEqual({
      ok: false,
      reason: "활동의 주제를 한 줄 적어 주세요.",
    });
  });

  test("빈틈이 0개면 저장할 수 없다", () => {
    expect(buildInterviewAsset({ q1: "수질" }, [], "interview:1")).toEqual({
      ok: false,
      reason: "빈틈을 하나 이상 골라 주세요.",
    });
  });

  test("통과하면 인터뷰 자산을 만든다", () => {
    const result = buildInterviewAsset(
      { q1: " 수질 " },
      ["빈틈"],
      "interview:1",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.asset.input).toEqual({
        kind: "interview",
        answers: { q1: "수질" },
        gaps: ["빈틈"],
      });
    }
  });
});
