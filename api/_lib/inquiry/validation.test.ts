// 심화탐구 모델 응답 검증기 테스트(No.2, 12, 15, 48, 49, 55, 64, 99, 122, 123, 125, 126).
import { describe, expect, it } from "vitest";
import { CHECKLIST, RUBRIC } from "./constants.js";
import {
  CITATION_RE,
  collectText,
  completeSentenceCount,
  exceedsLength,
  findFabricatedCitations,
  findForbiddenPhrases,
  findMarkdown,
  FORBIDDEN_OUTPUT_PHRASES,
  buildRetryNote,
  canRetry,
  parseJsonResponse,
  stripCodeFence,
  TRUNCATED_RETRY_NOTE,
  validateDesignResponse,
  validateEvaluationResponse,
  validateTopicsResponse,
} from "./validation.js";

describe("금지 산출 사전", () => {
  it("사전은 10개다", () => {
    expect(FORBIDDEN_OUTPUT_PHRASES).toHaveLength(10);
  });

  it("공백을 끼워 쓴 금지 표현도 찾는다", () => {
    expect(findForbiddenPhrases("이 주제는 합격 가 능성이 높다")).toEqual([
      "합격 가능성",
    ]);
  });

  it("깨끗한 문장은 빈 배열이다", () => {
    expect(findForbiddenPhrases("자료의 한계를 밝힌다")).toEqual([]);
  });

  it("여러 개를 중복 없이 돌려준다", () => {
    const found = findForbiddenPhrases("표절 표절 대필 학생부 등급");
    expect(found).toEqual(["표절", "대필", "학생부 등급"]);
  });
});

describe("마크다운 탐지", () => {
  it("별표를 찾는다", () => {
    expect(findMarkdown("**강조** 글")).not.toEqual([]);
  });

  it("줄 머리 샵을 찾는다", () => {
    expect(findMarkdown("제목\n## 소제목")).not.toEqual([]);
  });

  it("백틱을 찾는다", () => {
    expect(findMarkdown("코드 `x` 입니다")).not.toEqual([]);
  });

  it("줄 머리 하이픈 목록을 찾는다", () => {
    expect(findMarkdown("첫째\n- 항목")).not.toEqual([]);
  });

  it("문장 중간의 샵과 하이픈은 허용한다", () => {
    expect(findMarkdown("1번 # 표시와 A-B 비교")).toEqual([]);
  });
});

describe("서지 창작 탐지", () => {
  it("DOI 를 찾는다", () => {
    expect(findFabricatedCitations("doi 10.1038/nature123")).not.toEqual([]);
  });

  it("URL 을 찾는다", () => {
    expect(findFabricatedCitations("https://example.com 참고")).not.toEqual([]);
    expect(findFabricatedCitations("http://a.kr")).not.toEqual([]);
  });

  it("외 n명 을 찾는다", () => {
    expect(findFabricatedCitations("김철수 외 3명")).not.toEqual([]);
  });

  it("연도 괄호를 찾는다", () => {
    expect(findFabricatedCitations("연구(2019)에 따르면")).not.toEqual([]);
    expect(findFabricatedCitations("연구(1998)")).not.toEqual([]);
  });

  it("일반 문장은 통과한다", () => {
    expect(findFabricatedCitations("기상청 자료를 검색한다")).toEqual([]);
  });

  it("CITATION_RE 는 상태를 갖지 않는다", () => {
    expect(CITATION_RE.global).toBe(false);
  });
});

describe("텍스트 유틸", () => {
  it("collectText 는 중첩 문자열을 모은다", () => {
    const text = collectText({ a: "가", b: ["나", { c: "다" }], d: 3 });
    expect(text.split("\n").filter(Boolean)).toEqual(["가", "나", "다"]);
  });

  it("completeSentenceCount 는 다. 로 끝나는 문장 수를 센다", () => {
    expect(completeSentenceCount("가 한다. 나 했다. 다")).toBe(2);
    expect(completeSentenceCount("명사형 정리")).toBe(0);
  });

  it("exceedsLength 는 상한 초과만 true 다", () => {
    expect(exceedsLength("가".repeat(100), 100)).toBe(false);
    expect(exceedsLength("가".repeat(101), 100)).toBe(true);
  });
});

describe("JSON 응답 파싱", () => {
  it("코드 울타리를 벗긴다", () => {
    expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripCodeFence('{"a":1}')).toBe('{"a":1}');
  });

  it("울타리가 있어도 파싱한다", () => {
    const r = parseJsonResponse('```json\n{"a":1}\n```');
    expect(r).toEqual({ ok: true, value: { a: 1 } });
  });

  it("깨진 JSON 은 invalid_json 이슈다", () => {
    const r = parseJsonResponse('{"a":');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issue.code).toBe("invalid_json");
  });
});

describe("재시도", () => {
  it("이슈마다 고치라는 문구를 만든다", () => {
    const notes = buildRetryNote([
      { code: "x", message: "문제 A.", path: "topics[0]" },
      { code: "y", message: "문제 B." },
    ]);
    expect(notes[0]).toContain("[topics[0]] 문제 A.");
    expect(notes[1]).toContain("문제 B.");
  });

  it("잘림이나 깨진 JSON 이면 분량 축소 문구를 덧붙인다", () => {
    const notes = buildRetryNote([{ code: "invalid_json", message: "깨짐." }]);
    expect(notes.at(-1)).toBe(TRUNCATED_RETRY_NOTE);
    expect(TRUNCATED_RETRY_NOTE).toContain("절반");
  });

  it("canRetry 는 시도 상한 10 미만일 때만 true 다", () => {
    expect(canRetry(9)).toBe(true);
    expect(canRetry(10)).toBe(false);
  });
});

// ── 주제 추천 응답 ──────────────────────────────────────────────────────────

const KINDS = ["followup", "transfer", "critique", "extension"] as const;

function topic(n: number, over: Record<string, unknown> = {}) {
  return {
    linkKind: KINDS[n % 4],
    title: `주제 제목 ${n}번`,
    subtitle: "부제",
    question: `질문 ${n}은 무엇을 바꾸는가?`,
    hypothesis1: "가설 1",
    hypothesis2: "가설 2",
    verifiability: "공개 통계로 확인한다",
    concepts: ["개념1", "개념2", "개념3", "개념4"],
    methodSteps: ["단계1", "단계2", "단계3", "단계4"],
    sourceCandidates: ["기상청 자료"],
    reason: "이어지는 이유",
    careerLink: "직무의 성격",
    nextDirection: "다음 방향",
    path: { from: "출발", via: "후속형", to: "질문" },
    fitReason: null,
    followUpQuestions: [],
    ...over,
  };
}

const three = () => [topic(0), topic(1), topic(2)];
const ctx = { expectProvisional: false, excludedTitles: [] as string[] };

describe("validateTopicsResponse", () => {
  it("정상 응답 3개를 정규화해 돌려준다", () => {
    const r = validateTopicsResponse({ topics: three() }, ctx);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.topics).toHaveLength(3);
      expect(r.topics[0]?.linkKind).toBe("followup");
      expect(r.topics[0]?.fitReason).toBeNull();
    }
  });

  it("최상위 배열도 받는다", () => {
    expect(validateTopicsResponse(three(), ctx).ok).toBe(true);
  });

  it("3개가 아니면 실패한다", () => {
    const r = validateTopicsResponse({ topics: three().slice(0, 2) }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.code).toBe("topics_count");
  });

  it("객체가 아니면 invalid_payload 다", () => {
    const r = validateTopicsResponse("x", ctx);
    expect(r.ok).toBe(false);
  });

  it("제목이 서로 같으면 실패한다(공백 무시)", () => {
    const t = three();
    t[1] = topic(1, { title: "주제 제목0번".replace("0번", " 0번") });
    t[0] = topic(0, { title: "주제 제목 0번" });
    const r = validateTopicsResponse({ topics: t }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.issues.some((i) => i.code === "duplicate_title")).toBe(true);
  });

  it("직전 주제 제외 목록과 같으면 실패한다", () => {
    const r = validateTopicsResponse(
      { topics: three() },
      { ...ctx, excludedTitles: ["주제제목1번"] },
    );
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.issues.some((i) => i.code === "excluded_title")).toBe(true);
  });

  it("연계 유형이 겹치면 실패한다", () => {
    const t = three();
    t[2] = topic(2, { linkKind: "followup" });
    const r = validateTopicsResponse({ topics: t }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.issues.some((i) => i.code === "link_kind_duplicate")).toBe(true);
  });

  it("허용되지 않은 연계 유형은 실패한다", () => {
    const t = three();
    t[0] = topic(0, { linkKind: "indirect" });
    const r = validateTopicsResponse({ topics: t }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.issues.some((i) => i.code === "link_kind_invalid")).toBe(true);
  });

  it("비어 있는 항목은 실패한다", () => {
    const t = three();
    t[0] = topic(0, { reason: "  " });
    const r = validateTopicsResponse({ topics: t }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.path).toBe("topics[0].reason");
  });

  it("개념과 방법 단계는 정확히 4개다", () => {
    const t = three();
    t[0] = topic(0, { concepts: ["a", "b", "c"] });
    t[1] = topic(1, { methodSteps: ["a", "b", "c", "d", "e"] });
    const r = validateTopicsResponse({ topics: t }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const codes = r.issues.map((i) => i.code);
      expect(codes).toContain("concepts_count");
      expect(codes).toContain("method_steps_count");
    }
  });

  it("질문은 물음표로 끝나는 한 문장이어야 한다", () => {
    const t = three();
    t[0] = topic(0, { question: "무엇을 바꾸는지 설명한다." });
    t[1] = topic(1, { question: "첫째는 무엇인가? 둘째는 무엇인가?" });
    const r = validateTopicsResponse({ topics: t }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.filter((i) => i.code === "question_format")).toHaveLength(
        2,
      );
    }
  });

  it("금지 산출, 마크다운, 서지 창작은 실패한다", () => {
    const t = three();
    t[0] = topic(0, { reason: "합격 가능성이 높다" });
    t[1] = topic(1, { subtitle: "**굵게**" });
    t[2] = topic(2, { sourceCandidates: ["김철수 외 3명(2019)"] });
    const r = validateTopicsResponse({ topics: t }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const codes = r.issues.map((i) => i.code);
      expect(codes).toContain("forbidden_phrase");
      expect(codes).toContain("markdown");
      expect(codes).toContain("fabricated_citation");
    }
  });

  it("예비 주제면 확인 질문이 정확히 3개여야 한다", () => {
    const p = { expectProvisional: true, excludedTitles: [] as string[] };
    const bad = validateTopicsResponse({ topics: three() }, p);
    expect(bad.ok).toBe(false);
    const good = validateTopicsResponse(
      {
        topics: three().map((t) => ({
          ...t,
          followUpQuestions: ["질문 하나?", "질문 둘?", "질문 셋?"],
        })),
      },
      p,
    );
    expect(good.ok).toBe(true);
  });

  it("예비 주제가 아니면 확인 질문을 비워 정규화한다", () => {
    const r = validateTopicsResponse(
      {
        topics: three().map((t) => ({
          ...t,
          followUpQuestions: ["남은 질문?"],
        })),
      },
      ctx,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.topics[0]?.followUpQuestions).toEqual([]);
  });

  it("서버가 정하는 fit 과 linkageType 은 응답에 있어도 버린다", () => {
    const r = validateTopicsResponse(
      {
        topics: three().map((t) => ({
          ...t,
          fit: "off",
          linkageType: "direct",
        })),
      },
      ctx,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.topics[0]).not.toHaveProperty("fit");
      expect(r.topics[0]).not.toHaveProperty("linkageType");
    }
  });
});

// ── 설계 리포트 응답 ────────────────────────────────────────────────────────

const SECTION_ORDER = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

function plan(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    role: "이 절의 역할",
    must: ["필수 하나", "필수 둘", "필수 셋"],
    avoid: ["피할 것 하나", "피할 것 둘"],
    tip: "작성 요령",
    ...over,
  };
}

function design(over: Record<string, unknown> = {}) {
  return {
    verifiability: "공개 자료로 확인할 수 있다",
    sections: SECTION_ORDER.map((id) => plan(id)),
    sourceTable: [{ item: "기온 자료", source: "기상청", asOf: "2020" }],
    searchPlan: [{ keyword: "기온", institution: "기상청", item: "연평균" }],
    interpretQuestions: {
      same: "같으면?",
      different: "다르면?",
      insufficient: "부족하면?",
    },
    scope: { minimum: ["최소 범위"], optional: ["선택 심화"] },
    ...over,
  };
}

const dctx = { reliability: "A" as const };

function sectionsWith(id: string, over: Record<string, unknown>) {
  return SECTION_ORDER.map((s) => (s === id ? plan(s, over) : plan(s)));
}

describe("validateDesignResponse", () => {
  it("정상 응답을 정규화한다(출처와 기준 시점은 확인 필요로 덮는다)", () => {
    const r = validateDesignResponse(design(), dctx);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.design.sections.map((s) => s.id)).toEqual(SECTION_ORDER);
      expect(r.design.sourceTable).toEqual([
        { item: "기온 자료", source: "확인 필요", asOf: "확인 필요" },
      ]);
    }
  });

  it("8절이 전부 한 번씩 있어야 한다", () => {
    const r = validateDesignResponse(
      design({ sections: SECTION_ORDER.slice(0, 7).map((id) => plan(id)) }),
      dctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.issues.some((i) => i.code === "sections_ids")).toBe(true);
  });

  it("절 id 가 중복되면 실패한다", () => {
    const secs = SECTION_ORDER.map((id) => plan(id));
    secs[7] = plan("I");
    const r = validateDesignResponse(design({ sections: secs }), dctx);
    expect(r.ok).toBe(false);
  });

  it("must 는 3~5개, avoid 는 2~5개다", () => {
    const r1 = validateDesignResponse(
      design({ sections: sectionsWith("II", { must: ["a", "b"] }) }),
      dctx,
    );
    const r2 = validateDesignResponse(
      design({ sections: sectionsWith("II", { avoid: ["a"] }) }),
      dctx,
    );
    const r3 = validateDesignResponse(
      design({
        sections: sectionsWith("II", { must: ["a", "b", "c", "d", "e", "f"] }),
      }),
      dctx,
    );
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
    expect(r3.ok).toBe(false);
  });

  it("role 과 tip 이 비면 실패한다", () => {
    const r = validateDesignResponse(
      design({ sections: sectionsWith("III", { role: "", tip: " " }) }),
      dctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.issues.map((i) => i.path)).toEqual(
        expect.arrayContaining(["sections[2].role", "sections[2].tip"]),
      );
  });

  it("글자 수 상한을 넘으면 실패한다(항목 100, tip 120)", () => {
    const longMust = validateDesignResponse(
      design({
        sections: sectionsWith("IV", { must: ["가".repeat(101), "b", "c"] }),
      }),
      dctx,
    );
    const longTip = validateDesignResponse(
      design({ sections: sectionsWith("IV", { tip: "가".repeat(121) }) }),
      dctx,
    );
    const okTip = validateDesignResponse(
      design({ sections: sectionsWith("IV", { tip: "가".repeat(120) }) }),
      dctx,
    );
    expect(longMust.ok).toBe(false);
    expect(longTip.ok).toBe(false);
    expect(okTip.ok).toBe(true);
  });

  it("must 나 tip 한 항목에 완결문이 2개 이상이면 대필로 보고 실패한다", () => {
    const r = validateDesignResponse(
      design({
        sections: sectionsWith("V", {
          must: ["가설을 판정한다. 이유를 쓴다.", "b", "c"],
        }),
      }),
      dctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.issues.some((i) => i.code === "ghostwriting")).toBe(true);
    const ok = validateDesignResponse(
      design({ sections: sectionsWith("V", { tip: "가설을 판정한다." }) }),
      dctx,
    );
    expect(ok.ok).toBe(true);
  });

  it("검증 가능성, 출처표, 검색 계획, 해석 질문, 최소 범위가 비면 실패한다", () => {
    expect(validateDesignResponse(design({ verifiability: "" }), dctx).ok).toBe(
      false,
    );
    expect(validateDesignResponse(design({ sourceTable: [] }), dctx).ok).toBe(
      false,
    );
    expect(
      validateDesignResponse(design({ sourceTable: [{ item: " " }] }), dctx).ok,
    ).toBe(false);
    expect(validateDesignResponse(design({ searchPlan: [] }), dctx).ok).toBe(
      false,
    );
    expect(
      validateDesignResponse(
        design({ searchPlan: [{ keyword: "a", institution: "", item: "c" }] }),
        dctx,
      ).ok,
    ).toBe(false);
    expect(
      validateDesignResponse(
        design({
          interpretQuestions: { same: "a", different: "b", insufficient: "" },
        }),
        dctx,
      ).ok,
    ).toBe(false);
    expect(
      validateDesignResponse(
        design({ scope: { minimum: [], optional: [] } }),
        dctx,
      ).ok,
    ).toBe(false);
  });

  it("출처표가 {rows:[...]} 형태여도 받는다", () => {
    const r = validateDesignResponse(
      design({ sourceTable: { rows: [{ item: "기온 자료" }] } }),
      dctx,
    );
    expect(r.ok).toBe(true);
  });

  it("금지 산출, 마크다운, 서지 창작은 실패한다", () => {
    const r = validateDesignResponse(
      design({
        verifiability: "예상 점수를 계산한다",
        sections: sectionsWith("III", { tip: "**굵게**" }),
        searchPlan: [{ keyword: "https://a.kr", institution: "b", item: "c" }],
      }),
      dctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const codes = r.issues.map((i) => i.code);
      expect(codes).toEqual(
        expect.arrayContaining([
          "forbidden_phrase",
          "markdown",
          "fabricated_citation",
        ]),
      );
    }
  });

  it("신뢰도 B 는 Ⅰ절 must 나 tip 에 다루지 못했다 표현이 있어야 한다", () => {
    const bctx = { reliability: "B" as const };
    expect(validateDesignResponse(design(), bctx).ok).toBe(false);
    const inMust = validateDesignResponse(
      design({
        sections: sectionsWith("I", {
          must: ["확인으로 다루지 못했다 고 밝힌다", "b", "c"],
        }),
      }),
      bctx,
    );
    expect(inMust.ok).toBe(true);
    const inTip = validateDesignResponse(
      design({ sections: sectionsWith("I", { tip: "다루지 못했다 로 쓴다" }) }),
      bctx,
    );
    expect(inTip.ok).toBe(true);
  });

  it("신뢰도 B 에서 확인하지 않았다 표현이 Ⅰ절에 있으면 실패한다", () => {
    const r = validateDesignResponse(
      design({
        sections: sectionsWith("I", {
          must: ["다루지 못했다 고 쓴다", "확인하지 않았다 고 쓴다", "c"],
        }),
      }),
      { reliability: "C" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(
        r.issues.some((i) => i.code === "reliability_phrase_forbidden"),
      ).toBe(true);
  });

  it("신뢰도 A 는 표현 규칙을 적용하지 않는다", () => {
    expect(
      validateDesignResponse(
        design({
          sections: sectionsWith("I", { tip: "확인하지 않았다 고 쓴다" }),
        }),
        dctx,
      ).ok,
    ).toBe(true);
  });
});

// ── 평가 응답 ───────────────────────────────────────────────────────────────

function evaluation(over: Record<string, unknown> = {}) {
  return {
    items: RUBRIC.map((item) => ({
      id: item.id,
      requirements: item.requirements.map((r) => ({
        id: r.id,
        met: true,
        note: "근거",
      })),
      evidence: "학생 글에서 확인한 근거",
    })),
    coreErrors: [],
    fixes: [
      {
        location: "V",
        problem: "문제",
        impact: "영향",
        action: "수정",
        check: "확인 기준",
      },
    ],
    sources: [{ text: "기상청 자료", hasUrlOrCitation: false }],
    checklist: CHECKLIST.map((c) => ({ id: c.id, met: true })),
    ...over,
  };
}

describe("validateEvaluationResponse", () => {
  it("정상 응답을 돌려준다", () => {
    const r = validateEvaluationResponse(evaluation());
    expect(r.ok).toBe(true);
  });

  it("알 수 없는 키는 정규화 때 버린다", () => {
    const r = validateEvaluationResponse({ ...evaluation(), total: 100 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.evaluation).not.toHaveProperty("total");
  });

  it("6항목이 전부 한 번씩 있어야 한다", () => {
    const e = evaluation();
    const r = validateEvaluationResponse({ ...e, items: e.items.slice(1) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.code === "items_ids")).toBe(true);
  });

  it("각 항목의 요건 4개 id 가 루브릭과 일치해야 한다", () => {
    const e = evaluation();
    const items = e.items.map((it, i) =>
      i === 0 ? { ...it, requirements: it.requirements.slice(1) } : it,
    );
    const r = validateEvaluationResponse({ ...e, items });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.issues.some((i) => i.code === "requirements_ids")).toBe(true);
  });

  it("met 가 불리언이 아니면 실패한다", () => {
    const e = evaluation();
    const items = e.items.map((it, i) =>
      i === 1
        ? {
            ...it,
            requirements: it.requirements.map((r, j) =>
              j === 0 ? { ...r, met: "yes" } : r,
            ),
          }
        : it,
    );
    expect(validateEvaluationResponse({ ...e, items }).ok).toBe(false);
  });

  it("핵심 오류 id 와 위치가 허용값이어야 한다", () => {
    const bad = validateEvaluationResponse(
      evaluation({ coreErrors: [{ id: "nope", location: "V", detail: "d" }] }),
    );
    const badLoc = validateEvaluationResponse(
      evaluation({
        coreErrors: [{ id: "overclaim", location: "IX", detail: "d" }],
      }),
    );
    expect(bad.ok).toBe(false);
    expect(badLoc.ok).toBe(false);
  });

  it("앱이 판정하는 핵심 오류(⑤ ⑥)는 버리고 통과시킨다", () => {
    const r = validateEvaluationResponse(
      evaluation({
        coreErrors: [
          { id: "placeholder_left", location: "V", detail: "d" },
          { id: "overclaim", location: "V", detail: "d" },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const ids = (
        r.evaluation as { coreErrors: { id: string }[] }
      ).coreErrors.map((c) => c.id);
      expect(ids).toEqual(["overclaim"]);
    }
  });

  it("먼저 고칠 것은 5필드가 모두 차 있어야 한다", () => {
    const r = validateEvaluationResponse(
      evaluation({
        fixes: [
          {
            location: "V",
            problem: "문제",
            impact: "",
            action: "수정",
            check: "기준",
          },
        ],
      }),
    );
    expect(r.ok).toBe(false);
  });

  it("체크리스트 13개 id 가 전부 있어야 한다", () => {
    const e = evaluation();
    const r = validateEvaluationResponse({
      ...e,
      checklist: e.checklist.slice(1),
    });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.issues.some((i) => i.code === "checklist_ids")).toBe(true);
  });

  it("sources 가 배열이 아니면 실패한다", () => {
    expect(validateEvaluationResponse(evaluation({ sources: "x" })).ok).toBe(
      false,
    );
  });

  it("피드백의 금지 산출과 마크다운은 실패한다", () => {
    const e = evaluation();
    const items = e.items.map((it, i) =>
      i === 0 ? { ...it, evidence: "합격 가능성이 높다" } : it,
    );
    const r1 = validateEvaluationResponse({ ...e, items });
    expect(r1.ok).toBe(false);
    const r2 = validateEvaluationResponse(
      evaluation({
        fixes: [
          {
            location: "V",
            problem: "**문제**",
            impact: "a",
            action: "b",
            check: "c",
          },
        ],
      }),
    );
    expect(r2.ok).toBe(false);
  });

  it("학생 글을 옮긴 출처 줄과 단정 표현 인용은 검사하지 않는다", () => {
    const r = validateEvaluationResponse(
      evaluation({
        sources: [
          {
            text: "- https://example.com 김철수 외 3명(2019)",
            hasUrlOrCitation: true,
          },
        ],
        fixes: [
          {
            location: "V",
            problem: "학생이 증명했다 라고 썼다",
            impact: "a",
            action: "b",
            check: "c",
          },
        ],
      }),
    );
    expect(r.ok).toBe(true);
  });
});
