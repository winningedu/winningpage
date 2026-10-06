import { describe, expect, it } from "vitest";
import { NO_DATA_TEXT } from "../sections.js";
import {
  buildStepPrompt,
  normalizeAxisSections,
  parseStepResponse,
  STEP_MAX_OUTPUT_TOKENS,
  STEP_RESPONSE_SCHEMAS,
  stepSectionIds,
  validateStepOutput,
} from "./prompts.js";
import type {
  ActivitySignal,
  ContextActivity,
  ReportContext,
} from "./types.js";

function activity(id: string, over: Partial<ContextActivity> = {}) {
  return {
    id,
    sourceProgram: "manual",
    gradeLabel: "고1",
    semester: 1,
    subjectGroup: "과학",
    subject: "물리",
    topic: "열 전달",
    text: `${id} 본문`,
    group: "curricular",
    ...over,
  } as ContextActivity;
}

function makeContext(over: Partial<ReportContext> = {}): ReportContext {
  const activities = [activity("a1"), activity("a2"), activity("a3")];
  return {
    reportId: "r1",
    profileId: "p1",
    track: "고2",
    currentGrade: "고2",
    range: { semesters: ["고1-1", "고1-2", "고2-1"], description: "범위" },
    omitted: { ids: [], reasons: [] },
    expectedSectionIds: [],
    noFirstYearData: false,
    activities,
    evidenceIds: activities.map((a) => a.id),
    survey: { career: "물리학자" },
    profile: {
      schoolType: null,
      grade: "고2",
      semester: 1,
      career: "물리학자",
      admissionYear: null,
    },
    grades: { system: null, semesters: [], note: null },
    universities: [],
    previousNarrative: null,
    nowIso: "2026-10-06T00:00:00.000Z",
    ...over,
  };
}

describe("단계 상수", () => {
  it("단계별 출력 토큰 상한을 노출한다", () => {
    expect(STEP_MAX_OUTPUT_TOKENS).toEqual({
      1: 4096,
      3: 2048,
      4: 3072,
      5: 2048,
      6: 6144,
      7: 6144,
    });
  });

  it("단계마다 응답 스키마가 있다", () => {
    for (const step of [1, 3, 4, 5, 6, 7] as const) {
      expect(STEP_RESPONSE_SCHEMAS[step]).toMatchObject({ type: "object" });
    }
  });
});

describe("stepSectionIds", () => {
  it("단계별 섹션 id 를 돌려준다", () => {
    const ctx = makeContext();
    expect(stepSectionIds(1, ctx)).toEqual([]);
    expect(stepSectionIds(3, ctx)).toEqual(["1-8"]);
    expect(stepSectionIds(4, ctx)).toEqual(["1-2", "1-6", "1-7", "1-11"]);
    expect(stepSectionIds(5, ctx)).toEqual(["1-9", "1-10"]);
    expect(stepSectionIds(6, ctx)).toHaveLength(10);
    expect(stepSectionIds(7, ctx)).toEqual([
      "3-2",
      "3-3",
      "3-4",
      "3-5",
      "3-6",
      "3-7",
      "3-11",
      "3-12",
      "3-13",
    ]);
  });

  it("제외 항목은 뺀다", () => {
    const ctx = makeContext({ omitted: { ids: ["3-2", "3-3"], reasons: [] } });
    expect(stepSectionIds(7, ctx)).not.toContain("3-2");
    expect(stepSectionIds(7, ctx)).not.toContain("3-3");
    expect(stepSectionIds(7, ctx)).toContain("3-4");
  });
});

describe("parseStepResponse 공통", () => {
  it("JSON 이 아니면 invalid_json", () => {
    const r = parseStepResponse(1, "not json", makeContext());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.code).toBe("invalid_json");
  });

  it("객체가 아니면 invalid_json", () => {
    const r = parseStepResponse(1, "[1]", makeContext());
    expect(r.ok).toBe(false);
  });
});

describe("1단계 활동 읽기 파싱", () => {
  it("모르는 activityId 는 버리고 빠진 활동은 axes [] 로 채운다", () => {
    const raw = JSON.stringify({
      signals: [
        {
          activityId: "a2",
          axes: ["A", "C"],
          method: "실험",
          keywords: ["열", "전도"],
          summary: "요약",
        },
        {
          activityId: "zzz",
          axes: ["B"],
          method: null,
          keywords: [],
          summary: "x",
        },
      ],
    });
    const r = parseStepResponse(1, raw, makeContext());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const signals = r.output.signals ?? [];
    expect(signals.map((s) => s.activityId)).toEqual(["a1", "a2", "a3"]);
    expect(signals[0]?.axes).toEqual([]);
    expect(signals[1]).toMatchObject({
      axes: ["A", "C"],
      method: "실험",
      linkage: [],
    });
  });

  it("키워드는 5개, 요약은 80자로 자르고 잘못된 축은 버린다", () => {
    const raw = JSON.stringify({
      signals: [
        {
          activityId: "a1",
          axes: ["A", "Z"],
          method: "토론",
          keywords: ["1", "2", "3", "4", "5", "6"],
          summary: "가".repeat(100),
        },
      ],
    });
    const r = parseStepResponse(1, raw, makeContext());
    if (!r.ok) throw new Error("expected ok");
    const s = r.output.signals?.[0];
    expect(s?.axes).toEqual(["A"]);
    expect(s?.keywords).toHaveLength(5);
    expect(s?.summary).toHaveLength(80);
  });

  it("signals 배열이 없으면 문제로 낸다", () => {
    const r = parseStepResponse(1, "{}", makeContext());
    expect(r.ok).toBe(false);
  });
});

describe("섹션 정규화", () => {
  const listItem = (text: string) => ({ text, evidence_ids: ["a1"] });

  it("레지스트리의 title, format, badge 로 덮어쓴다", () => {
    const raw = JSON.stringify({
      narrative: validNarrative(),
      sections: [
        {
          id: "1-8",
          title: "엉뚱한 제목",
          format: "prose",
          badge: "proposal",
          status: "ok",
          body: { items: [listItem("열 전달 반복")] },
          evidence_ids: ["a1"],
        },
      ],
    });
    const r = parseStepResponse(3, raw, makeContext());
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.output.sections?.[0]).toMatchObject({
      id: "1-8",
      title: "반복된 문제의식",
      format: "list",
      badge: "fact",
      status: "ok",
      body: [listItem("열 전달 반복")],
      evidence_ids: ["a1"],
    });
  });

  it("기대하지 않은 섹션 id 는 버린다", () => {
    const raw = JSON.stringify({
      narrative: validNarrative(),
      sections: [
        { id: "9-9", status: "ok", body: "x", evidence_ids: [] },
        {
          id: "1-8",
          status: "ok",
          body: [listItem("a")],
          evidence_ids: ["a1"],
        },
      ],
    });
    const r = parseStepResponse(3, raw, makeContext());
    if (!r.ok) throw new Error("expected ok");
    expect(r.output.sections?.map((x) => x.id)).toEqual(["1-8"]);
  });

  it("누락 섹션은 missing_section, 제외 항목은 요구하지 않는다", () => {
    const missing = parseStepResponse(
      7,
      JSON.stringify({ sections: [], planDraft: [] }),
      makeContext(),
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.issues.map((i) => i.code)).toContain("missing_section");
      expect(missing.issues.find((i) => i.path === "3-2")).toBeDefined();
    }
    const ctx = makeContext({
      omitted: {
        ids: ["3-2", "3-3", "3-4", "3-5", "3-6", "3-7", "3-11", "3-12"],
        reasons: [],
      },
    });
    const partial = parseStepResponse(
      7,
      JSON.stringify({
        sections: [
          {
            id: "3-13",
            status: "ok",
            body: [{ text: "x", evidence_ids: ["a1"] }],
            evidence_ids: ["a1"],
          },
        ],
        planDraft: [],
      }),
      ctx,
    );
    expect(partial.ok).toBe(true);
  });

  it("no_data 항목은 사유를 채우고, ok 인데 본문이 없으면 문제로 낸다", () => {
    const ctx = makeContext();
    const sections = stepSectionIds(6, ctx).map((id) => ({
      id,
      status: "no_data",
      evidence_ids: [],
    }));
    const r = parseStepResponse(6, JSON.stringify({ sections }), ctx);
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.output.sections?.[0]).toMatchObject({
      status: "no_data",
      no_data_reason: "자료 없음",
      body: { text: NO_DATA_TEXT, reason: "자료 없음" },
    });
    const bad = parseStepResponse(
      3,
      JSON.stringify({
        narrative: validNarrative(),
        sections: [{ id: "1-8", status: "ok", evidence_ids: ["a1"] }],
      }),
      ctx,
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.issues[0]?.code).toBe("invalid_section");
  });

  it("서술 본문은 문자열 또는 text 필드를 받는다", () => {
    const ctx = makeContext({
      omitted: {
        ids: ["3-2", "3-3", "3-4", "3-5", "3-7", "3-11", "3-12", "3-13"],
        reasons: [],
      },
    });
    const r = parseStepResponse(
      7,
      JSON.stringify({
        sections: [
          {
            id: "3-6",
            status: "ok",
            body: { text: "동아리 방향" },
            evidence_ids: ["a1"],
          },
        ],
        planDraft: [],
      }),
      ctx,
    );
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.output.sections?.[0]?.body).toBe("동아리 방향");
  });

  it("5단계는 formula 를 1-10 항목에 싣는다", () => {
    const raw = JSON.stringify({
      formula: "연결 활동 1건 ÷ 전체 3건 × 100 = 33.3%",
      sections: [
        { id: "1-9", status: "ok", body: { rows: [] }, evidence_ids: ["a1"] },
        {
          id: "1-10",
          status: "ok",
          body: { percent: 33.3 },
          evidence_ids: ["a1"],
        },
      ],
    });
    const r = parseStepResponse(5, raw, makeContext());
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.output.sections?.find((s) => s.id === "1-10")?.formula).toBe(
      "연결 활동 1건 ÷ 전체 3건 × 100 = 33.3%",
    );
  });
});

function validNarrative() {
  return {
    theme: "열과 에너지 흐름",
    subthemes: [
      { grade: "고1", stage: "seed", text: "기초" },
      { grade: "고2", stage: "flower", text: "심화" },
      { grade: "고3", stage: "bloom", text: "완성" },
    ],
  };
}

describe("3단계 서사 파싱", () => {
  it("narrative 를 꺼낸다", () => {
    const raw = JSON.stringify({
      narrative: validNarrative(),
      sections: [
        {
          id: "1-8",
          status: "ok",
          body: [{ text: "a", evidence_ids: ["a1"] }],
          evidence_ids: ["a1"],
        },
      ],
    });
    const r = parseStepResponse(3, raw, makeContext());
    if (!r.ok) throw new Error("expected ok");
    expect(r.output.narrative?.theme).toBe("열과 에너지 흐름");
    expect(r.output.narrative?.previous).toBeUndefined();
  });

  it("previous 는 이전 회차 값으로 앱이 채운다", () => {
    const ctx = makeContext({
      previousNarrative: {
        theme: "화학 반응",
        issuedAt: "2026-03-01T00:00:00.000Z",
        career: "화학자",
      },
    });
    const raw = JSON.stringify({
      narrative: { ...validNarrative(), previous: { theme: "x" } },
      sections: [
        {
          id: "1-8",
          status: "ok",
          body: [{ text: "a", evidence_ids: ["a1"] }],
          evidence_ids: ["a1"],
        },
      ],
    });
    const r = parseStepResponse(3, raw, ctx);
    if (!r.ok) throw new Error("expected ok");
    expect(r.output.narrative?.previous).toEqual({
      theme: "화학 반응",
      issuedAt: "2026-03-01T00:00:00.000Z",
      reason: "career_change",
    });
  });

  it("narrative 가 없으면 invalid_narrative", () => {
    const r = parseStepResponse(
      3,
      JSON.stringify({ sections: [] }),
      makeContext(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.issues.map((i) => i.code)).toContain("invalid_narrative");
  });
});

describe("4단계 대조 파싱", () => {
  it("aligned 와 conflicting 을 꺼낸다", () => {
    const ctx = makeContext();
    const sections = stepSectionIds(4, ctx).map((id) => ({
      id,
      status: "no_data",
      evidence_ids: [],
    }));
    const r = parseStepResponse(
      4,
      JSON.stringify({
        match: {
          aligned: [{ text: "진로와 일치", evidenceIds: ["a1"] }],
          conflicting: [],
        },
        sections,
      }),
      ctx,
    );
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.output.match).toEqual({
      aligned: [{ text: "진로와 일치", evidenceIds: ["a1"] }],
      conflicting: [],
    });
  });

  it("match 가 없으면 invalid_match", () => {
    const r = parseStepResponse(
      4,
      JSON.stringify({ sections: [] }),
      makeContext(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.code)).toContain("invalid_match");
  });
});

describe("7단계 실행계획 초안 파싱", () => {
  const ctx = makeContext({
    omitted: {
      ids: ["3-2", "3-3", "3-4", "3-5", "3-6", "3-7", "3-11", "3-12", "3-13"],
      reasons: [],
    },
  });
  const item = {
    program: "deep",
    title: "탐구 계획 세우기",
    description: "방향 설명",
    priority: "required",
    axis: "C",
    category: null,
    period: "semester",
    periodLabel: "2학기",
    deadline: "2026-12-01",
  };

  it("deadline 은 항상 null 로 정규화한다", () => {
    const r = parseStepResponse(
      7,
      JSON.stringify({ sections: [], planDraft: [item] }),
      ctx,
    );
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.output.planDraft?.[0]).toMatchObject({
      program: "deep",
      priority: "required",
      period: "semester",
      axis: "C",
      deadline: null,
    });
  });

  it("enum 밖 값이면 invalid_plan_item", () => {
    const r = parseStepResponse(
      7,
      JSON.stringify({
        sections: [],
        planDraft: [{ ...item, period: "always" }],
      }),
      ctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues[0]?.code).toBe("invalid_plan_item");
      expect(r.issues[0]?.path).toBe("planDraft[0]");
    }
  });
});

const planItem = (over: Record<string, unknown> = {}) => ({
  program: "deep" as const,
  title: "탐구 방향 정하기",
  description: "방향과 조건만 정한다",
  priority: "required" as const,
  axis: "C" as const,
  category: null,
  period: "semester" as const,
  periodLabel: "2학기",
  deadline: null,
  ...over,
});

const okSection = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: "t",
  format: "prose" as const,
  badge: "proposal" as const,
  status: "ok" as const,
  evidence_ids: ["a1"],
  body: "본문",
  ...over,
});

describe("validateStepOutput", () => {
  it("5단계는 계산식을 앱 값과 대조한다", () => {
    const ctx = makeContext();
    const formula = "연결 활동 1건 ÷ 전체 3건 × 100 = 33.3%";
    const output = {
      step: 5 as const,
      sections: [
        okSection("1-9", { format: "table", body: { rows: [] } }),
        okSection("1-10", { format: "diagram", body: {}, formula }),
      ],
    };
    expect(
      validateStepOutput(5, output, ctx, { expectedFormula: formula }).ok,
    ).toBe(true);
    const bad = validateStepOutput(5, output, ctx, {
      expectedFormula: "연결 활동 2건 ÷ 전체 3건 × 100 = 66.7%",
    });
    expect(bad.issues.map((i) => i.code)).toContain("formula_mismatch");
  });

  it("근거 id 가 모르는 값이면 3, 4, 5, 6, 7 단계 모두 문제로 낸다", () => {
    const ctx = makeContext();
    const r3 = validateStepOutput(
      3,
      {
        step: 3,
        narrative: validNarrative() as never,
        sections: [
          okSection("1-8", {
            format: "list",
            body: [],
            evidence_ids: ["nope"],
          }),
        ],
      },
      ctx,
      {},
    );
    expect(r3.issues.map((i) => i.code)).toContain("unknown_evidence");
    const r6 = validateStepOutput(
      6,
      { step: 6, sections: [okSection("2-1", { evidence_ids: ["nope"] })] },
      ctx,
      {},
    );
    expect(r6.issues.map((i) => i.code)).toContain("unknown_evidence");
  });

  it("3, 4, 5단계도 근거 없는 ok 섹션은 missing_evidence 로 막는다", () => {
    const ctx = makeContext();
    const r3 = validateStepOutput(
      3,
      {
        step: 3,
        narrative: validNarrative() as never,
        sections: [
          okSection("1-8", { format: "list", body: [], evidence_ids: [] }),
        ],
      },
      ctx,
      {},
    );
    expect(r3.issues).toContainEqual(
      expect.objectContaining({ code: "missing_evidence", path: "1-8" }),
    );
    const r4 = validateStepOutput(
      4,
      {
        step: 4,
        match: { aligned: [], conflicting: [] },
        sections: [okSection("1-2", { evidence_ids: [] })],
      },
      ctx,
      {},
    );
    expect(r4.issues.map((i) => i.code)).toContain("missing_evidence");
    const r5 = validateStepOutput(
      5,
      {
        step: 5,
        sections: [
          okSection("1-9", {
            format: "table",
            body: { rows: [] },
            evidence_ids: [],
          }),
        ],
      },
      ctx,
      {},
    );
    expect(r5.issues.map((i) => i.code)).toContain("missing_evidence");
  });

  it("no_data 섹션은 근거가 없어도 missing_evidence 가 아니다", () => {
    const r = validateStepOutput(
      4,
      {
        step: 4,
        match: { aligned: [], conflicting: [] },
        sections: [
          okSection("1-2", { status: "no_data", evidence_ids: [], body: null }),
        ],
      },
      makeContext(),
      {},
    );
    expect(r.issues.map((i) => i.code)).not.toContain("missing_evidence");
  });

  it("3단계는 서사 검증 결과를 합친다", () => {
    const ctx = makeContext();
    const r = validateStepOutput(
      3,
      {
        step: 3,
        narrative: {
          theme: "",
          subthemes: [],
        },
        sections: [],
      },
      ctx,
      {},
    );
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("invalid_narrative");
  });

  it("4단계 match 의 근거 id 도 확인한다", () => {
    const r = validateStepOutput(
      4,
      {
        step: 4,
        match: {
          aligned: [{ text: "x", evidenceIds: ["nope"] }],
          conflicting: [],
        },
        sections: [],
      },
      makeContext(),
      {},
    );
    expect(r.issues.map((i) => i.code)).toContain("unknown_evidence");
  });

  it("금지 표현을 잡는다", () => {
    const r = validateStepOutput(
      7,
      {
        step: 7,
        sections: [okSection("3-6", { body: "합격 가능성이 높다" })],
        planDraft: [planItem()],
      },
      makeContext(),
      {},
    );
    expect(r.issues.map((i) => i.code)).toContain("forbidden_phrase");
  });

  it("6단계 판정 라벨은 앱 값과 같아야 한다", () => {
    const ctx = makeContext();
    const axes = [
      {
        axis: "A",
        name: "학업역량",
        count: 1,
        required: 5,
        verdict: "caution",
        verdictLabel: "주의",
        guideline: "g",
        optional: false,
        activityIds: ["a1"],
      },
    ] as never;
    const section = (label: string) =>
      okSection("2-1", {
        format: "table",
        body: {
          rows: [{ label: "판정", value: label, evidence_ids: ["a1"] }],
        },
      });
    const good = validateStepOutput(
      6,
      { step: 6, sections: [section("주의")] },
      ctx,
      { axes },
    );
    expect(good.issues.map((i) => i.code)).not.toContain(
      "verdict_label_mismatch",
    );
    const bad = validateStepOutput(
      6,
      { step: 6, sections: [section("확인됨")] },
      ctx,
      { axes },
    );
    expect(bad.issues.map((i) => i.code)).toContain("verdict_label_mismatch");
  });

  it("6단계는 활동이 있는 축의 섹션을 no_data 로 두면 문제로 낸다", () => {
    const axis = (count: number) =>
      [
        {
          axis: "A",
          name: "학업역량",
          count,
          required: 5,
          verdict: "caution",
          verdictLabel: "주의",
          guideline: "g",
          optional: false,
          activityIds: count > 0 ? ["a1"] : [],
        },
      ] as never;
    const noData = okSection("2-1", {
      status: "no_data",
      evidence_ids: [],
      body: null,
    });
    const withEvidence = validateStepOutput(
      6,
      { step: 6, sections: [noData] },
      makeContext(),
      { axes: axis(1) },
    );
    expect(withEvidence.issues).toContainEqual(
      expect.objectContaining({
        code: "axis_no_data_with_evidence",
        path: "2-1",
      }),
    );
    const without = validateStepOutput(
      6,
      { step: 6, sections: [noData] },
      makeContext(),
      { axes: axis(0) },
    );
    expect(without.issues.map((i) => i.code)).not.toContain(
      "axis_no_data_with_evidence",
    );
  });

  describe("7단계 실행계획", () => {
    const run = (planDraft: ReturnType<typeof planItem>[]) =>
      validateStepOutput(
        7,
        { step: 7, sections: [okSection("3-6")], planDraft },
        makeContext(),
        {},
      ).issues.map((i) => i.code);

    it("정상 계획은 계획 관련 문제가 없다", () => {
      const codes = run([planItem()]);
      expect(codes).not.toContain("grade_number_in_plan");
      expect(codes).not.toContain("too_many_plan_items");
      expect(codes).not.toContain("no_required_plan_item");
    });

    it("제목이나 설명의 등급, 점수, 퍼센트 숫자를 막는다", () => {
      expect(run([planItem({ title: "2등급 달성하기" })])).toContain(
        "grade_number_in_plan",
      );
      expect(run([planItem({ description: "85점 이상" })])).toContain(
        "grade_number_in_plan",
      );
      expect(run([planItem({ description: "일관성 60% 이상" })])).toContain(
        "grade_number_in_plan",
      );
    });

    it("required 4건 이상이면 상한 초과", () => {
      expect(
        run([1, 2, 3, 4].map((n) => planItem({ title: `t${n}` }))),
      ).toContain("too_many_plan_items");
    });

    it("recommended 가 4건이어도 상한 초과", () => {
      const items = [
        planItem(),
        ...[1, 2, 3, 4].map((n) =>
          planItem({ priority: "recommended", title: `r${n}` }),
        ),
      ];
      expect(run(items)).toContain("too_many_plan_items");
    });

    it("required 가 없으면 문제", () => {
      expect(run([planItem({ priority: "recommended" })])).toContain(
        "no_required_plan_item",
      );
    });

    it("구체 주제 제시를 탐지한다", () => {
      const r = validateStepOutput(
        7,
        {
          step: 7,
          sections: [okSection("3-6", { body: "탐구 주제: 열전도율 측정" })],
          planDraft: [planItem()],
        },
        makeContext(),
        {},
      );
      expect(r.issues.map((i) => i.code)).toContain("topic_generated");
    });

    it("계획 항목 안의 주제 제시도 탐지한다", () => {
      expect(
        run([planItem({ description: "연구 주제: 열전도율 측정" })]),
      ).toContain("topic_generated");
    });
  });
});

describe("buildStepPrompt", () => {
  const ctx = makeContext();
  const signals: ActivitySignal[] = ctx.activities.map((a) => ({
    activityId: a.id,
    axes: ["A"],
    method: "실험",
    keywords: ["열"],
    linkage: ["subject_link"],
    summary: `${a.id} 요약`,
  }));
  const consistency = {
    percent: 33.3,
    linked: 1,
    total: 3,
    formula: "연결 활동 1건 ÷ 전체 3건 × 100 = 33.3%",
    verdict: "splitting" as const,
    verdictLabel: "갈리는 중",
    criteria: "기준 문구",
    smallSample: true,
  };
  const axes = [
    {
      axis: "A" as const,
      name: "학업역량",
      count: 1,
      required: 5,
      verdict: "caution" as const,
      verdictLabel: "주의",
      guideline: "판단 근거로 쓴 기록 5건",
      optional: false,
      activityIds: ["a1"],
    },
  ];
  const narrative = validNarrative() as never;
  const match = { aligned: [], conflicting: [] };
  const prior = {
    signals,
    narrative,
    match,
    consistency,
    axes,
  };
  const steps = [1, 3, 4, 5, 6, 7] as const;

  it("6단계 규칙에 count 0 축 no_data 와 activityIds 근거 지시가 있다", () => {
    const system = buildStepPrompt(6, {
      context: makeContext(),
      prior: { axes: [] },
    }).system;
    expect(system).toContain("count 가 0 인 축은 status 를 no_data");
    expect(system).toContain("그 축 activityIds 를 넣는다");
  });

  it("모든 단계 system 에 근거 원칙과 금지 표현이 있다", () => {
    for (const step of steps) {
      const b = buildStepPrompt(step, { context: ctx, prior });
      expect(b.system).toContain("evidence_ids");
      expect(b.system).toContain("자료 없음");
      expect(b.system).toContain("합격 가능성");
      expect(b.system).toContain("JSON");
      expect(b.maxOutputTokens).toBe(STEP_MAX_OUTPUT_TOKENS[step]);
      expect(b.responseSchema).toBe(STEP_RESPONSE_SCHEMAS[step]);
    }
  });

  it("모든 단계 system 에 분량 원칙과 반복 금지가 있다", () => {
    for (const step of steps) {
      const b = buildStepPrompt(step, { context: ctx, prior });
      expect(b.system).toContain("분량 원칙");
      expect(b.system).toContain("350자 이내");
      expect(b.system).toContain("120자 이내");
      expect(b.system).toContain("8행 이내");
      expect(b.system).toContain("160자 이내");
      expect(b.system).toContain("연달아");
    }
  });

  it("7단계 규칙은 항목마다 조건을 2~3개만 쓰게 한다", () => {
    const b = buildStepPrompt(7, { context: ctx, prior });
    expect(b.system).toContain("조건은 2~3개만");
  });

  it("새 텍스트에 금지 기호가 없다", () => {
    const banned = ["\u2014", "\u2013", "\u00b7", "\u2192"];
    for (const step of steps) {
      const b = buildStepPrompt(step, { context: ctx, prior });
      for (const ch of banned) {
        expect(b.system.includes(ch)).toBe(false);
        expect(b.user.replace(/÷|×/g, "").includes(ch)).toBe(false);
      }
    }
  });

  it("1단계 user 에 활동 전부의 id 와 본문이 들어간다", () => {
    const b = buildStepPrompt(1, { context: ctx, prior: {} });
    for (const a of ctx.activities) {
      expect(b.user).toContain(a.id);
      expect(b.user).toContain(a.text);
    }
  });

  it("3단계 user 에 신호와 진로 답이 들어가고, 이전 서사가 있으면 안내한다", () => {
    const plain = buildStepPrompt(3, { context: ctx, prior: { signals } });
    expect(plain.user).toContain("a1 요약");
    expect(plain.user).toContain("물리학자");
    expect(plain.user).not.toContain("previous");
    const changed = buildStepPrompt(3, {
      context: makeContext({
        previousNarrative: {
          theme: "화학 반응",
          issuedAt: "2026-03-01T00:00:00.000Z",
          career: "화학자",
        },
      }),
      prior: { signals },
    });
    expect(changed.user).toContain("화학 반응");
    expect(changed.user).toContain("previous");
  });

  it("4단계 user 에 설문 전체와 신호가 들어간다", () => {
    const b = buildStepPrompt(4, { context: ctx, prior: { signals } });
    expect(b.user).toContain("물리학자");
    expect(b.user).toContain("a2 요약");
    expect(b.system).toContain("no_data");
  });

  it("5단계는 계산식을 그대로 복사하도록 지시한다", () => {
    const b = buildStepPrompt(5, { context: ctx, prior });
    expect(b.user).toContain(consistency.formula);
    expect(b.system).toContain("글자 그대로");
  });

  it("5단계는 expectedFormula 가 있으면 그것을 쓴다", () => {
    const b = buildStepPrompt(5, {
      context: ctx,
      prior: { ...prior, expectedFormula: "기대 식 ÷ 1 = 1%" },
    });
    expect(b.user).toContain("기대 식 ÷ 1 = 1%");
  });

  it("6단계 user 에 축 평가와 대학 평가요소가 들어간다", () => {
    const b = buildStepPrompt(6, { context: ctx, prior });
    expect(b.user).toContain("판단 근거로 쓴 기록 5건");
    expect(b.user).toContain("학업성취도");
    expect(b.system).toContain("판정");
  });

  it("7단계는 주제 생성 금지와 숫자 금지를 지시하고 제외 항목은 요청하지 않는다", () => {
    const b = buildStepPrompt(7, {
      context: makeContext({
        omitted: { ids: ["3-2"], reasons: ["고1은 대상이 아님"] },
      }),
      prior,
    });
    expect(b.system).toContain("방향과 조건까지만");
    expect(b.system).toContain("등급");
    expect(b.user).not.toContain('"3-2"');
    expect(b.user).toContain('"3-3"');
    expect(b.user).toContain("고1은 대상이 아님");
  });

  it("retryNotes 가 있으면 user 끝에 이전 응답의 문제 블록을 붙인다", () => {
    const b = buildStepPrompt(1, { context: ctx, prior: {} }, [
      "[a1] 문제가 있습니다. 이 문제를 고쳐서 다시 작성해 주세요.",
    ]);
    expect(b.user.trimEnd().endsWith("다시 작성해 주세요.")).toBe(true);
    expect(b.user).toContain("이전 응답의 문제");
    const none = buildStepPrompt(1, { context: ctx, prior: {} });
    expect(none.user).not.toContain("이전 응답의 문제");
  });

  it("필요한 이전 단계 결과가 없으면 던진다", () => {
    expect(() => buildStepPrompt(3, { context: ctx, prior: {} })).toThrow();
    expect(() => buildStepPrompt(6, { context: ctx, prior: {} })).toThrow();
  });
});

describe("normalizeAxisSections", () => {
  const axisEval = (axis: string, count: number, activityIds: string[]) =>
    ({
      axis,
      name: axis,
      count,
      required: 1,
      verdict: "none",
      verdictLabel: "아직 없음",
      guideline: "g",
      optional: false,
      activityIds,
    }) as never;
  const known = ["a1", "a2", "a3"];

  it("근거 활동이 0건인 축은 모델이 ok 로 써도 no_data 로 바꿔 근거 누락이 나지 않는다", () => {
    const sections = [
      okSection("2-1", {
        format: "table",
        body: { rows: [] },
        evidence_ids: [],
      }),
    ] as never;
    const axes = [axisEval("A", 0, [])];
    const out = normalizeAxisSections(sections, axes, known);
    expect(out[0]).toMatchObject({
      id: "2-1",
      status: "no_data",
      no_data_reason: "해당 축의 근거 활동이 없어요",
      evidence_ids: [],
    });
    const v = validateStepOutput(6, { step: 6, sections: out }, makeContext(), {
      axes,
    });
    expect(v.issues.map((i) => i.code)).not.toContain("missing_evidence");
  });

  it("근거 활동이 있는 축의 빈 근거 id 는 앱의 activityIds 로 채운다", () => {
    const sections = [okSection("2-2", { evidence_ids: [] })] as never;
    const out = normalizeAxisSections(
      sections,
      [axisEval("B", 2, ["a1", "a2", "zz"])],
      known,
    );
    expect(out[0]?.status).toBe("ok");
    expect(out[0]?.evidence_ids).toEqual(["a1", "a2"]);
  });

  it("모델이 넣은 알 수 없는 id 는 걸러내고 올바른 id 는 그대로 둔다", () => {
    const sections = [
      okSection("2-3", { evidence_ids: ["a3", "nope"] }),
    ] as never;
    const out = normalizeAxisSections(
      sections,
      [axisEval("C", 2, ["a1", "a2"])],
      known,
    );
    expect(out[0]?.evidence_ids).toEqual(["a3"]);
  });

  it("근거 활동이 0건인 축 섹션이 응답에 없으면 no_data 항목을 보강한다", () => {
    const sections = [okSection("2-1", { evidence_ids: ["a1"] })] as never;
    const out = normalizeAxisSections(
      sections,
      [axisEval("A", 1, ["a1"]), axisEval("D", 0, [])],
      known,
    );
    expect(out.map((x) => x.id)).toEqual(["2-1", "2-4"]);
    expect(out[1]).toMatchObject({ id: "2-4", status: "no_data" });
  });
});
