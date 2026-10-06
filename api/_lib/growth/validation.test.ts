// 성장설계 생성 단계 응답 검증 테스트(No.87, No.88, No.89, No.95, No.163).
import { describe, expect, test } from "vitest";
import { SECTION_REGISTRY } from "./sections.js";
import {
  buildRetryNote,
  canRetry,
  collectText,
  findForbiddenPhrases,
  MAX_MODEL_ATTEMPTS_PER_SESSION,
  MAX_MODEL_ATTEMPTS_PER_STEP,
  type ValidationContext,
  validateStep,
} from "./validation.js";

const ctx = { expectedSectionIds: ["a", "b"] };

describe("findForbiddenPhrases", () => {
  test("금지 표현을 찾고 중복은 제거한다", () => {
    const found = findForbiddenPhrases(
      "합격 가능성이 높고 안정권이다. 합격 가능성도 있다.",
    );
    expect(found).toContain("합격 가능성");
    expect(found).toContain("안정권");
    expect(found.filter((p) => p === "합격 가능성")).toHaveLength(1);
  });

  test("공백을 제거하고 비교하며 사전 원문으로 돌려준다", () => {
    expect(findForbiddenPhrases("합격가능성이 있다")).toContain("합격 가능성");
    expect(findForbiddenPhrases("합격  확률은")).toContain("합격 확률");
  });

  test("금지 표현이 없으면 빈 배열", () => {
    expect(findForbiddenPhrases("탐구 방향을 제시한다")).toEqual([]);
  });
});

describe("collectText / validateStep 1~4단계", () => {
  test("깊은 객체와 배열 안의 문자열을 모두 이어 붙인다", () => {
    const text = collectText({ a: ["x", { b: "y" }], n: 3 });
    expect(text).toContain("x");
    expect(text).toContain("y");
  });

  test("깊은 객체 안 금지 표현은 forbidden_phrase 로 걸린다", () => {
    const r = validateStep(
      1,
      { items: [{ note: { deep: "예측 결과" } }] },
      ctx,
    );
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("forbidden_phrase");
  });

  test("정상 payload 는 1~4단계에서 통과한다", () => {
    for (const step of [1, 2, 3, 4] as const) {
      expect(validateStep(step, { items: ["활동"] }, ctx)).toEqual({
        ok: true,
        issues: [],
      });
    }
  });

  test("payload 가 객체가 아니면 invalid_payload", () => {
    for (const bad of [null, "text", 3, undefined]) {
      const r = validateStep(2, bad, ctx);
      expect(r.ok).toBe(false);
      expect(r.issues[0]?.code).toBe("invalid_payload");
    }
  });
});

describe("validateStep 5단계(계산식)", () => {
  const codes = (p: unknown) =>
    validateStep(5, p, ctx).issues.map((i) => i.code);

  test("formula 가 없으면 missing_formula", () => {
    expect(codes({ score: 80 })).toContain("missing_formula");
  });

  test("formula 에 나눗셈 기호와 % 가 모두 있으면 통과", () => {
    expect(codes({ formula: "(일치 4 ÷ 전체 5) × 100 = 80%" })).toEqual([]);
    expect(codes({ formula: "4 / 5 = 80%" })).toEqual([]);
  });

  test("formula 에 나눗셈 기호나 % 가 없으면 invalid_formula", () => {
    expect(codes({ formula: "4 나누기 5 = 80%" })).toContain("invalid_formula");
    expect(codes({ formula: "4 ÷ 5 = 0.8" })).toContain("invalid_formula");
  });
});

describe("validateStep 5단계(기대 계산식 일치)", () => {
  const f = "(일치 4 ÷ 전체 5) × 100 = 80%";
  const run = (formula: string, expectedFormula?: string) =>
    validateStep(
      5,
      { formula },
      {
        ...ctx,
        ...(expectedFormula === undefined ? {} : { expectedFormula }),
      },
    );

  test("공백 차이만 있으면 통과", () => {
    expect(run("(일치 4÷전체 5)×100=80%", f).issues).toEqual([]);
  });

  test("값이 다르면 formula_mismatch 와 formula 경로", () => {
    const hit = run("(일치 3 ÷ 전체 5) × 100 = 60%", f).issues.find(
      (i) => i.code === "formula_mismatch",
    );
    expect(hit?.path).toBe("formula");
  });

  test("expectedFormula 가 없으면 일치 검사를 생략한다", () => {
    expect(run("4 / 5 = 80%").issues).toEqual([]);
  });
});

describe("validateStep 6, 7단계(근거 연결)", () => {
  test("no_data 가 아닌 항목에 evidence_ids 가 없으면 missing_evidence 와 항목 id 경로", () => {
    for (const step of [6, 7] as const) {
      const r = validateStep(
        step,
        {
          sections: [
            { id: "a", status: "ok", evidence_ids: [] },
            { id: "b", evidence_ids: ["e1"] },
          ],
        },
        ctx,
      );
      const hit = r.issues.filter((i) => i.code === "missing_evidence");
      expect(hit).toHaveLength(1);
      expect(hit[0]?.path).toBe("a");
    }
  });

  test("no_data 항목은 근거 없이도 면제된다", () => {
    const r = validateStep(
      6,
      { sections: [{ id: "a", status: "no_data" }] },
      ctx,
    );
    expect(r).toEqual({ ok: true, issues: [] });
  });

  test("근거가 있으면 통과", () => {
    const r = validateStep(
      7,
      { sections: [{ id: "a", status: "ok", evidence_ids: ["e1"] }] },
      ctx,
    );
    expect(r.ok).toBe(true);
  });
});

describe("validateStep 7단계(주제 생성 금지)", () => {
  const ok = { id: "a", status: "ok" as const, evidence_ids: ["e1"] };
  const codes = (body: string, c = ctx) =>
    validateStep(7, { sections: [{ ...ok, body }] }, c).issues.map(
      (i) => i.code,
    );

  test("기본 패턴으로 구체 주제 제시를 탐지한다", () => {
    for (const body of [
      "탐구 주제: 미세먼지 분석",
      "주제 : “기후 변화”",
      "연구 주제：전기차",
    ]) {
      expect(codes(body)).toContain("topic_generated");
    }
  });

  test("표 텍스트의 제목 항목은 주제 생성으로 보지 않는다", () => {
    expect(codes("제목: 활동 요약표")).toEqual([]);
  });

  test("방향과 조건만 제시하면 통과", () => {
    expect(codes("환경 계열 심화 방향을 권장한다")).toEqual([]);
  });

  test("topicPatterns 를 주면 기본 패턴 대신 쓴다", () => {
    const custom = { ...ctx, topicPatterns: [/과제명/] };
    expect(codes("과제명 하나", custom)).toContain("topic_generated");
    expect(codes("탐구 주제: 미세먼지", custom)).toEqual([]);
  });

  test("다른 단계에서는 주제 패턴을 검사하지 않는다", () => {
    expect(
      validateStep(6, { sections: [{ ...ok, body: "탐구 주제: x" }] }, ctx).ok,
    ).toBe(true);
  });
});

describe("validateStep 8단계(리포트 확정, sections 위임)", () => {
  const ids = SECTION_REGISTRY.map((d) => d.id);
  const ctx8 = { expectedSectionIds: ids };
  const full = (): Record<string, unknown>[] =>
    SECTION_REGISTRY.map((d) => ({
      id: d.id,
      title: d.title,
      format: d.format,
      badge: d.badge,
      status: "ok",
      evidence_ids: ["e1"],
      body: "내용",
    }));
  const run = (sections: unknown[], c: ValidationContext = ctx8) =>
    validateStep(8, { sections }, c);
  const edit = (id: string, patch: Record<string, unknown>) =>
    full().map((s) => (s.id === id ? { ...s, ...patch } : s));

  test("레지스트리로 만든 정상 37항목은 통과", () => {
    expect(ids).toHaveLength(37);
    expect(run(full())).toEqual({ ok: true, issues: [] });
  });

  test("레지스트리와 format 이 다르면 section_schema 와 항목 id 경로", () => {
    const def = SECTION_REGISTRY[0];
    const other = def?.format === "prose" ? "table" : "prose";
    const r = run(edit(ids[0] ?? "", { format: other }));
    const hit = r.issues.find((i) => i.code === "section_schema");
    expect(hit?.path).toBe(ids[0]);
  });

  test("no_data 항목에 no_data_reason 이 없으면 section_schema", () => {
    const r = run(edit("1-1", { status: "no_data", evidence_ids: [] }));
    const hit = r.issues.find(
      (i) => i.code === "section_schema" && i.path === "1-1",
    );
    expect(hit?.message).toContain("no_data_reason");
  });

  test("ok 항목에 evidence 가 없으면 missing_evidence", () => {
    const r = run(edit("1-2", { evidence_ids: [] }));
    expect(r.issues.find((i) => i.code === "missing_evidence")?.path).toBe(
      "1-2",
    );
  });

  test("누락 섹션은 section_schema 로 보고한다", () => {
    const r = run(full().slice(1));
    expect(
      r.issues.find((i) => i.code === "section_schema" && i.path === ids[0]),
    ).toBeDefined();
  });
});

describe("validateStep 6~8단계(근거 id 실존)", () => {
  const known = { ...ctx, knownEvidenceIds: ["e1", "e2"] };
  const sections = [
    { id: "a", status: "ok", evidence_ids: ["e1", "e9"] },
    { id: "b", status: "ok", evidence_ids: ["e2"] },
  ];

  test("목록에 없는 근거 id 를 unknown_evidence 로 탐지한다", () => {
    for (const step of [6, 7, 8] as const) {
      const hit = validateStep(step, { sections }, known).issues.filter(
        (i) => i.code === "unknown_evidence",
      );
      expect(hit).toHaveLength(1);
      expect(hit[0]?.path).toBe("a");
      expect(hit[0]?.message).toContain("e9");
    }
  });

  test("knownEvidenceIds 를 주지 않으면 검사를 생략한다", () => {
    for (const step of [6, 7] as const) {
      expect(
        validateStep(step, { sections }, ctx).issues.map((i) => i.code),
      ).not.toContain("unknown_evidence");
    }
  });
});

describe("buildRetryNote / canRetry(No.88, No.89)", () => {
  test("문제 목록을 한국어 줄글 배열로 만든다", () => {
    const note = buildRetryNote([
      {
        code: "forbidden_phrase",
        message: '금지 표현 "예측" 이(가) 포함되어 있습니다.',
      },
      { code: "missing_evidence", message: "근거 없음", path: "a" },
    ]);
    expect(note).toHaveLength(2);
    expect(note[0]).toContain("예측");
    expect(note[1]).toContain("a");
    expect(note[1]).toContain("근거 없음");
  });

  test("문제가 없으면 빈 배열", () => {
    expect(buildRetryNote([])).toEqual([]);
  });

  test("단계별 시도 상한 10: 9회까지 허용, 10회부터 거부", () => {
    expect(MAX_MODEL_ATTEMPTS_PER_STEP).toBe(10);
    expect(MAX_MODEL_ATTEMPTS_PER_SESSION).toBe(MAX_MODEL_ATTEMPTS_PER_STEP);
    expect(canRetry(9)).toBe(true);
    expect(canRetry(10)).toBe(false);
    expect(canRetry(11)).toBe(false);
  });
});
