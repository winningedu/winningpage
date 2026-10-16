import { describe, expect, it } from "vitest";
import { promoteToRecord } from "./promote.js";
import { ANALYSIS_FIELDS, type Analysis, type AnalysisField } from "./types.js";

function analysis(over: Partial<Record<AnalysisField, string>> = {}): Analysis {
  const values = {} as Record<AnalysisField, string>;
  const sources = {} as Analysis["sources"];
  for (const f of ANALYSIS_FIELDS) {
    values[f] = over[f] ?? "";
    sources[f] = "record";
  }
  return { values, sources, conflicts: [] };
}

describe("promoteToRecord", () => {
  it("주제는 활동 이름, 개념과 방법과 결과와 한계는 분석값 그대로 옮긴다", () => {
    const r = promoteToRecord(
      analysis({
        concept: "환율과 물가의 관계",
        method: "월별 표를 비교했다.",
        result: "상관계수는 0.71이었다.",
        limitation: "기간이 짧았다.",
        motive: "승격 대상이 아님",
      }),
      "환율 탐구",
    );
    expect(r).toMatchObject({
      topic: "환율 탐구",
      concept: "환율과 물가의 관계",
      method: "월별 표를 비교했다.",
      result: "상관계수는 0.71이었다.",
      limitation: "기간이 짧았다.",
    });
  });

  it("수치는 결과 문장 중 숫자가 있는 문장만 모은다", () => {
    const r = promoteToRecord(
      analysis({
        result: "상관계수는 0.71이었다. 의미 있다고 봤다. 표본은 30개였다.",
      }),
      "a",
    );
    expect(r.numbers).toEqual(["상관계수는 0.71이었다.", "표본은 30개였다."]);
  });

  it("자료명은 방법과 결과에서 접미로 끝나는 어절과 따옴표 안 문자열을 중복 없이 모은다", () => {
    const r = promoteToRecord(
      analysis({
        method: "한국은행 통계 를 보고 「물가 동향」 자료를 비교했다.",
        result: '"월별 환율표" 와 자료 를 다시 봤다. 통계도 썼다.',
      }),
      "a",
    );
    expect(r.sources).toEqual(["물가 동향", "통계", "자료", "월별 환율표"]);
  });

  it("발표, 목표처럼 표로 끝나는 일반 낱말은 자료로 보지 않는다", () => {
    const r = promoteToRecord(analysis({ method: "발표 목표 성적표" }), "a");
    expect(r.sources).toEqual(["성적표"]);
  });

  it("값이 비어 있으면 빈 문자열과 빈 배열이다", () => {
    const r = promoteToRecord(analysis(), "");
    expect(r).toEqual({
      topic: "",
      concept: "",
      method: "",
      result: "",
      limitation: "",
      numbers: [],
      sources: [],
    });
  });
});
