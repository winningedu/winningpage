import { describe, expect, it, vi } from "vitest";
import {
  expectedSectionIds,
  NO_DATA_TEXT,
  type SectionItem,
} from "../sections.js";
import { validateStep } from "../validation.js";
import { stepSectionIds } from "./prompts.js";
import {
  type RunStepDeps,
  readStored,
  runStep,
  type StoredOutputs,
} from "./runStep.js";
import type { ContextActivity, ReportContext } from "./types.js";

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

const emptyStored = (over: Partial<StoredOutputs> = {}): StoredOutputs => ({
  signals: null,
  narrative_theme: null,
  grade_subthemes: null,
  stage: null,
  consistency: null,
  axis_scores: null,
  sections: [],
  planDraft: null,
  ...over,
});

type ModelReply = Awaited<ReturnType<RunStepDeps["callModel"]>>;
const reply = (
  text: string,
  finishReason: string | null = "STOP",
): ModelReply => ({
  text,
  finishReason,
});

const deps = (over: Partial<RunStepDeps> = {}): RunStepDeps => ({
  callModel: vi.fn(async () => {
    throw new Error("모델을 부르면 안 된다");
  }),
  now: () => "2026-10-06T00:00:00.000Z",
  budgetMs: 10_000,
  ...over,
});

describe("1단계", () => {
  it("활동이 0건이면 모델을 부르지 않고 빈 신호로 끝낸다", async () => {
    const d = deps();
    const r = await runStep(
      1,
      makeContext({ activities: [], evidenceIds: [] }),
      emptyStored({ signals: { classification: { x: 1 } } }),
      d,
    );
    expect(d.callModel).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, step: 1, extraAttempts: 0 });
    if (r.ok)
      expect(r.patch).toEqual({
        signals: { classification: { x: 1 }, byActivity: [] },
      });
  });
});

describe("2단계", () => {
  it("모델 없이 분류를 signals.classification 에 합친다", async () => {
    const d = deps();
    const r = await runStep(
      2,
      makeContext(),
      emptyStored({ signals: { byActivity: [] } }),
      d,
    );
    expect(d.callModel).not.toHaveBeenCalled();
    if (!r.ok) throw new Error("expected ok");
    const signals = r.patch.signals as Record<string, unknown>;
    expect(signals.byActivity).toEqual([]);
    expect(signals.classification).toMatchObject({
      byGroup: { curricular: 3 },
    });
    expect(Object.keys(r.patch)).toEqual(["signals"]);
  });
});

const signalJson = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    signals: [
      {
        activityId: "a1",
        axes: ["A"],
        method: "실험",
        keywords: ["열"],
        summary: "요약",
        ...extra,
      },
    ],
  });

describe("1단계 모델 호출", () => {
  it("파싱한 신호에 앱이 연계 표현을 단다", async () => {
    const linked = "물리에서 학습한 열 전달을 이번에 적용해 실험했다";
    const ctx = makeContext({
      activities: [activity("a1", { text: linked }), activity("a2")],
      evidenceIds: ["a1", "a2"],
    });
    const callModel = vi.fn(async () => reply(signalJson({ linkage: [] })));
    const r = await runStep(1, ctx, emptyStored(), deps({ callModel }));
    if (!r.ok) throw new Error(JSON.stringify(r));
    const by = (
      r.patch.signals as {
        byActivity: { activityId: string; linkage: string[] }[];
      }
    ).byActivity;
    expect(by.find((s) => s.activityId === "a1")?.linkage).toEqual([
      "subject_link",
    ]);
    expect(by.find((s) => s.activityId === "a2")?.linkage).toEqual([]);
    expect(r.extraAttempts).toBe(0);
  });
});

describe("3단계 선행 산출물", () => {
  it("signals 가 없으면 fatal missing_prior", async () => {
    const d = deps();
    const r = await runStep(3, makeContext(), emptyStored(), d);
    expect(d.callModel).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: false, failure: "fatal", extraAttempts: 0 });
    if (!r.ok) expect(r.issues[0]?.code).toBe("missing_prior");
  });
});

describe("readStored", () => {
  it("깨진 값은 null 또는 빈 배열로 정규화한다", () => {
    const r = readStored(
      emptyStored({
        signals: "oops",
        consistency: 5,
        axis_scores: { a: 1 },
        sections: "x",
        planDraft: "y",
        grade_subthemes: 3,
        narrative_theme: "주제",
      }),
    );
    expect(r).toEqual({
      signals: [],
      classification: null,
      narrative: null,
      match: null,
      consistency: null,
      axes: null,
      sections: [],
      planDraft: null,
    });
  });

  it("정상 값은 그대로 읽고 서사는 주제와 하위 주제로 조립한다", () => {
    const subthemes = [{ grade: "고1", stage: "seed", text: "기초" }];
    const consistency = { total: 1, linked: 1, percent: 100 };
    const r = readStored(
      emptyStored({
        signals: {
          byActivity: [{ activityId: "a1", axes: ["A"] }],
          match: { aligned: [], conflicting: [] },
        },
        narrative_theme: "주제",
        grade_subthemes: subthemes,
        consistency,
        axis_scores: [{ axis: "A" }],
        sections: [{ id: "1-8" }],
        planDraft: [],
      }),
    );
    expect(r.signals).toHaveLength(1);
    expect(r.narrative).toEqual({ theme: "주제", subthemes });
    expect(r.match).toEqual({ aligned: [], conflicting: [] });
    expect(r.consistency).toEqual(consistency);
    expect(r.axes).toHaveLength(1);
    expect(r.sections).toHaveLength(1);
    expect(r.planDraft).toEqual([]);
  });
});

const sec8 = (over: Record<string, unknown> = {}) => ({
  id: "1-8",
  status: "ok",
  body: [{ text: "열 전달 반복", evidence_ids: ["a1"] }],
  evidence_ids: ["a1"],
  ...over,
});
const narrativeJson = (sections: unknown[] = [sec8()]) =>
  JSON.stringify({
    narrative: {
      theme: "열과 에너지 흐름",
      subthemes: [
        { grade: "고1", stage: "seed", text: "기초" },
        { grade: "고2", stage: "flower", text: "심화" },
        { grade: "고3", stage: "bloom", text: "완성" },
      ],
    },
    sections,
  });
const withSignals = emptyStored({ signals: { byActivity: [] } });

describe("3단계 모델 호출", () => {
  it("서사와 현재 학년 단계, 합친 섹션을 patch 에 담는다", async () => {
    const existing = {
      id: "1-1",
      title: "학생 프로필",
      format: "table",
      badge: "fact",
      status: "ok",
      evidence_ids: [],
      body: {},
    };
    const callModel = vi.fn(async () => reply(narrativeJson()));
    const r = await runStep(
      3,
      makeContext(),
      { ...withSignals, sections: [existing] },
      deps({ callModel }),
    );
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.patch).toMatchObject({
      narrative_theme: "열과 에너지 흐름",
      stage: "flower",
    });
    expect(r.patch.grade_subthemes).toHaveLength(3);
    expect((r.patch.sections as SectionItem[]).map((x) => x.id)).toEqual([
      "1-1",
      "1-8",
    ]);
    expect(r.extraAttempts).toBe(0);
  });

  it("검증 실패 뒤 한 번 재요청하고 두 번째 user 에 이전 문제를 담는다", async () => {
    const callModel = vi
      .fn<RunStepDeps["callModel"]>()
      .mockResolvedValueOnce(reply("not json"))
      .mockResolvedValueOnce(reply(narrativeJson()));
    const r = await runStep(3, makeContext(), withSignals, deps({ callModel }));
    expect(r).toMatchObject({ ok: true, extraAttempts: 1 });
    expect(callModel).toHaveBeenCalledTimes(2);
    expect(callModel.mock.calls[0]?.[0].user).not.toContain("이전 응답의 문제");
    expect(callModel.mock.calls[1]?.[0].user).toContain("이전 응답의 문제");
  });

  it("두 번 실패하면 validation 과 extraAttempts 1", async () => {
    const callModel = vi.fn(async () => reply("not json"));
    const r = await runStep(3, makeContext(), withSignals, deps({ callModel }));
    expect(callModel).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({
      ok: false,
      failure: "validation",
      extraAttempts: 1,
    });
    if (!r.ok) expect(r.issues[0]?.code).toBe("invalid_json");
  });

  it("출력 한도로 잘린 응답은 파싱하지 않고 truncated 로 재요청하며 메모를 담는다", async () => {
    const callModel = vi
      .fn<RunStepDeps["callModel"]>()
      .mockResolvedValueOnce(reply("{", "MAX_TOKENS"))
      .mockResolvedValueOnce(reply(narrativeJson()));
    const r = await runStep(3, makeContext(), withSignals, deps({ callModel }));
    expect(r).toMatchObject({ ok: true, extraAttempts: 1 });
    const second = callModel.mock.calls[1]?.[0].user ?? "";
    expect(second).toContain("출력 한도를 넘어 잘렸다");
    expect(second).toContain("절반 이하");
  });

  it("두 번 다 잘리면 validation 실패와 truncated issue", async () => {
    const callModel = vi.fn(async () => reply("{", "MAX_TOKENS"));
    const r = await runStep(3, makeContext(), withSignals, deps({ callModel }));
    expect(callModel).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ ok: false, failure: "validation" });
    if (!r.ok) expect(r.issues[0]?.code).toBe("truncated");
  });

  it("잘렸어도 JSON 이 우연히 완결돼 있으면 쓰지 않고 잘림으로 본다", async () => {
    const callModel = vi.fn(async () => reply(narrativeJson(), "MAX_TOKENS"));
    const r = await runStep(3, makeContext(), withSignals, deps({ callModel }));
    expect(r).toMatchObject({ ok: false, failure: "validation" });
  });

  it("예외는 upstream", async () => {
    const callModel = vi.fn(async () => {
      throw new Error("boom");
    });
    const r = await runStep(3, makeContext(), withSignals, deps({ callModel }));
    expect(r).toMatchObject({
      ok: false,
      failure: "upstream",
      extraAttempts: 0,
    });
  });

  it("재시도 중 예외도 upstream 이고 추가 호출 1건을 센다", async () => {
    const callModel = vi
      .fn<RunStepDeps["callModel"]>()
      .mockResolvedValueOnce(reply("not json"))
      .mockRejectedValueOnce(new Error("boom"));
    const r = await runStep(3, makeContext(), withSignals, deps({ callModel }));
    expect(r).toMatchObject({
      ok: false,
      failure: "upstream",
      extraAttempts: 1,
    });
  });

  it("예산 안에 끝나지 않으면 timeout", async () => {
    const callModel = vi.fn(() => new Promise<ModelReply>(() => undefined));
    const r = await runStep(
      3,
      makeContext(),
      withSignals,
      deps({ callModel, budgetMs: 20 }),
    );
    expect(r).toMatchObject({
      ok: false,
      failure: "timeout",
      extraAttempts: 0,
    });
  });

  it("첫 호출 뒤 예산이 바닥나 재시도를 못 하면 extraAttempts 0", async () => {
    let t = 0;
    const callModel = vi.fn(async () => {
      t += 20_000;
      return reply("not json");
    });
    const r = await runStep(
      3,
      makeContext(),
      withSignals,
      deps({
        callModel,
        budgetMs: 10_000,
        now: () => new Date(Date.UTC(2026, 9, 6) + t).toISOString(),
      }),
    );
    expect(callModel).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({
      ok: false,
      failure: "timeout",
      extraAttempts: 0,
    });
  });

  it("남은 예산이 0 이하면 호출하지 않고 timeout", async () => {
    const d = deps({ budgetMs: 0 });
    const r = await runStep(3, makeContext(), withSignals, d);
    expect(d.callModel).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: false, failure: "timeout" });
  });
});

describe("5단계", () => {
  it("분석할 활동이 0건이면 모델 없이 no_data 섹션으로 끝낸다", async () => {
    const d = deps();
    const r = await runStep(
      5,
      makeContext({ activities: [], evidenceIds: [] }),
      withSignals,
      d,
    );
    expect(d.callModel).not.toHaveBeenCalled();
    if (!r.ok) throw new Error("expected ok");
    const sections = r.patch.sections as SectionItem[];
    expect(sections.map((x) => x.id)).toEqual(["1-9", "1-10"]);
    for (const x of sections) {
      expect(x).toMatchObject({
        status: "no_data",
        evidence_ids: [],
        body: { text: NO_DATA_TEXT, reason: "분석할 활동이 없어요" },
      });
    }
    expect(r.patch.consistency).toMatchObject({ total: 0 });
  });
});

describe("5단계 모델 호출", () => {
  const sigs = [
    {
      activityId: "a1",
      axes: ["A"],
      linkage: [],
      keywords: [],
      method: null,
      summary: "s",
    },
    {
      activityId: "a2",
      axes: ["A"],
      linkage: [],
      keywords: [],
      method: null,
      summary: "s",
    },
    {
      activityId: "a3",
      axes: ["C"],
      linkage: [],
      keywords: [],
      method: null,
      summary: "s",
    },
  ];
  it("1-10 본문의 계산 필드는 모델 값이 아니라 앱 값으로 덮는다", async () => {
    const ctx = makeContext();
    const { computeStep5 } = await import("./compute.js");
    const { consistency, expectedFormula } = computeStep5(ctx, sigs as never);
    const model = JSON.stringify({
      formula: expectedFormula,
      sections: [
        { id: "1-9", status: "ok", body: { rows: [] }, evidence_ids: ["a1"] },
        {
          id: "1-10",
          status: "ok",
          evidence_ids: ["a1"],
          body: {
            percent: 1,
            verdictLabel: "엉터리",
            linked: 99,
            total: 7,
            text: "해석",
          },
        },
      ],
    });
    const r = await runStep(
      5,
      ctx,
      emptyStored({ signals: { byActivity: sigs } }),
      deps({ callModel: vi.fn(async () => reply(model)) }),
    );
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    const item = (r.patch.sections as SectionItem[]).find(
      (x) => x.id === "1-10",
    );
    expect(item?.body).toMatchObject({
      percent: consistency.percent,
      formula: consistency.formula,
      verdictLabel: consistency.verdictLabel,
      total: consistency.total,
      smallSample: consistency.smallSample,
      criteria: consistency.criteria,
      linked: ["a1", "a2", "a3"],
      text: "해석",
    });
  });
});

describe("6단계 축 섹션 정규화", () => {
  const sigs = [
    {
      activityId: "a1",
      axes: ["A"],
      linkage: [],
      keywords: [],
      method: null,
      summary: "s",
    },
    {
      activityId: "a2",
      axes: ["A"],
      linkage: [],
      keywords: [],
      method: null,
      summary: "s",
    },
    {
      activityId: "a3",
      axes: ["C"],
      linkage: [],
      keywords: [],
      method: null,
      summary: "s",
    },
  ];
  const bodyOf = (format: string) =>
    format === "prose"
      ? "본문"
      : format === "list"
        ? []
        : format === "table"
          ? { rows: [] }
          : {};

  it("근거 없는 축을 ok 로 쓰거나 빠뜨려도 앱이 no_data 로 정규화해 한 번에 통과한다", async () => {
    const { computeStep6 } = await import("./compute.js");
    const { SECTION_REGISTRY } = await import("../sections.js");
    const ctx = makeContext();
    const axes = computeStep6(ctx, sigs as never);
    const label = (a: string) => axes.find((x) => x.axis === a)?.verdictLabel;
    const axisRow = (a: string) => ({
      rows: [{ label: "판정", value: label(a) }],
    });
    const mk = (id: string, over: Record<string, unknown>) => {
      const def = SECTION_REGISTRY.find((d) => d.id === id);
      return {
        id,
        status: "ok",
        evidence_ids: ["a1"],
        body: bodyOf(def?.format ?? "prose"),
        ...over,
      };
    };
    const sections = [
      mk("2-1", { evidence_ids: [], body: axisRow("A") }),
      mk("2-3", { evidence_ids: ["a3"], body: axisRow("C") }),
      mk("2-5", { evidence_ids: [], body: axisRow("E") }),
      ...["2-6", "2-7", "2-8", "2-9", "2-10"].map((id) => mk(id, {})),
    ];
    const callModel = vi.fn(async () => reply(JSON.stringify({ sections })));
    const r = await runStep(
      6,
      ctx,
      { ...emptyStored({ signals: { byActivity: sigs } }) },
      deps({ callModel }),
    );
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(callModel).toHaveBeenCalledTimes(1);
    const out = r.output.sections ?? [];
    const byId = (id: string) => out.find((x) => x.id === id);
    expect(byId("2-1")?.evidence_ids.sort()).toEqual(
      axes.find((x) => x.axis === "A")?.activityIds.sort(),
    );
    for (const id of ["2-2", "2-4", "2-5"])
      expect(byId(id)?.status).toBe("no_data");
    expect(out.map((x) => x.id)).toEqual([
      "2-1",
      "2-2",
      "2-3",
      "2-4",
      "2-5",
      "2-6",
      "2-7",
      "2-8",
      "2-9",
      "2-10",
    ]);
  });
});

describe("8단계", () => {
  const ready = () => {
    const ctx = makeContext({
      expectedSectionIds: [
        "1-1",
        "1-3",
        "1-4",
        "1-5",
        "1-12",
        "1-13",
        "1-14",
        "3-1",
        "3-8",
        "3-9",
        "3-10",
      ],
    });
    return { ctx };
  };

  it("선행 산출물이 없으면 fatal", async () => {
    const r = await runStep(8, makeContext(), withSignals, deps());
    expect(r).toMatchObject({ ok: false, failure: "fatal" });
  });

  it("조립 검증을 통과하면 completion 과 sections patch 를 돌려준다", async () => {
    const { ctx } = ready();
    const first = await runStep(2, ctx, withSignals, deps());
    if (!first.ok) throw new Error("step2");
    const cls = (first.patch.signals as Record<string, unknown>).classification;
    const stored = emptyStored({
      signals: { byActivity: [], classification: cls },
      consistency: await consistencyOf(ctx),
      axis_scores: await axesOf(ctx),
      planDraft: [],
    });
    const r = await runStep(8, ctx, stored, deps({ carried: [] }));
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.completion?.profile.profile_id).toBe("p1");
    expect(r.completion?.planRows).toEqual([]);
    expect(r.patch.sections).toBe(r.completion?.sections);
  });

  it("검증에 실패하면 issues 를 그대로 돌려준다", async () => {
    const ctx = makeContext({ expectedSectionIds: ["3-2"] });
    const first = await runStep(2, ctx, withSignals, deps());
    if (!first.ok) throw new Error("step2");
    const stored = emptyStored({
      signals: {
        byActivity: [],
        classification: (first.patch.signals as Record<string, unknown>)
          .classification,
      },
      consistency: await consistencyOf(ctx),
      axis_scores: await axesOf(ctx),
    });
    const r = await runStep(8, ctx, stored, deps());
    expect(r).toMatchObject({
      ok: false,
      failure: "fatal",
      extraAttempts: 0,
    });
    if (!r.ok) expect(r.issues.length).toBeGreaterThan(0);
  });
});

describe("8단계 3-1 근거", () => {
  it("저장된 1-8 섹션의 근거를 3-1 이 받는다", async () => {
    const ctx = makeContext({
      expectedSectionIds: expectedSectionIds({ omit: [] }).filter(
        (id) => !/^(1-2|1-6|1-7|1-9|1-10|1-11|2-|3-[2-7]|3-1[1-3])/.test(id),
      ),
    });
    const first = await runStep(2, ctx, withSignals, deps());
    if (!first.ok) throw new Error("step2");
    const cls = (first.patch.signals as Record<string, unknown>).classification;
    const r = await runStep(
      8,
      ctx,
      emptyStored({
        signals: { byActivity: [], classification: cls },
        narrative_theme: "주제",
        grade_subthemes: [{ grade: "고1", stage: "seed", text: "기초" }],
        consistency: await consistencyOf(ctx),
        axis_scores: await axesOf(ctx),
        sections: [
          {
            id: "1-8",
            title: "반복된 문제의식",
            format: "list",
            badge: "fact",
            status: "ok",
            evidence_ids: ["a2"],
            body: [],
          },
        ],
      }),
      deps({ carried: [] }),
    );
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    const item = r.completion?.sections.find((x) => x.id === "3-1");
    expect(item?.evidence_ids).toEqual(["a2"]);
  });
});

describe("활동 0건 회차", () => {
  const zero = () =>
    makeContext({
      activities: [],
      evidenceIds: [],
      expectedSectionIds: expectedSectionIds({ omit: [] }),
    });

  it("모델 없이 1단계부터 8단계까지 끝까지 통과한다", async () => {
    const ctx = zero();
    const d = deps({ carried: [] });
    let stored = emptyStored();
    for (const step of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
      const r = await runStep(step, ctx, stored, d);
      if (!r.ok) throw new Error(`${step}: ${JSON.stringify(r.issues)}`);
      stored = { ...stored, ...r.patch } as StoredOutputs;
      if (step === 8) {
        expect(r.completion?.planRows).toEqual([]);
        expect(r.completion?.sections).toHaveLength(37);
        const verdict = validateStep(
          8,
          { sections: r.completion?.sections },
          {
            expectedSectionIds: ctx.expectedSectionIds,
            knownEvidenceIds: ctx.evidenceIds,
          },
        );
        expect(verdict.issues).toEqual([]);
      }
    }
    expect(d.callModel).not.toHaveBeenCalled();
    expect(stored.narrative_theme).toBeNull();
    expect(stored.grade_subthemes).toBeNull();
    expect(stored.stage).toBeNull();
    expect(stored.planDraft).toEqual([]);
    expect((stored.signals as { match: unknown }).match).toEqual({
      aligned: [],
      conflicting: [],
    });
  });

  it("3, 4, 6, 7단계 섹션은 전부 no_data 와 같은 사유를 쓴다", async () => {
    const ctx = zero();
    let stored = emptyStored({ signals: { byActivity: [] } });
    const ids: Record<number, string[]> = {};
    for (const step of [3, 4, 5, 6, 7] as const) {
      const r = await runStep(step, ctx, stored, deps());
      if (!r.ok) throw new Error(`${step}: ${JSON.stringify(r.issues)}`);
      stored = { ...stored, ...r.patch } as StoredOutputs;
      ids[step] = (r.output.sections ?? []).map((x) => x.id);
      for (const x of r.output.sections ?? []) {
        expect(x).toMatchObject({
          status: "no_data",
          evidence_ids: [],
          no_data_reason: "분석할 활동이 없어요",
        });
      }
    }
    expect(ids[3]).toEqual(["1-8"]);
    expect(ids[4]).toEqual(["1-2", "1-6", "1-7", "1-11"]);
    expect(ids[6]).toHaveLength(10);
    expect(ids[7]).toHaveLength(9);
  });
});

async function consistencyOf(ctx: ReportContext) {
  const { computeStep5 } = await import("./compute.js");
  return computeStep5(ctx, []).consistency;
}
async function axesOf(ctx: ReportContext) {
  const { computeStep6 } = await import("./compute.js");
  return computeStep6(ctx, []);
}

describe("활동 id 별칭 응답", () => {
  const U = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
  ];
  const uuidPattern =
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
  const activities = U.map((id, i) => activity(id, { text: `본문 ${i + 1}` }));
  const ctx = makeContext({ activities, evidenceIds: U });
  const sigs = U.map((id, i) => ({
    activityId: id,
    axes: [i === 2 ? "C" : "A"],
    linkage: [],
    keywords: [],
    method: null,
    summary: "s",
  }));
  const withSigs = (over: Partial<StoredOutputs> = {}) =>
    emptyStored({ signals: { byActivity: sigs }, ...over });
  const bodyOf = (format: string) =>
    format === "prose"
      ? "본문"
      : format === "list"
        ? []
        : format === "table"
          ? { rows: [] }
          : {};
  const sectionsFor = async (
    step: 6 | 7,
    over: (id: string) => Record<string, unknown> = () => ({}),
  ) => {
    const { SECTION_REGISTRY } = await import("../sections.js");
    return stepSectionIds(step, ctx).map((id) => {
      const def = SECTION_REGISTRY.find((d) => d.id === id);
      return {
        id,
        status: "ok",
        evidence_ids: ["a1"],
        body: bodyOf(def?.format ?? "prose"),
        ...over(id),
      };
    });
  };
  const capture = (text: string) => {
    const seen: string[] = [];
    const callModel = vi.fn(async (bundle: { user: string }) => {
      seen.push(bundle.user);
      return reply(text);
    });
    return { seen, callModel };
  };

  it("1단계는 별칭으로 답한 신호를 활동 id 로 저장한다", async () => {
    const { seen, callModel } = capture(
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
    );
    const r = await runStep(1, ctx, emptyStored(), deps({ callModel }));
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(seen[0]).not.toMatch(uuidPattern);
    const by = (
      r.patch.signals as {
        byActivity: { activityId: string; axes: string[] }[];
      }
    ).byActivity;
    expect(by.map((s) => s.activityId)).toEqual(U);
    expect(by[1]?.axes).toEqual(["B"]);
  });

  it("3단계는 별칭 근거를 활동 id 로 저장한다", async () => {
    const { seen, callModel } = capture(
      narrativeJson([
        sec8({
          evidence_ids: ["a2"],
          body: [{ text: "a1 반복", evidence_ids: ["a1"] }],
        }),
      ]),
    );
    const r = await runStep(3, ctx, withSigs(), deps({ callModel }));
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(seen[0]).not.toMatch(uuidPattern);
    const s = (r.patch.sections as SectionItem[]).find((x) => x.id === "1-8");
    expect(s?.evidence_ids).toEqual([U[1]]);
  });

  it("4단계는 별칭 match 를 활동 id 로 저장한다", async () => {
    const sections = stepSectionIds(4, ctx).map((id) => ({
      id,
      status: "no_data",
      evidence_ids: [],
    }));
    const { seen, callModel } = capture(
      JSON.stringify({
        match: {
          aligned: [{ text: "일치", evidenceIds: ["a3"] }],
          conflicting: [],
        },
        sections,
      }),
    );
    const r = await runStep(4, ctx, withSigs(), deps({ callModel }));
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(seen[0]).not.toMatch(uuidPattern);
    expect(r.output.match?.aligned[0]?.evidenceIds).toEqual([U[2]]);
  });

  it("5단계는 별칭 근거로 통과하고 연계 활동은 활동 id 다", async () => {
    const { computeStep5 } = await import("./compute.js");
    const { expectedFormula } = computeStep5(ctx, sigs as never);
    const { seen, callModel } = capture(
      JSON.stringify({
        formula: expectedFormula,
        sections: [
          { id: "1-9", status: "ok", body: { rows: [] }, evidence_ids: ["a1"] },
          {
            id: "1-10",
            status: "ok",
            evidence_ids: ["a1", "a2"],
            body: { linked: ["a1"] },
          },
        ],
      }),
    );
    const r = await runStep(5, ctx, withSigs(), deps({ callModel }));
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(seen[0]).not.toMatch(uuidPattern);
    const item = (r.patch.sections as SectionItem[]).find(
      (x) => x.id === "1-10",
    );
    expect(item?.evidence_ids).toEqual([U[0], U[1]]);
  });

  it("6단계는 별칭 근거로 통과한다", async () => {
    const { computeStep6 } = await import("./compute.js");
    const axes = computeStep6(ctx, sigs as never);
    const label = (a: string) => axes.find((x) => x.axis === a)?.verdictLabel;
    const axisRows = (id: string) => {
      const a = { "2-1": "A", "2-2": "B", "2-3": "C", "2-4": "D", "2-5": "E" }[
        id
      ];
      return a ? { body: { rows: [{ label: "판정", value: label(a) }] } } : {};
    };
    const sections = await sectionsFor(6, (id) => ({
      evidence_ids: id === "2-3" ? ["a3"] : ["a1"],
      ...axisRows(id),
    }));
    const { seen, callModel } = capture(JSON.stringify({ sections }));
    const r = await runStep(6, ctx, withSigs(), deps({ callModel }));
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(seen[0]).not.toMatch(uuidPattern);
    const out = r.output.sections ?? [];
    expect(out.find((x) => x.id === "2-1")?.evidence_ids.sort()).toEqual(
      axes.find((x) => x.axis === "A")?.activityIds.sort(),
    );
  });

  it("7단계는 설문 대조의 활동 id 를 별칭으로 싣고 별칭 근거로 통과한다", async () => {
    const { computeStep5, computeStep6 } = await import("./compute.js");
    const { consistency } = computeStep5(ctx, sigs as never);
    const axes = computeStep6(ctx, sigs as never);
    const stored = withSigs({
      signals: {
        byActivity: sigs,
        match: {
          aligned: [{ text: "일치", evidenceIds: [U[1]] }],
          conflicting: [],
        },
      },
      narrative_theme: "열과 에너지 흐름",
      grade_subthemes: [{ grade: "고1", stage: "seed", text: "기초" }],
      consistency,
      axis_scores: axes,
    });
    const sections = await sectionsFor(7);
    const plan = [
      {
        program: "deep",
        title: "탐구 방향 정하기",
        description: "방향과 조건만 정한다",
        priority: "required",
        axis: "C",
        category: null,
        period: "semester",
        periodLabel: "2학기",
        deadline: null,
      },
    ];
    const { seen, callModel } = capture(
      JSON.stringify({ sections, planDraft: plan }),
    );
    const r = await runStep(7, ctx, stored, deps({ callModel }));
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(seen[0]).not.toMatch(uuidPattern);
    expect(seen[0]).toMatch(/"evidenceIds": \[\s*"a2"\s*\]/);
    expect(r.output.sections?.[0]?.evidence_ids).toEqual([U[0]]);
  });

  it("모르는 별칭만 쓰면 3단계는 unknown_evidence 로 두 번 실패한다", async () => {
    const { callModel } = capture(
      narrativeJson([
        sec8({
          evidence_ids: ["a99"],
          body: [{ text: "x", evidence_ids: ["a99"] }],
        }),
      ]),
    );
    const r = await runStep(3, ctx, withSigs(), deps({ callModel }));
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.issues.map((i) => i.code)).toContain("unknown_evidence");
  });
});
