import { describe, expect, it } from "vitest";
import { NO_DATA_TEXT } from "../sections.js";
import {
  buildStepPrompt,
  MATCH_CALL_MAX_OUTPUT_TOKENS,
  normalizeAxisSections,
  PLAN_DRAFT_CALL_MAX_OUTPUT_TOKENS,
  parseStepResponse,
  SECTION_CALL_MAX_OUTPUT_TOKENS,
  STEP_MAX_OUTPUT_TOKENS,
  STEP_RESPONSE_SCHEMAS,
  type StepCall,
  stepCalls,
  stepSectionIds,
  TABLE_SECTION_CALL_MAX_OUTPUT_TOKENS,
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
      5: 2048,
    });
  });

  it("호출별 출력 토큰 상한은 섹션 1536, match 1536, planDraft 2048 이다", () => {
    expect(SECTION_CALL_MAX_OUTPUT_TOKENS).toBe(1536);
    expect(MATCH_CALL_MAX_OUTPUT_TOKENS).toBe(1536);
    expect(PLAN_DRAFT_CALL_MAX_OUTPUT_TOKENS).toBe(2048);
  });

  it("단일 호출 단계마다 응답 스키마가 있다", () => {
    for (const step of [1, 3, 5] as const) {
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
    expect(stepSectionIds(5, ctx)).toEqual(["1-9"]);
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
  it("5단계는 모델이 계산식을 쓰지 않아도 1-9 만으로 통과한다", () => {
    const ctx = makeContext();
    const output = {
      step: 5 as const,
      sections: [okSection("1-9", { format: "table", body: { rows: [] } })],
    };
    expect(validateStepOutput(5, output, ctx, {}).ok).toBe(true);
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
        sections: [okSection("1-6", { evidence_ids: [] })],
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

  it("4단계 1-2 는 근거가 비어도 missing_evidence 가 없고 모르는 id 는 unknown_evidence", () => {
    const ctx = makeContext();
    const run = (evidence_ids: string[]) =>
      validateStepOutput(
        4,
        {
          step: 4,
          match: { aligned: [], conflicting: [] },
          sections: [okSection("1-2", { evidence_ids })],
        },
        ctx,
        {},
      ).issues.map((i) => i.code);
    expect(run([])).not.toContain("missing_evidence");
    expect(run(["1791348612292"])).toContain("unknown_evidence");
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
  // 4, 6, 7단계는 호출 종류를 함께 넘긴다. 기본은 각 단계의 첫 섹션 호출이다.
  const FIRST_CALL = {
    4: { kind: "section", id: "1-2" },
    6: { kind: "section", id: "2-1" },
    7: { kind: "section", id: "3-2" },
  } as const;
  const build = (
    step: (typeof steps)[number],
    over: Partial<Parameters<typeof buildStepPrompt>[1]> = {},
    notes: string[] = [],
  ) =>
    buildStepPrompt(
      step,
      {
        context: ctx,
        prior,
        ...(step === 4 || step === 6 || step === 7
          ? { call: FIRST_CALL[step] }
          : {}),
        ...over,
      },
      notes,
    );
  /** 4, 6, 7단계의 모든 호출 종류. */
  const everyCall: [4 | 6 | 7, StepCall][] = [
    [4, { kind: "section", id: "1-2" }],
    [4, { kind: "match" }],
    [6, { kind: "section", id: "2-1" }],
    [6, { kind: "section", id: "2-6" }],
    [7, { kind: "section", id: "3-2" }],
    [7, { kind: "planDraft" }],
  ];

  it("6단계 축 섹션 호출 규칙에 판정 값 고정과 evidence_ids 앱 채움 지시가 있고 count 0 지시는 없다", () => {
    const system = build(6).system;
    expect(system).toContain("evidence_ids 는 앱이 채우니 빈 배열로 둔다");
    expect(system).not.toContain("count 가 0 인 축");
  });

  it("6단계 축이 아닌 섹션 호출에는 판정 지시가 없다", () => {
    const system = build(6, { call: { kind: "section", id: "2-6" } }).system;
    expect(system).not.toContain("verdictLabel");
  });

  it("4, 6, 7단계 호출 종류별로 호출 한도와 응답 스키마가 다르다", () => {
    const section = build(4);
    expect(section.maxOutputTokens).toBe(SECTION_CALL_MAX_OUTPUT_TOKENS);
    expect(section.responseSchema).toMatchObject({ required: ["sections"] });
    const match = build(4, { call: { kind: "match" } });
    expect(match.maxOutputTokens).toBe(MATCH_CALL_MAX_OUTPUT_TOKENS);
    expect(match.responseSchema).toMatchObject({ required: ["match"] });
    const plan = build(7, { call: { kind: "planDraft" } });
    expect(plan.maxOutputTokens).toBe(PLAN_DRAFT_CALL_MAX_OUTPUT_TOKENS);
    expect(plan.responseSchema).toMatchObject({ required: ["planDraft"] });
  });

  it("4, 6, 7단계는 호출 종류 없이 만들면 던진다", () => {
    for (const step of [4, 6, 7] as const)
      expect(() => buildStepPrompt(step, { context: ctx, prior })).toThrow();
  });

  it("stepCalls 는 섹션 호출 뒤에 4단계 match, 7단계 planDraft 를 두고 근거 없는 축은 6단계에서 거른다", () => {
    const c4 = stepCalls(4, ctx);
    expect(c4.map((c) => (c.kind === "section" ? c.id : c.kind))).toEqual([
      "1-2",
      "1-6",
      "1-7",
      "1-11",
      "match",
    ]);
    const c7 = stepCalls(7, ctx);
    expect(c7.at(-1)).toEqual({ kind: "planDraft" });
    expect(c7).toHaveLength(10);
    const c6 = stepCalls(6, ctx, [
      { ...axes[0], axis: "A", count: 2 },
      { ...axes[0], axis: "B", count: 0 },
    ] as never);
    const ids6 = c6.map((c) => (c.kind === "section" ? c.id : c.kind));
    expect(ids6).toContain("2-1");
    expect(ids6).not.toContain("2-2");
    expect(ids6).toContain("2-6");
  });

  it("모든 호출 system 에 근거 원칙과 금지 표현이 있다", () => {
    for (const step of [1, 3, 5] as const) {
      const b = build(step);
      expect(b.system).toContain("evidence_ids");
      expect(b.system).toContain("자료 없음");
      expect(b.system).toContain("합격 가능성");
      expect(b.system).toContain("JSON");
      expect(b.maxOutputTokens).toBe(STEP_MAX_OUTPUT_TOKENS[step]);
      expect(b.responseSchema).toBe(STEP_RESPONSE_SCHEMAS[step]);
    }
    for (const [step, call] of everyCall) {
      const b = build(step, { call });
      expect(b.system).toContain("evidence_ids");
      expect(b.system).toContain("자료 없음");
      expect(b.system).toContain("합격 가능성");
      expect(b.system).toContain("JSON");
    }
  });

  it("모든 호출 system 에 분량 원칙과 반복 금지가 있다", () => {
    for (const step of steps) {
      const b = build(step);
      expect(b.system).toContain("분량 원칙");
      expect(b.system).toContain("350자 이내");
      expect(b.system).toContain("120자 이내");
      expect(b.system).toContain("안내한 행 수");
      expect(b.system).toContain("160자 이내");
      expect(b.system).toContain("연달아");
    }
  });

  it("4단계 1-2 지시는 활동 근거 없이 쓰고 evidence_ids 를 비우게 한다", () => {
    const b = build(4);
    expect(b.user).toContain(
      "이 항목은 활동 근거 없이 쓴다. evidence_ids 는 비워 둔다.",
    );
  });

  it("7단계 규칙은 항목마다 조건을 2~3개만 쓰게 한다", () => {
    const b = build(7);
    expect(b.system).toContain("조건은 2~3개만");
  });

  it("새 텍스트에 금지 기호가 없다", () => {
    const banned = ["\u2014", "\u2013", "\u00b7", "\u2192"];
    const bundles = [
      ...[1, 3, 5].map((step) => build(step as 1 | 3 | 5)),
      ...everyCall.map(([step, call]) => build(step, { call })),
    ];
    for (const b of bundles) {
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
    const b = build(4);
    expect(b.user).toContain("물리학자");
    expect(b.user).toContain("a2 요약");
    expect(b.system).toContain("no_data");
  });

  it("5단계 프롬프트와 스키마에는 1-10 과 계산식이 없다", () => {
    const b = buildStepPrompt(5, { context: ctx, prior });
    expect(b.system).not.toContain("1-10");
    expect(b.system).not.toContain("formula");
    expect(b.system).not.toContain("글자 그대로");
    expect(b.user).not.toContain("1-10");
    expect(b.user).not.toContain("계산식");
    expect(b.user).toContain("1-9");
    expect(JSON.stringify(b.responseSchema)).not.toContain("formula");
    expect(JSON.stringify(b.responseSchema)).not.toContain("1-10");
    expect(b.responseSchema).toMatchObject({ required: ["sections"] });
  });

  it("5단계 활동별 신호에 학기 키가 들어간다", () => {
    const b = buildStepPrompt(5, { context: ctx, prior });
    expect(b.user).toContain('"semester": "고1-1"');
  });

  it("근거는 대표 활동 최대 3개만 쓰라고 지시한다", () => {
    const b = buildStepPrompt(3, { context: ctx, prior });
    expect(b.system).toContain("최대 3개");
    expect(b.system).not.toContain("모든 판단에는 evidence_ids");
  });

  it("6단계 user 에 축 평가가 들어가고 앱이 만드는 대학 평가요소는 빠진다", () => {
    const b = build(6);
    expect(b.user).toContain("판단 근거로 쓴 기록 5건");
    expect(b.user).not.toContain("universityFactor");
    expect(b.system).toContain("판정");
  });

  it("6단계 규칙은 판정, 근거 활동, 대학 평가요소 대응 행을 앱이 만든다며 해석과 부족한 점만 쓰라고 한다", () => {
    const b = build(6);
    expect(b.system).toContain("앱이 만드므로 쓰지 않는다");
    expect(b.system).toContain("해석");
    expect(b.system).toContain("부족한 점");
    expect(b.system).not.toContain("근거 활동 행의 value 에는");
    expect(b.system).not.toContain("universityFactor");
    expect(b.system).toContain("verdictLabel");
    expect(b.system).toContain("no_data");
    const spec = build(6).user;
    expect(spec).toContain("해석 한 행");
    expect(spec).not.toContain("rows 에 판정, 근거 활동");
  });

  it("7단계는 주제 생성 금지와 숫자 금지를 지시하고 제외 항목은 요청하지 않는다", () => {
    const omittedCtx = makeContext({
      omitted: { ids: ["3-2"], reasons: ["고1은 대상이 아님"] },
    });
    const calls = stepCalls(7, omittedCtx);
    expect(calls.some((c) => c.kind === "section" && c.id === "3-2")).toBe(
      false,
    );
    const section = build(7, {
      context: omittedCtx,
      call: { kind: "section", id: "3-3" },
    });
    expect(section.system).toContain("방향과 조건까지만");
    expect(section.user).not.toContain('"3-2"');
    expect(section.user).toContain('"3-3"');
    expect(section.user).toContain("고1은 대상이 아님");
    const plan = build(7, { context: omittedCtx, call: { kind: "planDraft" } });
    expect(plan.system).toContain("등급");
    expect(plan.user).not.toContain("작성할 항목");
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
    expect(() =>
      buildStepPrompt(6, {
        context: ctx,
        prior: {},
        call: { kind: "section", id: "2-1" },
      }),
    ).toThrow();
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
  const acts = known.map((id) => activity(id));

  it("근거 활동이 0건인 축은 모델이 ok 로 써도 no_data 로 바꿔 근거 누락이 나지 않는다", () => {
    const sections = [
      okSection("2-1", {
        format: "table",
        body: { rows: [] },
        evidence_ids: [],
      }),
    ] as never;
    const axes = [axisEval("A", 0, [])];
    const out = normalizeAxisSections(sections, axes, known, acts);
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
      acts,
    );
    expect(out[0]?.status).toBe("ok");
    expect(out[0]?.evidence_ids).toEqual(["a1", "a2"]);
  });

  it("모델이 쓴 근거와 무관하게 앱의 activityIds 로 덮는다", () => {
    const sections = [
      okSection("2-3", { evidence_ids: ["a3", "nope"] }),
    ] as never;
    const out = normalizeAxisSections(
      sections,
      [axisEval("C", 2, ["a1", "a2"])],
      known,
      acts,
    );
    expect(out[0]?.evidence_ids).toEqual(["a1", "a2"]);
  });

  it("근거 활동이 0건인 축 섹션이 응답에 없으면 no_data 항목을 보강한다", () => {
    const sections = [okSection("2-1", { evidence_ids: ["a1"] })] as never;
    const out = normalizeAxisSections(
      sections,
      [axisEval("A", 1, ["a1"]), axisEval("D", 0, [])],
      known,
      acts,
    );
    expect(out.map((x) => x.id)).toEqual(["2-1", "2-4"]);
    expect(out[1]).toMatchObject({ id: "2-4", status: "no_data" });
  });
});

describe("축 섹션 앱 행 조립", () => {
  const axisEval = (axis: string, count: number, activityIds: string[]) =>
    ({
      axis,
      name: axis,
      count,
      required: 1,
      verdict: "caution",
      verdictLabel: "주의",
      guideline: "g",
      optional: false,
      activityIds,
    }) as never;
  const acts = [
    activity("a1", { topic: "열 전달" }),
    activity("a2", { topic: null }),
    activity("a3", { topic: "  " }),
    activity("a4", { topic: "전기 회로" }),
    activity("a5", { topic: "광합성" }),
    activity("a6", { topic: "삼투압" }),
    activity("a7", { topic: "산화 환원" }),
  ];
  const known = acts.map((a) => a.id);
  const rowsOf = (
    out: ReturnType<typeof normalizeAxisSections>,
  ): Record<string, unknown>[] => {
    const body = out[0]?.body;
    const rows = isBodyWithRows(body) ? body.rows : [];
    return rows;
  };
  const isBodyWithRows = (
    body: unknown,
  ): body is { rows: Record<string, unknown>[] } =>
    typeof body === "object" && body !== null && "rows" in body;

  it("근거 활동 행은 앞 3건 topic 과 외 N건이고 topic 이 빈 활동은 건너뛴다", () => {
    const sections = [
      okSection("2-1", { format: "table", body: { rows: [] } }),
    ] as never;
    const out = normalizeAxisSections(
      sections,
      [axisEval("A", 6, ["a1", "a2", "a3", "a4", "a5", "a6"])],
      known,
      acts,
    );
    const rows = rowsOf(out);
    expect(rows[0]).toMatchObject({ label: "판정", value: "주의" });
    expect(rows[1]).toMatchObject({
      label: "근거 활동",
      value: "열 전달, 전기 회로, 광합성 외 1건",
      evidence_ids: ["a1", "a4", "a5"],
    });
    expect(rows[0]?.evidence_ids).toEqual([]);
    expect(out[0]?.evidence_ids).toEqual(["a1", "a2", "a3", "a4", "a5", "a6"]);
  });

  it("근거 활동이 3건 이하이면 외 가 붙지 않는다", () => {
    const sections = [
      okSection("2-1", { format: "table", body: { rows: [] } }),
    ] as never;
    const out = normalizeAxisSections(
      sections,
      [axisEval("A", 3, ["a4", "a1", "a2"])],
      known,
      acts,
    );
    expect(rowsOf(out)[1]).toMatchObject({
      value: "열 전달, 전기 회로",
      evidence_ids: ["a1", "a4"],
    });
  });

  const dupRow = (topics: string[]) => {
    const list = topics.map((t, i) => activity(`d${i + 1}`, { topic: t }));
    const sections = [
      okSection("2-1", { format: "table", body: { rows: [] } }),
    ] as never;
    const out = normalizeAxisSections(
      sections,
      [
        axisEval(
          "A",
          list.length,
          list.map((a) => a.id),
        ),
      ],
      list.map((a) => a.id),
      list,
    );
    return rowsOf(out)[1];
  };

  it("같은 topic 은 한 번만 쓰고 다른 topic 으로 3개를 채우며 보인 topic 의 중복 활동은 외 건수에서 뺀다", () => {
    expect(dupRow(["X", "X", "X", "X", "X", " Y ", "Z"])).toMatchObject({
      value: "X, Y, Z",
      evidence_ids: ["d1", "d6", "d7"],
    });
    expect(dupRow(["X", "X", "Y", "X", "Z", "W", "Y"])).toMatchObject({
      value: "X, Y, Z 외 1건",
      evidence_ids: ["d1", "d3", "d5"],
    });
  });

  it("같은 topic 만 4건이면 topic 하나만 보이고 외 가 붙지 않는다", () => {
    expect(dupRow(["X", "X", "X", "X"])).toMatchObject({
      value: "X",
      evidence_ids: ["d1"],
    });
  });

  it("서로 다른 topic 5건이면 앞 3개와 외 2건이다", () => {
    expect(dupRow(["A1", "B1", "C1", "D1", "E1"])).toMatchObject({
      value: "A1, B1, C1 외 2건",
      evidence_ids: ["d1", "d2", "d3"],
    });
  });

  it("쓸 topic 이 하나도 없으면 근거 활동 행을 만들지 않는다", () => {
    const sections = [
      okSection("2-1", { format: "table", body: { rows: [] } }),
    ] as never;
    const out = normalizeAxisSections(
      sections,
      [axisEval("A", 2, ["a2", "a3"])],
      known,
      acts,
    );
    expect(rowsOf(out).map((r) => r.label)).toEqual([
      "판정",
      "대학 평가요소 대응",
    ]);
  });

  it("대학 평가요소 대응 행은 앱 상수로 만든다", () => {
    const sections = [
      okSection("2-1", { format: "table", body: { rows: [] } }),
    ] as never;
    const out = normalizeAxisSections(
      sections,
      [axisEval("A", 1, ["a1"])],
      known,
      acts,
    );
    expect(rowsOf(out)[2]).toMatchObject({
      label: "대학 평가요소 대응",
      value: "학업역량: 학업성취도, 학업태도",
      evidence_ids: [],
    });
  });

  it("모델이 쓴 판정, 근거 활동, 대학 평가요소 대응 행은 버리고 해석과 부족한 점은 뒤에 둔다", () => {
    const sections = [
      okSection("2-1", {
        format: "table",
        body: {
          rows: [
            { label: "판정", value: "확인됨", evidence_ids: ["a1"] },
            { label: "근거 활동", value: "x", evidence_ids: ["a1"] },
            { label: "대학 평가요소 대응", value: "y", evidence_ids: [] },
            { label: "해석", value: "좋다", evidence_ids: ["a1"] },
            { label: "부족한 점", value: "적다", evidence_ids: [] },
          ],
        },
      }),
    ] as never;
    const out = normalizeAxisSections(
      sections,
      [axisEval("A", 1, ["a1"])],
      known,
      acts,
    );
    const rows = rowsOf(out);
    expect(rows.map((r) => r.label)).toEqual([
      "판정",
      "근거 활동",
      "대학 평가요소 대응",
      "해석",
      "부족한 점",
    ]);
    expect(rows[0]?.value).toBe("주의");
    const v = validateStepOutput(6, { step: 6, sections: out }, makeContext(), {
      axes: [axisEval("A", 1, ["a1"])],
    });
    expect(v.issues.map((i) => i.code)).not.toContain("verdict_label_mismatch");
  });

  it("모델 행이 없어도 섹션은 ok 이다", () => {
    const sections = [
      okSection("2-1", { format: "table", body: { rows: [] } }),
    ] as never;
    const out = normalizeAxisSections(
      sections,
      [axisEval("A", 1, ["a1"])],
      known,
      acts,
    );
    expect(out[0]?.status).toBe("ok");
    expect(rowsOf(out)).toHaveLength(3);
  });
});

describe("활동 id 별칭", () => {
  const U1 = "11111111-1111-4111-8111-111111111111";
  const U2 = "22222222-2222-4222-8222-222222222222";
  const U3 = "33333333-3333-4333-8333-333333333333";
  const uuidPattern =
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
  const activities = [U1, U2, U3].map((id, i) =>
    activity(id, { text: `본문 ${i + 1}` }),
  );
  const ctx = makeContext({
    activities,
    evidenceIds: activities.map((a) => a.id),
  });
  const signals: ActivitySignal[] = activities.map((a) => ({
    activityId: a.id,
    axes: ["A"],
    method: "실험",
    keywords: ["열"],
    linkage: ["subject_link"],
    summary: "요약",
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
      count: 2,
      required: 5,
      verdict: "caution" as const,
      verdictLabel: "주의",
      guideline: "판단 근거로 쓴 기록 5건",
      optional: false,
      activityIds: [U1, U3],
    },
  ];
  const prior = {
    signals,
    narrative: validNarrative() as never,
    match: {
      aligned: [{ text: "일치", evidenceIds: [U2] }],
      conflicting: [{ text: "어긋남", evidenceIds: [U3] }],
    },
    consistency,
    axes,
  };

  it.each([1, 3, 4, 5, 6, 7] as const)(
    "%i단계 user 에는 활동 id 가 없고 별칭이 있다",
    (step) => {
      const { user } = buildStepPrompt(step, {
        context: ctx,
        prior,
        ...(step === 4
          ? { call: { kind: "section", id: "1-2" } as const }
          : step === 6
            ? { call: { kind: "section", id: "2-1" } as const }
            : step === 7
              ? { call: { kind: "section", id: "3-2" } as const }
              : {}),
      });
      expect(user).not.toMatch(uuidPattern);
      expect(user).toContain('"a1"');
    },
  );

  it("6단계 축 진단의 activityIds 도 별칭이다", () => {
    const { user } = buildStepPrompt(6, {
      context: ctx,
      prior,
      call: { kind: "section", id: "2-1" },
    });
    expect(user).toMatch(/"activityIds": \[\s*"a1",\s*"a3"\s*\]/);
  });

  it("7단계 설문 대조의 근거도 별칭이다", () => {
    const { user } = buildStepPrompt(7, {
      context: ctx,
      prior,
      call: { kind: "planDraft" },
    });
    expect(user).toMatch(/"evidenceIds": \[\s*"a2"\s*\]/);
  });

  it("system 에 별칭 사용 원칙이 있다", () => {
    const { system } = buildStepPrompt(3, { context: ctx, prior });
    expect(system).toContain("a1");
    expect(system).toContain("별칭");
  });

  describe("응답 파싱", () => {
    const section = (id: string, over: Record<string, unknown> = {}) => ({
      id,
      status: "ok",
      body: { items: [{ text: "열 전달 반복", evidence_ids: ["a1", "a3"] }] },
      evidence_ids: ["a2"],
      ...over,
    });

    it("1단계 signals 의 별칭 activityId 를 활동 id 로 돌려준다", () => {
      const r = parseStepResponse(
        1,
        JSON.stringify({
          signals: [
            {
              activityId: "a2",
              axes: ["B"],
              method: "실험",
              keywords: ["열"],
              summary: "요약",
            },
          ],
        }),
        ctx,
      );
      if (!r.ok) throw new Error(JSON.stringify(r.issues));
      expect(r.output.signals?.map((s) => s.activityId)).toEqual([U1, U2, U3]);
      expect(r.output.signals?.find((s) => s.activityId === U2)?.axes).toEqual([
        "B",
      ]);
    });

    it("1단계의 모르는 별칭은 무시한다", () => {
      const r = parseStepResponse(
        1,
        JSON.stringify({
          signals: [
            {
              activityId: "a99",
              axes: ["B"],
              method: null,
              keywords: [],
              summary: "x",
            },
          ],
        }),
        ctx,
      );
      if (!r.ok) throw new Error(JSON.stringify(r.issues));
      expect(r.output.signals?.every((s) => s.axes.length === 0)).toBe(true);
    });

    it("3단계 섹션 근거를 활동 id 로 돌리고 검증을 통과하며 본문은 그대로다", () => {
      const r = parseStepResponse(
        3,
        JSON.stringify({
          narrative: validNarrative(),
          sections: [section("1-8")],
        }),
        ctx,
      );
      if (!r.ok) throw new Error(JSON.stringify(r.issues));
      const s = r.output.sections?.[0];
      expect(s?.evidence_ids).toEqual([U2]);
      expect(JSON.stringify(s?.body)).toContain(U1);
      expect(JSON.stringify(s?.body)).toContain("열 전달 반복");
      expect(validateStepOutput(3, r.output, ctx, {}).issues).toEqual([]);
    });

    it("3단계의 모르는 별칭은 unknown_evidence", () => {
      const r = parseStepResponse(
        3,
        JSON.stringify({
          narrative: validNarrative(),
          sections: [section("1-8", { evidence_ids: ["a99"] })],
        }),
        ctx,
      );
      if (!r.ok) throw new Error(JSON.stringify(r.issues));
      expect(
        validateStepOutput(3, r.output, ctx, {}).issues.map((i) => i.code),
      ).toContain("unknown_evidence");
    });

    it("4단계 match 의 evidenceIds 를 활동 id 로 돌리고, 모르는 별칭은 unknown_evidence", () => {
      const sections = stepSectionIds(4, ctx).map((id) => ({
        id,
        status: "no_data",
        evidence_ids: [],
      }));
      const parse = (ids: string[]) =>
        parseStepResponse(
          4,
          JSON.stringify({
            match: {
              aligned: [{ text: "일치", evidenceIds: ids }],
              conflicting: [],
            },
            sections,
          }),
          ctx,
        );
      const ok = parse(["a1", "a3"]);
      if (!ok.ok) throw new Error(JSON.stringify(ok.issues));
      expect(ok.output.match?.aligned[0]?.evidenceIds).toEqual([U1, U3]);
      expect(
        validateStepOutput(4, ok.output, ctx, {}).issues.map((i) => i.code),
      ).not.toContain("unknown_evidence");
      const bad = parse(["a99"]);
      if (!bad.ok) throw new Error(JSON.stringify(bad.issues));
      expect(
        validateStepOutput(4, bad.output, ctx, {}).issues.map((i) => i.code),
      ).toContain("unknown_evidence");
    });

    it("6단계와 7단계 섹션 근거도 활동 id 로 돌린다", () => {
      for (const step of [6, 7] as const) {
        const r = parseStepResponse(
          step,
          JSON.stringify({
            sections: [section(stepSectionIds(step, ctx)[0] as string)],
            planDraft: [],
          }),
          ctx,
          step === 6 ? { axes: [] } : {},
        );
        const issues = r.ok ? [] : r.issues;
        expect(issues.map((i) => i.code)).not.toContain("unknown_evidence");
        if (r.ok) expect(r.output.sections?.[0]?.evidence_ids).toEqual([U2]);
      }
    });

    it("활동 id 로 직접 답해도 그대로 통과한다", () => {
      const r = parseStepResponse(
        3,
        JSON.stringify({
          narrative: validNarrative(),
          sections: [section("1-8", { evidence_ids: [U1] })],
        }),
        ctx,
      );
      if (!r.ok) throw new Error(JSON.stringify(r.issues));
      expect(r.output.sections?.[0]?.evidence_ids).toEqual([U1]);
    });
  });
});

describe("모델 근거 목록 대표 3개 절단", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => `e${i + 1}`);
  const ctx = makeContext({
    activities: many(6).map((id) => activity(id)),
    evidenceIds: many(6),
  });
  const ok = (r: ReturnType<typeof parseStepResponse>) => {
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    return r.output;
  };

  it("섹션 evidence_ids 는 중복을 없앤 앞 3개만 남긴다", () => {
    const raw = JSON.stringify({
      narrative: validNarrative(),
      sections: [
        {
          id: "1-8",
          status: "ok",
          body: { items: [{ text: "x", evidence_ids: ["e1"] }] },
          evidence_ids: ["e1", "e1", "e2", "e3", "e4", "e5"],
        },
      ],
    });
    const out = ok(parseStepResponse(3, raw, ctx));
    expect(out.sections?.[0]?.evidence_ids).toEqual(["e1", "e2", "e3"]);
  });

  it("본문 items 의 evidence_ids 도 3개로 줄인다", () => {
    const raw = JSON.stringify({
      narrative: validNarrative(),
      sections: [
        {
          id: "1-8",
          status: "ok",
          body: { items: [{ text: "x", evidence_ids: many(5) }] },
          evidence_ids: ["e1"],
        },
      ],
    });
    const out = ok(parseStepResponse(3, raw, ctx));
    expect(out.sections?.[0]?.body).toEqual([
      { text: "x", evidence_ids: ["e1", "e2", "e3"] },
    ]);
  });

  it("본문 rows 의 evidence_ids 도 3개로 줄인다", () => {
    const sections = stepSectionIds(4, ctx).map((id) =>
      id === "1-6"
        ? {
            id,
            status: "ok",
            body: { rows: [{ label: "a", value: "b", evidence_ids: many(4) }] },
            evidence_ids: ["e1"],
          }
        : { id, status: "no_data", evidence_ids: [] },
    );
    const out = ok(
      parseStepResponse(
        4,
        JSON.stringify({
          match: { aligned: [], conflicting: [] },
          sections,
        }),
        ctx,
      ),
    );
    const body = out.sections?.find((s) => s.id === "1-6")?.body as {
      rows: { evidence_ids: string[] }[];
    };
    expect(body.rows[0]?.evidence_ids).toEqual(["e1", "e2", "e3"]);
  });

  it("4단계 match 의 evidenceIds 도 3개로 줄인다", () => {
    const sections = stepSectionIds(4, ctx).map((id) => ({
      id,
      status: "no_data",
      evidence_ids: [],
    }));
    const out = ok(
      parseStepResponse(
        4,
        JSON.stringify({
          match: {
            aligned: [{ text: "t", evidenceIds: many(5) }],
            conflicting: [{ text: "u", evidenceIds: ["e2", "e2", "e6"] }],
          },
          sections,
        }),
        ctx,
      ),
    );
    expect(out.match?.aligned[0]?.evidenceIds).toEqual(["e1", "e2", "e3"]);
    expect(out.match?.conflicting[0]?.evidenceIds).toEqual(["e2", "e6"]);
  });

  it("응답 스키마에는 maxItems 를 넣지 않는다", () => {
    for (const step of [3, 5] as const)
      expect(JSON.stringify(STEP_RESPONSE_SCHEMAS[step])).not.toContain(
        "maxItems",
      );
    const calls: [4 | 7, StepCall][] = [
      [4, { kind: "section", id: "1-2" }],
      [4, { kind: "match" }],
      [7, { kind: "planDraft" }],
    ];
    for (const [step, call] of calls)
      expect(
        JSON.stringify(
          buildStepPrompt(step, {
            context: makeContext(),
            call,
            prior: {
              signals: [],
              narrative: validNarrative() as never,
              match: { aligned: [], conflicting: [] },
              consistency: {
                percent: 0,
                verdictLabel: "없음",
                smallSample: true,
              } as never,
              axes: [],
            },
          }).responseSchema,
        ),
      ).not.toContain("maxItems");
  });
});

describe("섹션 근거 합집합", () => {
  const ids = ["e1", "e2", "e3", "e4", "e5"];
  const ctx = makeContext({
    activities: ids.map((id) => activity(id)),
    evidenceIds: ids,
  });
  const raw = (item: unknown[], evidence: string[]) =>
    JSON.stringify({
      narrative: validNarrative(),
      sections: [
        {
          id: "1-8",
          status: "ok",
          body: { items: item },
          evidence_ids: evidence,
        },
      ],
    });

  it("섹션 근거가 비면 items 근거의 합집합을 순서대로 쓰고 절단하지 않는다", () => {
    const r = parseStepResponse(
      3,
      raw(
        [
          { text: "x", evidence_ids: ["e1", "e2", "e3"] },
          { text: "y", evidence_ids: ["e3", "e4", "e5"] },
        ],
        [],
      ),
      ctx,
    );
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.output.sections?.[0]?.evidence_ids).toEqual(ids);
    expect(validateStepOutput(3, r.output, ctx, {}).issues).toEqual([]);
  });

  it("rows 근거도 합집합에 든다", () => {
    const sections = stepSectionIds(4, ctx).map((id) =>
      id === "1-6"
        ? {
            id,
            status: "ok",
            body: {
              rows: [
                { label: "a", value: "b", evidence_ids: ["e2"] },
                { label: "c", value: "d", evidence_ids: ["e1", "e2"] },
              ],
            },
            evidence_ids: [],
          }
        : { id, status: "no_data", evidence_ids: [] },
    );
    const r = parseStepResponse(
      4,
      JSON.stringify({ match: { aligned: [], conflicting: [] }, sections }),
      ctx,
    );
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(
      r.output.sections?.find((s) => s.id === "1-6")?.evidence_ids,
    ).toEqual(["e2", "e1"]);
  });

  it("섹션과 본문 근거가 모두 비면 missing_evidence", () => {
    const r = parseStepResponse(
      3,
      raw([{ text: "x", evidence_ids: [] }], []),
      ctx,
    );
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(
      validateStepOutput(3, r.output, ctx, {}).issues.map((i) => i.code),
    ).toContain("missing_evidence");
  });
});

describe("1-9 학기 근거는 앱이 채운다", () => {
  const ctx = makeContext({
    activities: [
      activity("s1", { gradeLabel: "고1", semester: 1 }),
      activity("s2", { gradeLabel: "고1", semester: 1 }),
      activity("s3", { gradeLabel: "고1", semester: 2 }),
      activity("s4", { gradeLabel: "고2", semester: 1 }),
      activity("s5", { gradeLabel: null, semester: null }),
    ],
    evidenceIds: ["s1", "s2", "s3", "s4", "s5"],
  });
  const raw = (rows: unknown[], evidence: string[] = []) =>
    JSON.stringify({
      sections: [
        { id: "1-9", status: "ok", body: { rows }, evidence_ids: evidence },
      ],
    });
  const rowsOf = (r: ReturnType<typeof parseStepResponse>) => {
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    const s = r.output.sections?.find((x) => x.id === "1-9");
    return {
      section: s,
      rows: (
        (s?.body ?? { rows: [] }) as {
          rows: { label: string; evidence_ids: string[] }[];
        }
      ).rows,
    };
  };

  it("각 행 근거를 그 학기 활동 전부로 채우고 섹션 근거는 합집합이다", () => {
    const { section, rows } = rowsOf(
      parseStepResponse(
        5,
        raw([
          { label: "고1-1", value: "연계", evidence_ids: ["s4"] },
          { label: "고1-2", value: "단절", evidence_ids: [] },
          { label: "고2-1", value: "연계", evidence_ids: [] },
        ]),
        ctx,
      ),
    );
    expect(rows.map((r) => r.evidence_ids)).toEqual([
      ["s1", "s2"],
      ["s3"],
      ["s4"],
    ]);
    expect(section?.evidence_ids).toEqual(["s1", "s2", "s3", "s4"]);
  });

  it("모델이 근거를 비워도 missing_evidence 없이 통과한다", () => {
    const r = parseStepResponse(
      5,
      raw([{ label: "고1-1", value: "연계", evidence_ids: [] }]),
      ctx,
    );
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(
      validateStepOutput(5, r.output, ctx, {}).issues.map((i) => i.code),
    ).not.toContain("missing_evidence");
  });

  it("학기 키가 아니거나 활동이 없는 학기 행은 근거가 빈다", () => {
    const { section, rows } = rowsOf(
      parseStepResponse(
        5,
        raw(
          [
            { label: "고3-2", value: "자료 없음", evidence_ids: ["s1"] },
            { label: "엉뚱", value: "연계", evidence_ids: ["s1"] },
            { label: "고1-1", value: "연계", evidence_ids: [] },
          ],
          ["s5"],
        ),
        ctx,
      ),
    );
    expect(rows.map((r) => r.evidence_ids)).toEqual([[], [], ["s1", "s2"]]);
    expect(section?.evidence_ids).toEqual(["s1", "s2"]);
  });

  it("행이 전부 근거 없는 학기이면 섹션 근거가 비어 missing_evidence 로 남는다", () => {
    const r = parseStepResponse(
      5,
      raw([{ label: "고3-2", value: "자료 없음", evidence_ids: ["s1"] }]),
      ctx,
    );
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(
      validateStepOutput(5, r.output, ctx, {}).issues.map((i) => i.code),
    ).toContain("missing_evidence");
  });
});

describe("호출 범위 파싱과 검증", () => {
  const ctx = makeContext();
  const section = (id: string) => ({
    id,
    status: "ok",
    evidence_ids: ["a1"],
    body: { text: "서술" },
  });

  it("섹션 호출은 그 섹션 하나만 기대하고 다른 섹션이 없어도 통과한다", () => {
    const r = parseStepResponse(
      4,
      JSON.stringify({ sections: [section("1-11")] }),
      ctx,
      { call: { kind: "section", id: "1-11" } },
    );
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.output.sections?.map((s) => s.id)).toEqual(["1-11"]);
    expect(r.output.match).toBeUndefined();
  });

  it("섹션 호출이 요청한 섹션을 빠뜨리면 missing_section 이다", () => {
    const r = parseStepResponse(
      4,
      JSON.stringify({ sections: [section("1-6")] }),
      ctx,
      { call: { kind: "section", id: "1-11" } },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.code)).toEqual(["missing_section"]);
  });

  it("match 호출은 섹션 없이 match 만 파싱한다", () => {
    const r = parseStepResponse(
      4,
      JSON.stringify({
        match: {
          aligned: [{ text: "일치", evidenceIds: ["a2"] }],
          conflicting: [],
        },
      }),
      ctx,
      { call: { kind: "match" } },
    );
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.output.match?.aligned).toHaveLength(1);
    expect(r.output.sections).toEqual([]);
  });

  it("match 호출이 모르는 근거를 가리키면 unknown_evidence 다", () => {
    const v = validateStepOutput(
      4,
      {
        step: 4,
        sections: [],
        match: {
          aligned: [{ text: "일치", evidenceIds: ["zz"] }],
          conflicting: [],
        },
      },
      ctx,
      { call: { kind: "match" } },
    );
    expect(v.issues.map((i) => i.code)).toContain("unknown_evidence");
  });

  it("7단계 섹션 호출은 planDraft 가 없어도 실행계획 상한 검증을 하지 않는다", () => {
    const sections = [
      { ...section("3-2"), title: "t", format: "prose", badge: "fact" },
    ] as never;
    const sectionCall = validateStepOutput(7, { step: 7, sections }, ctx, {
      call: { kind: "section", id: "3-2" },
    });
    expect(sectionCall.issues.map((i) => i.code)).not.toContain(
      "no_required_plan_item",
    );
    const planCall = validateStepOutput(7, { step: 7, planDraft: [] }, ctx, {
      call: { kind: "planDraft" },
    });
    expect(planCall.issues.map((i) => i.code)).toContain(
      "no_required_plan_item",
    );
  });

  it("6단계 섹션 호출은 다른 축 섹션을 끼워 넣지 않는다", () => {
    const axes = [
      { axis: "A", count: 1, verdictLabel: "주의", activityIds: ["a1"] },
      { axis: "B", count: 0, verdictLabel: "없음", activityIds: [] },
    ] as never;
    const r = parseStepResponse(
      6,
      JSON.stringify({
        sections: [{ ...section("2-1"), body: { rows: [] } }],
      }),
      ctx,
      { axes, call: { kind: "section", id: "2-1" } },
    );
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.output.sections?.map((s) => s.id)).toEqual(["2-1"]);
  });
});

describe("표 섹션 칸 계약", () => {
  const ctx = makeContext();
  const consistency = {
    percent: 33.3,
    linked: 1,
    total: 3,
    formula: "식",
    verdict: "splitting" as const,
    verdictLabel: "갈리는 중",
    criteria: "기준",
    smallSample: true,
  };
  const prior = {
    signals: [],
    narrative: validNarrative() as never,
    match: { aligned: [], conflicting: [] },
    consistency,
    axes: [],
  };
  const sectionPrompt = (step: 4 | 6 | 7, id: string) =>
    buildStepPrompt(step, {
      context: ctx,
      prior,
      call: { kind: "section", id },
    });

  // 표 섹션별 단계, 행 수 안내, 짧은 예시 행의 칸 이름
  const SPECS = [
    { step: 4, id: "1-6", rows: "3행", cell: "label 은" },
    { step: 4, id: "1-7", rows: "3행", cell: "label 은" },
    { step: 6, id: "2-6", rows: "최대 5행", cell: "label 은" },
    { step: 7, id: "3-5", rows: "최대 5행", cell: "subject 는" },
    { step: 7, id: "3-7", rows: "3행", cell: "label 은" },
  ] as const;

  it.each(SPECS)("$id 지시에 행 수 $rows, 60자 규칙, 예시 행이 있다", (s) => {
    const b = sectionPrompt(s.step, s.id);
    expect(b.user).toContain(s.rows);
    expect(b.user).toContain("60자 이내");
    expect(b.user).toContain("예시 행");
    expect(b.user).toContain(s.cell);
  });

  it("공통 규칙은 표 칸을 한 문장 60자 이내, 줄바꿈과 괄호 부연 없이 쓰게 한다", () => {
    const b = sectionPrompt(4, "1-6");
    expect(b.system).toContain("안내한 행 수");
    expect(b.system).toContain("한 문장 60자 이내");
    expect(b.system).toContain("줄바꿈과 괄호 부연 없이");
    expect(b.system).not.toContain("8행 이내");
  });

  it("표 섹션 안내문과 예시 행에 금지 문자가 없다", () => {
    const FORBIDDEN = /[\u2014\u2013\u00b7\u318d\u2190-\u21ff]/;
    for (const s of SPECS)
      expect(sectionPrompt(s.step, s.id).user).not.toMatch(FORBIDDEN);
  });

  it("표 형식 섹션 호출은 한도 1024, 나머지 섹션 호출은 1536 이다", () => {
    expect(TABLE_SECTION_CALL_MAX_OUTPUT_TOKENS).toBe(1024);
    for (const s of SPECS)
      expect(sectionPrompt(s.step, s.id).maxOutputTokens).toBe(1024);
    expect(sectionPrompt(6, "2-1").maxOutputTokens).toBe(1024);
    expect(sectionPrompt(4, "1-2").maxOutputTokens).toBe(1536);
    expect(sectionPrompt(4, "1-11").maxOutputTokens).toBe(1536);
    expect(sectionPrompt(7, "3-11").maxOutputTokens).toBe(1536);
    expect(sectionPrompt(7, "3-2").maxOutputTokens).toBe(1536);
  });
});

describe("표 칸 길이 검증", () => {
  const ctx = makeContext();
  const tableSection = (id: string, row: Record<string, unknown>) =>
    ({
      id,
      title: "t",
      format: "table",
      badge: "fact",
      status: "ok",
      evidence_ids: ["a1"],
      body: { rows: [{ evidence_ids: ["a1"], ...row }] },
    }) as never;
  const check = (
    step: 4 | 6 | 7,
    id: string,
    row: Record<string, unknown>,
    call: StepCall | null = { kind: "section", id },
  ) =>
    validateStepOutput(
      step,
      { step, sections: [tableSection(id, row)] },
      ctx,
      call ? { call } : {},
    ).issues;

  it("표 섹션 호출의 칸이 121자면 table_cell_too_long 이고 path 는 섹션 id 다", () => {
    const issues = check(4, "1-6", { label: "성향", value: "가".repeat(121) });
    const hit = issues.filter((i) => i.code === "table_cell_too_long");
    expect(hit).toHaveLength(1);
    expect(hit[0]?.path).toBe("1-6");
  });

  it("120자 칸은 통과한다", () => {
    expect(check(4, "1-6", { label: "성향", value: "가".repeat(120) })).toEqual(
      [],
    );
  });

  it("subject, direction, record_to_leave 칸도 같은 기준으로 검사한다", () => {
    for (const key of ["subject", "direction", "record_to_leave"]) {
      const codes = check(7, "3-5", { [key]: "가".repeat(121) }).map(
        (i) => i.code,
      );
      expect(codes, key).toContain("table_cell_too_long");
    }
  });

  it("호출 범위가 없는 단계 전체 검증은 칸 길이를 보지 않는다(앱 행 보호)", () => {
    const codes = check(
      6,
      "2-1",
      { label: "근거 활동", value: "가".repeat(200) },
      null,
    ).map((i) => i.code);
    expect(codes).not.toContain("table_cell_too_long");
  });

  it("표가 아닌 섹션 호출은 칸 길이를 보지 않는다", () => {
    const issues = validateStepOutput(
      4,
      {
        step: 4,
        sections: [
          {
            id: "1-11",
            title: "t",
            format: "prose",
            badge: "fact",
            status: "ok",
            evidence_ids: ["a1"],
            body: { text: "가".repeat(200) },
          },
        ] as never,
      },
      ctx,
      { call: { kind: "section", id: "1-11" } },
    ).issues;
    expect(issues.map((i) => i.code)).not.toContain("table_cell_too_long");
  });
});

// biome-ignore lint/suspicious/noExplicitAny: 스키마 트리를 느슨하게 읽는다.
type Loose = any;

describe("형식별 엄격한 섹션 호출 스키마", () => {
  const ctx = makeContext();
  const prior = {
    signals: [],
    narrative: validNarrative() as never,
    match: { aligned: [], conflicting: [] },
    consistency: {
      percent: 33.3,
      linked: 1,
      total: 3,
      formula: "식",
      verdict: "splitting" as const,
      verdictLabel: "갈리는 중",
      criteria: "기준",
      smallSample: true,
    },
    axes: [],
  };
  const call = (step: 4 | 6 | 7, id: string) =>
    buildStepPrompt(step, {
      context: ctx,
      prior,
      call: { kind: "section", id },
    });
  // sections.items 객체 스키마를 꺼낸다.
  const sectionObj = (step: 4 | 6 | 7, id: string) =>
    (
      call(step, id).responseSchema as unknown as {
        properties: { sections: { items: Record<string, unknown> } };
      }
    ).properties.sections.items as {
      required: string[];
      propertyOrdering: string[];
      properties: Record<string, Loose>;
    };

  it("공통 섹션 객체는 id, status, evidence_ids 가 필수이고 순서를 지정한다", () => {
    const o = sectionObj(4, "1-6");
    expect(o.required).toEqual(["id", "status", "evidence_ids"]);
    expect(o.propertyOrdering).toEqual([
      "id",
      "status",
      "evidence_ids",
      "body",
      "no_data_reason",
    ]);
    expect(o.properties.status.enum).toEqual(["ok", "no_data"]);
  });

  it("표 섹션 1-6 은 rows 만 필수이고 행은 label, value, evidence_ids 가 필수다", () => {
    const body = sectionObj(4, "1-6").properties.body;
    expect(body.required).toEqual(["rows"]);
    expect(Object.keys(body.properties)).toEqual(["rows"]);
    expect(body.properties.rows.items.required).toEqual([
      "label",
      "value",
      "evidence_ids",
    ]);
    expect(body.properties.rows.items.propertyOrdering).toEqual([
      "label",
      "value",
      "evidence_ids",
    ]);
  });

  it("표 섹션 3-5 의 행은 subject, direction, record_to_leave, evidence_ids 가 필수다", () => {
    const row = sectionObj(7, "3-5").properties.body.properties.rows.items;
    const keys = ["subject", "direction", "record_to_leave", "evidence_ids"];
    expect(row.required).toEqual(keys);
    expect(row.propertyOrdering).toEqual(keys);
  });

  it("축 섹션 2-1 도 label, value, evidence_ids 행 표 스키마다", () => {
    const body = sectionObj(6, "2-1").properties.body;
    expect(body.required).toEqual(["rows"]);
    expect(body.properties.rows.items.required).toEqual([
      "label",
      "value",
      "evidence_ids",
    ]);
  });

  it("prose 섹션 1-11 은 text 만 필수다", () => {
    const body = sectionObj(4, "1-11").properties.body;
    expect(body.required).toEqual(["text"]);
    expect(Object.keys(body.properties)).toEqual(["text"]);
  });

  it("list 섹션 3-11 은 items 가 필수이고 항목은 text, evidence_ids 가 필수다", () => {
    const body = sectionObj(7, "3-11").properties.body;
    expect(body.required).toEqual(["items"]);
    expect(body.properties.items.items.required).toEqual([
      "text",
      "evidence_ids",
    ]);
    expect(body.properties.items.items.propertyOrdering).toEqual([
      "text",
      "evidence_ids",
    ]);
  });

  it("3단계 1-8 은 list, 5단계 1-9 는 label, value 표 스키마를 쓴다", () => {
    const s3 = (
      buildStepPrompt(3, { context: ctx, prior }).responseSchema as Loose
    ).properties.sections.items.properties.body;
    expect(s3.required).toEqual(["items"]);
    const s5 = (
      buildStepPrompt(5, { context: ctx, prior }).responseSchema as Loose
    ).properties.sections.items.properties.body;
    expect(s5.properties.rows.items.required).toEqual([
      "label",
      "value",
      "evidence_ids",
    ]);
  });

  it("match 항목은 text, evidenceIds 필수와 순서, planDraft 는 순서를 지정한다", () => {
    const m = (
      buildStepPrompt(4, { context: ctx, prior, call: { kind: "match" } })
        .responseSchema as Loose
    ).properties.match.properties.aligned.items;
    expect(m.required).toEqual(["text", "evidenceIds"]);
    expect(m.propertyOrdering).toEqual(["text", "evidenceIds"]);
    const p = (
      buildStepPrompt(7, { context: ctx, prior, call: { kind: "planDraft" } })
        .responseSchema as Loose
    ).properties.planDraft.items;
    expect(p.propertyOrdering).toEqual([
      "program",
      "title",
      "description",
      "priority",
      "period",
      "periodLabel",
      "axis",
      "category",
    ]);
  });

  it("스키마에는 maxItems, maxLength 가 없다", () => {
    for (const [step, id] of [
      [4, "1-6"],
      [7, "3-5"],
      [4, "1-11"],
      [7, "3-11"],
      [6, "2-1"],
    ] as const) {
      const text = JSON.stringify(call(step, id).responseSchema);
      expect(text).not.toContain("maxItems");
      expect(text).not.toContain("maxLength");
    }
  });

  it("일반 섹션 호출 user 끝에 근거 1~3개 지시가 있고 1-2 와 축 섹션에는 없다", () => {
    const LINE = "evidence_ids 에 근거 활동 1~3개를 단다";
    for (const [step, id] of [
      [4, "1-6"],
      [4, "1-11"],
      [6, "2-6"],
      [7, "3-4"],
      [7, "3-11"],
    ] as const)
      expect(call(step, id).user).toContain(LINE);
    for (const [step, id] of [
      [4, "1-2"],
      [6, "2-1"],
      [6, "2-5"],
    ] as const)
      expect(call(step, id).user).not.toContain(LINE);
  });
});

describe("새 스키마 응답 파싱", () => {
  const ctx = makeContext();
  const parse = (step: 4 | 7, id: string, body: unknown) => {
    const r = parseStepResponse(
      step,
      JSON.stringify({
        sections: [{ id, status: "ok", evidence_ids: ["a1"], body }],
      }),
      ctx,
      { call: { kind: "section", id } },
    );
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    return r.output.sections?.[0]?.body;
  };

  it("body.text, body.items, body.rows 를 받는다", () => {
    expect(parse(4, "1-11", { text: "정체성" })).toBe("정체성");
    const items = [{ text: "활동", evidence_ids: ["a1"] }];
    expect(parse(7, "3-11", { items })).toEqual(items);
    const rows = [{ label: "과학", value: "역할", evidence_ids: ["a1"] }];
    expect(parse(4, "1-6", { rows })).toEqual({ rows });
  });
});
