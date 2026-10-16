// 회상 인터뷰 빈틈 후보 규칙 테스트(명세 No.34, 35, 초안 No.49).
import { describe, expect, it } from "vitest";
import { gapCandidates, validateInterview } from "./gaps.js";
import type { InterviewAnswers } from "./types.js";

const base: InterviewAnswers = { q1: "수질 조사" };

describe("gapCandidates", () => {
  it("아무것도 답하지 않으면 후보가 없다", () => {
    expect(gapCandidates(base)).toEqual([]);
  });

  it("4번 답이 있으면 근거 문항 4 후보 2개를 만든다", () => {
    const result = gapCandidates({ ...base, q4: "교과서 지표" });
    expect(result).toEqual([
      {
        id: "g4-1",
        text: "그 기준이 원래 어떤 목적과 대상을 위한 것인지 확인하지 않음",
        source: 4,
      },
      { id: "g4-2", text: "내 대상에 적용되는지 따지지 않음", source: 4 },
    ]);
  });

  it("4번 답이 공백뿐이거나 null 이면 후보가 없다", () => {
    expect(gapCandidates({ ...base, q4: "   \n" })).toEqual([]);
    expect(gapCandidates({ ...base, q4: null })).toEqual([]);
  });

  it("3번에 인터넷이 있으면 원 출처 후보 1개", () => {
    const result = gapCandidates({ ...base, q3: ["textbook", "internet"] });
    expect(result.map((g) => g.text)).toEqual([
      "원 출처를 확인하지 않고 인용함",
    ]);
    expect(result[0]).toMatchObject({ id: "g3-1", source: 3 });
  });

  it("3번이 교과서뿐이면 실제 사례 후보, 다른 것이 섞이면 만들지 않는다", () => {
    expect(
      gapCandidates({ ...base, q3: ["textbook"] }).map((g) => g.text),
    ).toEqual(["실제 사례나 데이터로 확인하지 못함"]);
    expect(gapCandidates({ ...base, q3: ["textbook", "statistics"] })).toEqual(
      [],
    );
  });

  it("3번이 비어 있거나 없으면 3번 후보가 없다", () => {
    expect(gapCandidates({ ...base, q3: [] })).toEqual([]);
  });

  it("3번에 논문이 있으면 표본 후보 1개", () => {
    expect(
      gapCandidates({ ...base, q3: ["paper"] }).map((g) => g.text),
    ).toEqual(["표본 수와 설계를 따지지 않음"]);
  });

  it("3번에 직접 측정이 있으면 후보 2개", () => {
    const result = gapCandidates({ ...base, q3: ["measurement"] });
    expect(result.map((g) => [g.id, g.text])).toEqual([
      ["g3-1", "반복하지 않아 재현성을 확인하지 못함"],
      ["g3-2", "조건을 통제하지 못함"],
    ]);
  });

  it("3번 후보는 선택 순서와 무관하게 규칙 순서로 나오고 순번을 이어 간다", () => {
    const result = gapCandidates({
      ...base,
      q3: ["measurement", "internet", "paper"],
    });
    expect(result.map((g) => g.id)).toEqual(["g3-1", "g3-2", "g3-3", "g3-4"]);
    expect(result.map((g) => g.text)).toEqual([
      "원 출처를 확인하지 않고 인용함",
      "표본 수와 설계를 따지지 않음",
      "반복하지 않아 재현성을 확인하지 못함",
      "조건을 통제하지 못함",
    ]);
  });

  it("5번 마무리 방식별로 후보 1개", () => {
    expect(
      gapCandidates({ ...base, q5: "summary" }).map((g) => g.text),
    ).toEqual(["자기 해석을 붙이지 못함"]);
    const claim = gapCandidates({ ...base, q5: "claim" });
    expect(claim).toEqual([
      { id: "g5-1", text: "틀릴 가능성을 검토하지 않음", source: 5 },
    ]);
  });

  it("6번과 7번 답은 그대로 후보가 되고 앞뒤 공백만 걷어 낸다", () => {
    const result = gapCandidates({
      ...base,
      q6: "  표본을 늘렸을 것 ",
      q7: "결론이 약하다는 피드백",
    });
    expect(result).toEqual([
      { id: "g6-1", text: "표본을 늘렸을 것", source: 6 },
      { id: "g7-1", text: "결론이 약하다는 피드백", source: 7 },
    ]);
  });

  it("6번과 7번이 공백뿐이면 후보가 없다", () => {
    expect(gapCandidates({ ...base, q6: " ", q7: "\t" })).toEqual([]);
  });

  it("문항 번호 순서로 정렬하고 text 중복은 먼저 나온 것만 남긴다", () => {
    const result = gapCandidates({
      ...base,
      q3: ["internet"],
      q4: "x",
      q5: "claim",
      q6: "원 출처를 확인하지 않고 인용함",
      q7: "마지막",
    });
    expect(result.map((g) => g.source)).toEqual([3, 4, 4, 5, 7]);
    expect(
      result.filter((g) => g.text === "원 출처를 확인하지 않고 인용함"),
    ).toHaveLength(1);
    // 중복이 빠져도 같은 문항 안의 순번은 비지 않는다.
    expect(result.find((g) => g.source === 7)?.id).toBe("g7-1");
  });

  it("같은 입력이면 같은 id 를 돌려준다", () => {
    const answers: InterviewAnswers = {
      ...base,
      q3: ["internet", "paper"],
      q4: "x",
    };
    expect(gapCandidates(answers)).toEqual(gapCandidates(answers));
  });
});

describe("validateInterview (No.35)", () => {
  it("1번이 비면 Q1_REQUIRED", () => {
    expect(validateInterview({ q1: "" }, ["a"])).toEqual({
      ok: false,
      code: "Q1_REQUIRED",
    });
    expect(validateInterview({ q1: "  " }, ["a"])).toEqual({
      ok: false,
      code: "Q1_REQUIRED",
    });
  });

  it("빈틈을 하나도 고르지 않으면 GAPS_REQUIRED", () => {
    expect(validateInterview(base, [])).toEqual({
      ok: false,
      code: "GAPS_REQUIRED",
    });
    expect(validateInterview(base, ["  ", ""])).toEqual({
      ok: false,
      code: "GAPS_REQUIRED",
    });
  });

  it("1번과 빈틈이 모두 있으면 통과", () => {
    expect(
      validateInterview(base, ["내 대상에 적용되는지 따지지 않음"]),
    ).toEqual({ ok: true });
  });

  it("둘 다 문제면 1번을 먼저 알린다", () => {
    expect(validateInterview({ q1: "" }, [])).toEqual({
      ok: false,
      code: "Q1_REQUIRED",
    });
  });
});
