// 평가 서버 계산 테스트(명세 No.82~92, 94~96, 4, 개발계획 §2 19, §6 7, 8, 9).
// 순수 함수만 다루므로 DB 와 모델 호출 없이 검증한다.
import { describe, expect, it } from "vitest";
import {
  appCoreErrors,
  applyCaps,
  buildEvaluation,
  splitFixes,
  validateModelEvaluationShape,
  deterministicRequirement,
  labelFor,
  levelFor,
  mergeCoreErrors,
  scoreOf,
  sourceStatuses,
} from "./scoring.js";
import { CHECKLIST, RUBRIC } from "./constants.js";
import type { AppFacts } from "./scoring.js";
import type { CoreErrorResult, FixItem, SectionId } from "./types.js";
import type { ModelEvaluation } from "./scoring.js";

const IDS: SectionId[] = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

/** 테스트 전용. undefined 면 바로 실패시켜 non-null 단언 없이 좁힌다. */
function must<T>(v: T | undefined | null): T {
  if (v === undefined || v === null) throw new Error("값이 있어야 한다");
  return v;
}

function facts(over: Partial<AppFacts> = {}): AppFacts {
  const counts = Object.fromEntries(
    IDS.map((id) => [id, id === "I" ? 300 : 100]),
  ) as Record<SectionId, number>;
  return {
    counts,
    placeholders: {},
    introMinChars: 300,
    questionText:
      "미세먼지 농도는 교통량과 함께 변하는가?\n가설 1: 비례한다\n가설 2: 무관하다",
    hasNumbersInResults: false,
    sourceLineCount: 1,
    isProvisional: false,
    designSourceTableRows: 3,
    ...over,
  };
}

describe("scoreOf (No.94)", () => {
  it("배점 x 수준 / 4 를 소수 첫째 자리로 반올림한다", () => {
    expect(scoreOf(20, 4)).toBe(20);
    expect(scoreOf(20, 0)).toBe(0);
    expect(scoreOf(25, 2)).toBe(12.5);
    expect(scoreOf(25, 3)).toBe(18.8);
    expect(scoreOf(15, 1)).toBe(3.8);
    expect(scoreOf(10, 3)).toBe(7.5);
  });
});

describe("labelFor (No.92, §6 8)", () => {
  const base = {
    total: 90,
    coreErrorCount: 0,
    anyLevelAtMost2: false,
    evaluable: true,
  };
  it("평가 불가가 가장 먼저다", () => {
    expect(labelFor({ ...base, evaluable: false, coreErrorCount: 3 })).toBe(
      "not_evaluable",
    );
  });
  it("핵심 오류가 하나라도 있으면 대폭 수정 필요다", () => {
    expect(labelFor({ ...base, coreErrorCount: 1 })).toBe(
      "major_revision_needed",
    );
  });
  it("수준 2 이하 항목이 있으면 수정 필요다", () => {
    expect(labelFor({ ...base, anyLevelAtMost2: true })).toBe(
      "revision_needed",
    );
  });
  it("총점 80 미만이면 수정 필요, 80 이상이면 소규모 보완이다", () => {
    expect(labelFor({ ...base, total: 79.9 })).toBe("revision_needed");
    expect(labelFor({ ...base, total: 80 })).toBe("ready_with_minor_edits");
  });
});

describe("sourceStatuses (No.96, §6 9)", () => {
  it("URL 이나 서지가 있으면 사용자 제공 미확인, 없으면 검색 예정이다", () => {
    expect(
      sourceStatuses([
        { text: "통계청 2024", hasUrlOrCitation: true },
        { text: "교통량 자료", hasUrlOrCitation: false },
      ]),
    ).toEqual([
      { text: "통계청 2024", status: "supplied_unverified" },
      { text: "교통량 자료", status: "search_target" },
    ]);
  });
  it("확인 완료 상태는 만들지 않는다", () => {
    const out = sourceStatuses([
      { text: "a", hasUrlOrCitation: true },
      { text: "b", hasUrlOrCitation: false },
    ]);
    expect(out.some((s) => s.status === "retrieved_verified")).toBe(false);
  });
  it("빈 입력은 빈 배열이다", () => {
    expect(sourceStatuses([])).toEqual([]);
  });
});

describe("deterministicRequirement (§2 19)", () => {
  it("intro_min_chars: 서론 글자 수가 기준 이상일 때만 충족", () => {
    const c = (n: number) => ({ ...facts().counts, I: n });
    expect(
      deterministicRequirement("intro_min_chars", facts({ counts: c(300) })),
    ).toBe(true);
    expect(
      deterministicRequirement("intro_min_chars", facts({ counts: c(299) })),
    ).toBe(false);
  });
  it("question_single_sentence: 물음표로 끝나는 150자 이하 문장이 있어야 충족", () => {
    expect(deterministicRequirement("question_single_sentence", facts())).toBe(
      true,
    );
    expect(
      deterministicRequirement(
        "question_single_sentence",
        facts({ questionText: "교통량이 많다" }),
      ),
    ).toBe(false);
    expect(
      deterministicRequirement(
        "question_single_sentence",
        facts({ questionText: "" }),
      ),
    ).toBe(false);
    expect(
      deterministicRequirement(
        "question_single_sentence",
        facts({ questionText: `${"가".repeat(150)}?` }),
      ),
    ).toBe(false);
    expect(
      deterministicRequirement(
        "question_single_sentence",
        facts({ questionText: `${"가".repeat(149)}?` }),
      ),
    ).toBe(true);
  });
  it("both_hypotheses: 가설 1 과 가설 2 가 모두 있어야 충족(공백 없는 표기 허용)", () => {
    expect(deterministicRequirement("both_hypotheses", facts())).toBe(true);
    expect(
      deterministicRequirement(
        "both_hypotheses",
        facts({ questionText: "가설1 a 가설2 b" }),
      ),
    ).toBe(true);
    expect(
      deterministicRequirement(
        "both_hypotheses",
        facts({ questionText: "가설 1 만 있다" }),
      ),
    ).toBe(false);
  });
  it("source_table_filled: 출처표 행이 있으면 충족", () => {
    expect(
      deterministicRequirement(
        "source_table_filled",
        facts({ designSourceTableRows: 1 }),
      ),
    ).toBe(true);
    expect(
      deterministicRequirement(
        "source_table_filled",
        facts({ designSourceTableRows: 0 }),
      ),
    ).toBe(false);
  });
  it("no_placeholders: 자리표시자 합이 0 일 때 충족", () => {
    expect(deterministicRequirement("no_placeholders", facts())).toBe(true);
    expect(
      deterministicRequirement(
        "no_placeholders",
        facts({ placeholders: { III: 1, V: 2 } }),
      ),
    ).toBe(false);
  });
  it("sections_filled: Ⅰ~Ⅶ 모두 0 보다 커야 충족하고 Ⅷ 은 보지 않는다", () => {
    expect(deterministicRequirement("sections_filled", facts())).toBe(true);
    expect(
      deterministicRequirement(
        "sections_filled",
        facts({ counts: { ...facts().counts, VIII: 0 } }),
      ),
    ).toBe(true);
    expect(
      deterministicRequirement(
        "sections_filled",
        facts({ counts: { ...facts().counts, VI: 0 } }),
      ),
    ).toBe(false);
  });
});

describe("appCoreErrors (No.85, 핵심 오류 5, 6)", () => {
  it("문제가 없으면 빈 배열이다", () => {
    expect(appCoreErrors(facts())).toEqual([]);
  });
  it("결과에 숫자가 있고 Ⅷ절이 비면 출처 없는 수치 오류다", () => {
    const out = appCoreErrors(
      facts({ hasNumbersInResults: true, sourceLineCount: 0 }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("unsourced_number");
    expect(out[0]?.effect).toContain("근거와 내용의 정확성");
    expect(out[0]?.effect).toContain("1");
    expect(
      appCoreErrors(facts({ hasNumbersInResults: true, sourceLineCount: 2 })),
    ).toEqual([]);
    expect(
      appCoreErrors(facts({ hasNumbersInResults: false, sourceLineCount: 0 })),
    ).toEqual([]);
  });
  it("자리표시자가 남으면 가장 많은 절을 위치로 하고 절별 개수를 적는다", () => {
    const out = appCoreErrors(facts({ placeholders: { I: 1, V: 3, VII: 2 } }));
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("placeholder_left");
    expect(out[0]?.location).toBe("V");
    expect(out[0]?.detail).toContain("Ⅰ절 1개");
    expect(out[0]?.detail).toContain("Ⅴ절 3개");
    expect(out[0]?.detail).toContain("Ⅶ절 2개");
  });
  it("개수가 같으면 앞 절을 위치로 한다", () => {
    const out = appCoreErrors(facts({ placeholders: { IV: 2, II: 2 } }));
    expect(out[0]?.location).toBe("II");
  });
  it("개수 0 인 절은 적지 않는다", () => {
    const out = appCoreErrors(facts({ placeholders: { I: 0, III: 1 } }));
    expect(out[0]?.detail).not.toContain("Ⅰ절");
  });
});

describe("mergeCoreErrors (§2 19)", () => {
  const app = appCoreErrors(facts({ placeholders: { III: 1 } }));
  it("모델이 보낸 앱 판정 오류는 버리고 앱 판정으로 대체한다", () => {
    const out = mergeCoreErrors(
      [
        { id: "placeholder_left", location: "I", detail: "모델 판정" },
        { id: "overclaim", location: "V", detail: "단정" },
      ],
      app,
    );
    expect(out.map((e) => e.id)).toEqual(["overclaim", "placeholder_left"]);
    expect(out.find((e) => e.id === "placeholder_left")?.location).toBe("III");
  });
  it("앱이 문제를 못 찾았으면 모델이 보낸 앱 판정 오류도 사라진다", () => {
    expect(
      mergeCoreErrors(
        [{ id: "unsourced_number", location: "IV", detail: "x" }],
        [],
      ),
    ).toEqual([]);
  });
  it("같은 id 는 하나만 남기고 CORE_ERRORS 순서로 정렬하며 effect 를 붙인다", () => {
    const out = mergeCoreErrors(
      [
        { id: "correlation_as_cause", location: "V", detail: "a" },
        { id: "variable_mismatch", location: "III", detail: "b" },
        { id: "variable_mismatch", location: "IV", detail: "c" },
      ],
      [],
    );
    expect(out.map((e) => e.id)).toEqual([
      "variable_mismatch",
      "correlation_as_cause",
    ]);
    expect(out[0]?.detail).toBe("b");
    expect(out[0]?.effect).toContain("탐구 방법과 학생의 분석");
    expect(out[0]?.effect).toContain("2");
  });
});

const linkage = must(RUBRIC.find((r) => r.id === "linkage"));
const reqs = (flags: boolean[]) =>
  linkage.requirements.map((r, i) => ({
    id: r.id,
    met: flags[i] ?? false,
    note: `사유${i}`,
  }));

describe("levelFor (No.83, 86~91)", () => {
  it("충족한 요건 수가 수준이다", () => {
    const r = levelFor(linkage, reqs([true, true, true, true]), facts());
    expect(r.level).toBe(4);
    expect(r.unmet).toEqual([]);
    expect(r.met).toHaveLength(4);
  });
  it("결정적 요건은 모델이 충족이라 해도 앱 판정이 덮어쓴다", () => {
    const short = facts({ counts: { ...facts().counts, I: 10 } });
    const r = levelFor(linkage, reqs([true, true, true, true]), short);
    expect(r.level).toBe(3);
    expect(r.unmet[0]).toContain("서론이 최소 분량을 채운다");
  });
  it("결정적 요건은 모델이 미충족이라 해도 앱이 충족으로 덮어쓴다", () => {
    const r = levelFor(linkage, reqs([false, false, false, false]), facts());
    expect(r.level).toBe(1);
    expect(r.met).toEqual(["서론이 최소 분량을 채운다"]);
  });
  it("모델이 요건을 빠뜨리면 미충족으로 센다", () => {
    expect(
      levelFor(linkage, [], facts({ counts: { ...facts().counts, I: 0 } }))
        .level,
    ).toBe(0);
  });
  it("모델 판정 미충족은 사유를 붙인다", () => {
    const r = levelFor(linkage, reqs([false, true, true, true]), facts());
    expect(r.unmet).toEqual(["출발 활동을 실제로 언급한다: 사유0"]);
  });
});

describe("applyCaps (No.85, 4)", () => {
  const err = (
    id:
      | "variable_mismatch"
      | "unsourced_number"
      | "placeholder_left"
      | "overclaim",
  ): CoreErrorResult => ({
    id,
    location: "III",
    detail: "d",
    effect: "e",
  });
  it("해당 항목을 제한하는 오류가 없으면 그대로다", () => {
    expect(applyCaps(4, "method", [err("unsourced_number")])).toEqual({
      level: 4,
      capReason: null,
    });
  });
  it("방법은 2, 근거와 구성은 1 로 제한한다", () => {
    expect(applyCaps(4, "method", [err("variable_mismatch")]).level).toBe(2);
    expect(applyCaps(4, "evidence", [err("unsourced_number")]).level).toBe(1);
    expect(applyCaps(3, "structure", [err("placeholder_left")]).level).toBe(1);
  });
  it("상한 이하인 수준은 바꾸지 않고 사유도 없다", () => {
    expect(applyCaps(1, "method", [err("variable_mismatch")])).toEqual({
      level: 1,
      capReason: null,
    });
  });
  it("제한이 걸리면 사유에 오류 라벨이 들어간다", () => {
    expect(applyCaps(4, "conclusion", [err("overclaim")]).capReason).toContain(
      "증거를 넘어선 단정이 있어요",
    );
  });
  it("예비 주제는 연계 항목을 0 으로 고정한다", () => {
    expect(applyCaps(4, "linkage", [], true)).toEqual({
      level: 0,
      capReason: "관심 기반 예비 주제라 연계 점수는 0점이에요",
    });
    expect(applyCaps(4, "method", [], true)).toEqual({
      level: 4,
      capReason: null,
    });
  });
});

const fix = (location: SectionId, n = 1): FixItem => ({
  location,
  problem: `문제${n}`,
  impact: "영향",
  action: "수정",
  check: "확인",
});

describe("splitFixes (No.95)", () => {
  const err = (location: SectionId): CoreErrorResult => ({
    id: "overclaim",
    location,
    detail: "d",
    effect: "e",
  });
  it("핵심 오류 위치의 수정을 앞으로 보내고 최대 3개를 먼저 고칠 것으로 한다", () => {
    const fixes = [
      fix("I", 1),
      fix("III", 2),
      fix("V", 3),
      fix("VI", 4),
      fix("VII", 5),
    ];
    const out = splitFixes(fixes, [err("VI")]);
    expect(out.fixFirst.map((f) => f.problem)).toEqual([
      "문제4",
      "문제1",
      "문제2",
    ]);
    expect(out.mustFix.map((f) => f.problem)).toEqual(["문제3", "문제5"]);
  });
  it("핵심 오류가 없으면 입력 순서대로 앞 3개다", () => {
    const out = splitFixes(
      [fix("I", 1), fix("II", 2), fix("III", 3), fix("IV", 4)],
      [],
    );
    expect(out.fixFirst).toHaveLength(3);
    expect(out.mustFix).toHaveLength(1);
  });
  it("수정이 3개보다 적으면 억지로 채우지 않는다", () => {
    expect(splitFixes([fix("I")], [])).toEqual({
      fixFirst: [fix("I")],
      mustFix: [],
    });
    expect(splitFixes([], [err("I")])).toEqual({ fixFirst: [], mustFix: [] });
  });
});

function modelEval(over: Partial<ModelEvaluation> = {}): ModelEvaluation {
  return {
    items: RUBRIC.map((r) => ({
      id: r.id,
      requirements: r.requirements.map((q) => ({
        id: q.id,
        met: true,
        note: "",
      })),
      evidence: `${r.id} 근거`,
    })),
    coreErrors: [],
    fixes: [],
    sources: [],
    checklist: CHECKLIST.map((c) => ({ id: c.id, met: true })),
    ...over,
  };
}

describe("validateModelEvaluationShape", () => {
  it("올바른 모양은 그대로 돌려준다", () => {
    expect(validateModelEvaluationShape(modelEval())).not.toBeNull();
  });
  it("객체가 아니거나 항목이 모자라면 null 이다", () => {
    expect(validateModelEvaluationShape(null)).toBeNull();
    expect(validateModelEvaluationShape("x")).toBeNull();
    expect(validateModelEvaluationShape({})).toBeNull();
    const m = modelEval();
    expect(
      validateModelEvaluationShape({ ...m, items: m.items.slice(1) }),
    ).toBeNull();
  });
  it("요건 id 가 루브릭과 다르면 null 이다", () => {
    const m = modelEval();
    const bad = structuredClone(m);
    must(must(bad.items[0]).requirements[0]).id = "linkage-9";
    expect(validateModelEvaluationShape(bad)).toBeNull();
    const short = structuredClone(m);
    must(short.items[1]).requirements.pop();
    expect(validateModelEvaluationShape(short)).toBeNull();
  });
  it("항목 id 중복은 null 이다", () => {
    const m = modelEval();
    const dup = { ...m, items: [...m.items.slice(0, 5), must(m.items[0])] };
    expect(validateModelEvaluationShape(dup)).toBeNull();
  });
  it("핵심 오류 id 와 위치가 허용값이 아니면 null 이다", () => {
    expect(
      validateModelEvaluationShape(
        modelEval({
          coreErrors: [{ id: "bogus" as never, location: "I", detail: "d" }],
        }),
      ),
    ).toBeNull();
    expect(
      validateModelEvaluationShape(
        modelEval({
          coreErrors: [
            { id: "overclaim", location: "IX" as never, detail: "d" },
          ],
        }),
      ),
    ).toBeNull();
    expect(
      validateModelEvaluationShape(
        modelEval({
          coreErrors: [{ id: "overclaim", location: "V", detail: "d" }],
        }),
      ),
    ).not.toBeNull();
  });
  it("수정, 출처, 체크리스트의 타입이 틀리면 null 이다", () => {
    expect(
      validateModelEvaluationShape({
        ...modelEval(),
        fixes: [{ location: "I" }],
      }),
    ).toBeNull();
    expect(
      validateModelEvaluationShape({
        ...modelEval(),
        sources: [{ text: "a", hasUrlOrCitation: "yes" }],
      }),
    ).toBeNull();
    expect(
      validateModelEvaluationShape({
        ...modelEval(),
        checklist: [{ id: "c01", met: 1 }],
      }),
    ).toBeNull();
  });
});

describe("buildEvaluation (No.82~96)", () => {
  it("전부 충족하면 만점과 소규모 보완 라벨이다", () => {
    const r = buildEvaluation(modelEval(), facts());
    expect(r.total).toBe(100);
    expect(r.label).toBe("ready_with_minor_edits");
    expect(r.items.map((i) => i.id)).toEqual(RUBRIC.map((x) => x.id));
    expect(r.items.every((i) => i.level === 4 && i.capReason === null)).toBe(
      true,
    );
    expect(r.coreErrors).toEqual([]);
  });
  it("수준 3 항목 하나가 있으면 점수가 배점 비례로 줄고 수정 필요가 된다(실제 값 18.8)", () => {
    const m = modelEval();
    must(must(m.items[2]).requirements[0]).met = false; // method 25점
    const r = buildEvaluation(m, facts());
    expect(r.items[2]?.score).toBe(18.8);
    expect(r.total).toBe(93.8);
    expect(r.label).toBe("ready_with_minor_edits");
  });
  it("수준 2 항목은 12.5 점이고 수정 필요 라벨이다", () => {
    const m = modelEval();
    must(must(m.items[2]).requirements[0]).met = false;
    must(must(m.items[2]).requirements[1]).met = false;
    const r = buildEvaluation(m, facts());
    expect(r.items[2]?.score).toBe(12.5);
    expect(r.total).toBe(87.5);
    expect(r.label).toBe("revision_needed");
  });
  it("자리표시자와 핵심 오류 상한이 동시에 걸린다", () => {
    const m = modelEval({
      coreErrors: [
        { id: "variable_mismatch", location: "III", detail: "불일치" },
      ],
      fixes: [fix("III"), fix("I")],
    });
    const r = buildEvaluation(m, facts({ placeholders: { III: 2 } }));
    const method = must(r.items.find((i) => i.id === "method"));
    const structure = must(r.items.find((i) => i.id === "structure"));
    expect(method.level).toBe(2);
    expect(method.capReason).not.toBeNull();
    expect(structure.level).toBe(1); // no_placeholders 미충족이라 3, 상한 1
    expect(structure.score).toBe(2.5);
    expect(r.coreErrors.map((e) => e.id)).toEqual([
      "variable_mismatch",
      "placeholder_left",
    ]);
    expect(r.label).toBe("major_revision_needed");
    expect(r.placeholders).toEqual({ III: 2 });
    expect(r.fixFirst[0]?.location).toBe("III");
  });
  it("총점은 항목 점수 합이고 소수 첫째 자리까지다", () => {
    const m = modelEval();
    for (const it of m.items) must(it.requirements[0]).met = false;
    const r = buildEvaluation(m, facts());
    const sum = r.items.reduce((a, b) => a + b.score, 0);
    expect(r.total).toBe(Math.round(sum * 10) / 10);
  });
  it("예비 주제는 연계 0점이어도 나머지가 모두 4수준이면 소규모 보완 라벨이다", () => {
    const r = buildEvaluation(modelEval(), facts({ isProvisional: true }));
    expect(r.items[0]?.level).toBe(0);
    expect(r.items[0]?.score).toBe(0);
    expect(r.total).toBe(80);
    expect(r.label).toBe("ready_with_minor_edits");
  });
  it("예비 주제여도 다른 항목이 2수준 이하이면 수정 필요다", () => {
    const m = modelEval();
    must(must(m.items[2]).requirements[0]).met = false;
    must(must(m.items[2]).requirements[1]).met = false;
    const r = buildEvaluation(m, facts({ isProvisional: true }));
    expect(r.label).toBe("revision_needed");
  });
  it("예비 주제에 핵심 오류가 있으면 대폭 수정 필요다", () => {
    const m = modelEval({
      coreErrors: [{ id: "overclaim", location: "V", detail: "d" }],
    });
    expect(buildEvaluation(m, facts({ isProvisional: true })).label).toBe(
      "major_revision_needed",
    );
  });
  it("앱 오류(출처 없는 수치)가 모델 응답과 상관없이 근거 항목을 1수준으로 제한한다", () => {
    const r = buildEvaluation(
      modelEval(),
      facts({ hasNumbersInResults: true, sourceLineCount: 0 }),
    );
    expect(r.items.find((i) => i.id === "evidence")?.level).toBe(1);
    expect(r.coreErrors[0]?.id).toBe("unsourced_number");
  });
  it("체크리스트는 CHECKLIST 순서로 정렬하고 없는 id 는 미충족이다", () => {
    const r = buildEvaluation(
      modelEval({
        checklist: [
          { id: "c13", met: true },
          { id: "c02", met: true },
        ],
      }),
      facts(),
    );
    expect(r.checklist.map((c) => c.id)).toEqual(CHECKLIST.map((c) => c.id));
    expect(r.checklist.find((c) => c.id === "c13")?.met).toBe(true);
    expect(r.checklist.find((c) => c.id === "c01")?.met).toBe(false);
  });
  it("출처는 확인 완료 없이 상태만 붙는다", () => {
    const r = buildEvaluation(
      modelEval({ sources: [{ text: "a", hasUrlOrCitation: true }] }),
      facts(),
    );
    expect(r.sources).toEqual([{ text: "a", status: "supplied_unverified" }]);
  });
  it("모델이 항목을 빠뜨려도 근거는 빈 문자열이고 앱 판정 요건만 반영된다", () => {
    const r = buildEvaluation({ ...modelEval(), items: [] }, facts());
    expect(r.items).toHaveLength(6);
    expect(r.items[0]?.evidence).toBe("");
  });
});
