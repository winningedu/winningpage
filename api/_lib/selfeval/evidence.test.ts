import { describe, expect, it } from "vitest";
import {
  type EvidenceSources,
  normalizeEvidence,
  normalizeSections,
  resolveSentenceEvidence,
} from "./evidence.js";

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

const sources: EvidenceSources = {
  records: [
    {
      id: "r1",
      sourceType: "P",
      completed: true,
      itemTexts: {
        method: "표를 만들어 비교함 3개 조건",
        result: "상관계수 0.71",
      },
    },
    {
      id: "r2",
      sourceType: "D",
      completed: false,
      itemTexts: { method: "진행 중 방법" },
    },
  ],
  memos: [{ id: "m1", text: "5월 3일 계수를 12번 바꿔 봄" }],
};
const ref = (refId: string, item: string, weight = "main") => ({
  refId,
  item,
  weight,
});
const run = (text: string, raw: unknown) =>
  resolveSentenceEvidence(raw, text, sources);

describe("resolveSentenceEvidence", () => {
  it("선택 기록의 값이 있는 항목만 남기고 출처 유형은 서버가 붙인다", () => {
    const r = run("표를 만들어 비교함.", [ref("r1", "method")]);
    expect(r.evidence).toEqual([
      { sourceType: "P", refId: "r1", item: "method", weight: "main" },
    ]);
    expect(r.needsConfirmation).toBe(false);
  });

  it("선택하지 않은 기록, 비운 항목, 다음 단계 항목은 버리고 실패시키지 않는다", () => {
    const r = run("가나다 라마함.", [
      ref("zzz", "method"),
      ref("r1", "role"),
      ref("r1", "next"),
    ]);
    expect(r.evidence).toEqual([]);
    expect(r.needsConfirmation).toBe(true);
  });

  it("근거가 하나도 남지 않으면 모델 신고와 무관하게 확인 필요로 올린다", () => {
    expect(run("가나다 라마함.", []).needsConfirmation).toBe(true);
    expect(run("가나다 라마함.", null).needsConfirmation).toBe(true);
  });

  it("진행 중 기록 근거는 버리고 다른 근거가 남아도 확인 필요로 올린다", () => {
    const r = run("표를 만들어 비교함.", [
      ref("r1", "method"),
      ref("r2", "method"),
    ]);
    expect(r.evidence.map((e) => e.refId)).toEqual(["r1"]);
    expect(r.needsConfirmation).toBe(true);
  });

  it("수기 메모는 계기, 한 일, 방법, 한계 항목만 근거가 된다", () => {
    const r = run("계수를 바꿔 봄.", [
      ref("m1", "action", "sub"),
      ref("m1", "result"),
      ref("m1", "learning"),
    ]);
    expect(r.evidence).toEqual([
      { sourceType: "H", refId: "m1", item: "action", weight: "sub" },
    ]);
  });

  it("같은 근거를 두 번 적어도 한 번만 남긴다", () => {
    const r = run("표를 만들어 비교함.", [
      ref("r1", "method"),
      ref("r1", "method", "sub"),
    ]);
    expect(r.evidence).toHaveLength(1);
  });

  it("한 문장에 여러 근거를 붙일 수 있다", () => {
    const r = run("표로 비교해 계수를 구함.", [
      ref("r1", "method"),
      ref("r1", "result", "sub"),
    ]);
    expect(r.evidence).toHaveLength(2);
  });

  it("근거 글에 없는 수치가 문장에 있으면 확인 필요로 올린다", () => {
    expect(
      run("표로 99개를 비교함.", [ref("r1", "method")]).needsConfirmation,
    ).toBe(true);
    expect(
      run("표로 3개 조건을 비교함.", [ref("r1", "method")]).needsConfirmation,
    ).toBe(false);
  });

  it("수기 메모 글에 그대로 있는 수치는 허용하고 없는 수치는 확인 필요로 올린다", () => {
    expect(
      run("계수를 12번 바꿈.", [ref("m1", "action")]).needsConfirmation,
    ).toBe(false);
    expect(
      run("계수를 40번 바꿈.", [ref("m1", "action")]).needsConfirmation,
    ).toBe(true);
  });
});
