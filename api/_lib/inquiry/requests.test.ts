// 심화탐구 assets, submission, reports 요청 검증과 행 변환 테스트(부록 A 2~4번).
import { describe, expect, it } from "vitest";
import {
  parseReportsQuery,
  toAssetRows,
  validateAssetsBody,
  validateSubmissionBody,
} from "./requests.js";

const UUID = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";

describe("validateAssetsBody", () => {
  const ok = (items: unknown[], planItemId: unknown = null) =>
    validateAssetsBody({ sessionId: UUID, items, planItemId });

  it("빈 items 와 null planItemId 를 허용한다(활동 0건)", () => {
    expect(ok([])).toEqual({
      ok: true,
      body: { sessionId: UUID, items: [], planItemId: null },
    });
  });

  it("세 종류 자산을 AssetInput 으로 바꾼다", () => {
    const result = ok(
      [
        { kind: "record", activityRecordId: "r1" },
        {
          kind: "interview",
          answers: {
            q1: " 곰팡이 ",
            q2: "survey",
            q3: ["internet"],
            q5: "claim",
          },
          gaps: [" 대조군 ", "", "대조군"],
        },
        { kind: "oneline", text: " 항생제 내성 " },
      ],
      "p1",
    );
    expect(result).toEqual({
      ok: true,
      body: {
        sessionId: UUID,
        planItemId: "p1",
        items: [
          { kind: "record", activityRecordId: "r1" },
          {
            kind: "interview",
            answers: {
              q1: "곰팡이",
              q2: "survey",
              q3: ["internet"],
              q5: "claim",
            },
            gaps: ["대조군"],
          },
          { kind: "oneline", text: "항생제 내성" },
        ],
      },
    });
  });

  it("sessionId 가 uuid 가 아니면 거절한다", () => {
    expect(
      validateAssetsBody({ sessionId: "x", items: [], planItemId: null }).ok,
    ).toBe(false);
    expect(validateAssetsBody({ items: [], planItemId: null }).ok).toBe(false);
  });

  it("items 가 배열이 아니거나 종류가 모르는 값이면 거절한다", () => {
    expect(
      validateAssetsBody({ sessionId: UUID, items: "x", planItemId: null }).ok,
    ).toBe(false);
    expect(ok([{ kind: "file" }]).ok).toBe(false);
    expect(ok([null]).ok).toBe(false);
    expect(ok([{ kind: "record" }]).ok).toBe(false);
    expect(ok([{ kind: "oneline", text: 3 }]).ok).toBe(false);
    expect(ok([{ kind: "interview", answers: "x", gaps: [] }]).ok).toBe(false);
    expect(
      ok([{ kind: "interview", answers: { q1: "a" }, gaps: "x" }]).ok,
    ).toBe(false);
  });

  it("인터뷰 답의 열거값이 틀리면 거절한다", () => {
    const interview = (answers: unknown) =>
      ok([{ kind: "interview", answers, gaps: ["g"] }]).ok;
    expect(interview({ q1: "a", q2: "other" })).toBe(false);
    expect(interview({ q1: "a", q3: ["x"] })).toBe(false);
    expect(interview({ q1: "a", q5: "x" })).toBe(false);
    expect(interview({ q1: "a", q4: 3 })).toBe(false);
    expect(interview({ q1: 1 })).toBe(false);
  });

  it("planItemId 는 문자열 또는 null 이어야 한다", () => {
    expect(ok([], 3).ok).toBe(false);
    expect(validateAssetsBody({ sessionId: UUID, items: [] }).ok).toBe(false);
  });

  it("자산은 20건까지다", () => {
    const many = Array.from({ length: 21 }, (_, i) => ({
      kind: "record",
      activityRecordId: `r${i}`,
    }));
    expect(ok(many).ok).toBe(false);
  });
});

describe("toAssetRows", () => {
  it("입력 순서대로 position 을 매기고 신뢰도는 경로에서 정한다", () => {
    const rows = toAssetRows([
      { kind: "record", activityRecordId: "r1" },
      { kind: "interview", answers: { q1: "a" }, gaps: ["g"] },
      { kind: "oneline", text: "t" },
    ]);
    expect(rows).toEqual([
      {
        kind: "record",
        reliability: "A",
        position: 0,
        activity_record_id: "r1",
        interview_answers: null,
        gaps: null,
        oneline_text: null,
      },
      {
        kind: "interview",
        reliability: "B",
        position: 1,
        activity_record_id: null,
        interview_answers: { q1: "a" },
        gaps: ["g"],
        oneline_text: null,
      },
      {
        kind: "oneline",
        reliability: "C",
        position: 2,
        activity_record_id: null,
        interview_answers: null,
        gaps: null,
        oneline_text: "t",
      },
    ]);
  });
});

describe("validateSubmissionBody", () => {
  it("8절을 정규화하고 빠진 절은 빈 문자열로 채운다", () => {
    const result = validateSubmissionBody({
      sessionId: UUID,
      sections: { I: "가" },
    });
    expect(result.ok && result.body.sections.I).toBe("가");
    expect(result.ok && result.body.sections.VIII).toBe("");
  });

  it("각 절을 20000자에서 자른다(코드포인트 단위)", () => {
    const result = validateSubmissionBody({
      sessionId: UUID,
      sections: { I: "가".repeat(20001), II: "😀".repeat(20001) },
    });
    expect(result.ok && Array.from(result.body.sections.I).length).toBe(20000);
    expect(result.ok && Array.from(result.body.sections.II).length).toBe(20000);
  });

  it("sections 가 객체가 아니거나 문자열 아닌 절이 있으면 거절한다", () => {
    expect(validateSubmissionBody({ sessionId: UUID, sections: "x" }).ok).toBe(
      false,
    );
    expect(
      validateSubmissionBody({ sessionId: UUID, sections: { I: 1 } }).ok,
    ).toBe(false);
    expect(validateSubmissionBody({ sections: {} }).ok).toBe(false);
    expect(validateSubmissionBody(null).ok).toBe(false);
  });
});

describe("parseReportsQuery", () => {
  it("쿼리가 없으면 목록이다", () => {
    expect(parseReportsQuery({})).toEqual({ ok: true, sessionId: undefined });
  });

  it("sessionId 가 uuid 면 상세다", () => {
    expect(parseReportsQuery({ sessionId: UUID })).toEqual({
      ok: true,
      sessionId: UUID,
    });
  });

  it("uuid 가 아니거나 배열이면 거절한다", () => {
    expect(parseReportsQuery({ sessionId: "abc" }).ok).toBe(false);
    expect(parseReportsQuery({ sessionId: [UUID, UUID] }).ok).toBe(false);
  });
});
