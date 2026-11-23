import { describe, expect, it } from "vitest";
import { normalizeEvidence, normalizeSections } from "./evidence.js";

const typeOf = (id: string) => (id === "d1" ? "D" : id === "a1" ? "A" : null);

describe("normalizeEvidence", () => {
  it("옛 단일 활동 근거를 배열 한 건으로 읽고 출처 유형은 활동에서 찾는다", () => {
    expect(
      normalizeEvidence({ activityId: "d1", field: "method" }, typeOf),
    ).toEqual([
      { sourceType: "D", refId: "d1", item: "method", weight: "main" },
    ]);
  });

  it("옛 학생 수정 근거는 S 근거로 읽는다", () => {
    expect(normalizeEvidence({ student: true })).toEqual([
      { sourceType: "S", refId: null, item: "student_input", weight: "main" },
    ]);
  });

  it("옛 null 과 빈 값은 빈 배열이다", () => {
    expect(normalizeEvidence(null)).toEqual([]);
    expect(normalizeEvidence(undefined)).toEqual([]);
  });

  it("출처 유형을 찾을 수 없는 옛 활동 근거는 버린다", () => {
    expect(
      normalizeEvidence({ activityId: "zzz", field: "method" }, typeOf),
    ).toEqual([]);
  });

  it("새 배열 모양은 올바른 항목만 그대로 둔다", () => {
    const ok = {
      sourceType: "H",
      refId: "m1",
      item: "action",
      weight: "sub",
    };
    expect(
      normalizeEvidence([
        ok,
        { sourceType: "X", refId: "a", item: "method" },
        3,
      ]),
    ).toEqual([ok]);
  });
});

describe("normalizeSections", () => {
  it("모든 문장의 근거를 배열로 바꾼다", () => {
    const out = normalizeSections(
      {
        paragraphs: [
          {
            sentences: [
              { id: "s1", text: "가함.", evidence: { student: true } },
              { id: "s2", text: "나함.", evidence: null },
            ],
          },
        ],
      },
      typeOf,
    ) as { paragraphs: { sentences: { evidence: unknown[] }[] }[] };
    expect(out.paragraphs[0]?.sentences.map((s) => s.evidence.length)).toEqual([
      1, 0,
    ]);
  });

  it("문단 모양이 아닌 값은 그대로 돌려준다", () => {
    const v = { items: [] };
    expect(normalizeSections(v)).toBe(v);
  });
});
