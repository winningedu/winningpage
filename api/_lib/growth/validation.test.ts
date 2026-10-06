// 성장설계 생성 단계 응답 검증 테스트(No.87, No.88, No.89, No.95, No.163).
import { describe, expect, test } from "vitest";
import {
  buildRetryNote,
  canRetry,
  collectText,
  findForbiddenPhrases,
  MAX_MODEL_ATTEMPTS_PER_SESSION,
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

describe("validateStep 6·7단계(근거 연결)", () => {
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
      "제목: 나의 탐구",
    ]) {
      expect(codes(body)).toContain("topic_generated");
    }
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

describe("validateStep 8단계(리포트 확정)", () => {
  const item = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    format: "text",
    badge: "A",
    status: "ok",
    evidence_ids: ["e1"],
    ...extra,
  });
  const run = (sections: unknown[]) => validateStep(8, { sections }, ctx);

  test("섹션 id 집합이 기대와 같고 format·badge 가 있으면 통과", () => {
    expect(run([item("a"), item("b", { status: "no_data" })])).toEqual({
      ok: true,
      issues: [],
    });
  });

  test("누락 섹션은 missing_section(No.87: no_data 로 존재해야 함)", () => {
    const r = run([item("a")]);
    const hit = r.issues.find((i) => i.code === "missing_section");
    expect(hit?.path).toBe("b");
  });

  test("초과 섹션은 unexpected_section", () => {
    const r = run([item("a"), item("b"), item("c")]);
    expect(r.issues.find((i) => i.code === "unexpected_section")?.path).toBe(
      "c",
    );
  });

  test("format 과 badge 누락을 각각 보고한다", () => {
    const r = run([
      item("a", { format: undefined }),
      item("b", { badge: undefined }),
    ]);
    expect(r.issues.find((i) => i.code === "missing_format")?.path).toBe("a");
    expect(r.issues.find((i) => i.code === "missing_badge")?.path).toBe("b");
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

  test("세션당 시도 상한 10: 9회까지 허용, 10회부터 거부", () => {
    expect(MAX_MODEL_ATTEMPTS_PER_SESSION).toBe(10);
    expect(canRetry(9)).toBe(true);
    expect(canRetry(10)).toBe(false);
    expect(canRetry(11)).toBe(false);
    expect(canRetry(2, 3)).toBe(true);
    expect(canRetry(3, 3)).toBe(false);
  });
});
