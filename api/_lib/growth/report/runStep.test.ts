import { describe, expect, it, vi } from "vitest";
import { NO_DATA_TEXT, type SectionItem } from "../sections.js";
import {
  mergeSections,
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
    const callModel = vi.fn(async () => signalJson({ linkage: [] }));
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

describe("mergeSections", () => {
  const sec = (id: string, text: string) =>
    ({ id, body: text }) as unknown as SectionItem;
  it("같은 id 는 incoming 이 덮고 다른 단계 섹션은 남기며 레지스트리 순이다", () => {
    const merged = mergeSections(
      [sec("1-8", "old"), sec("1-2", "keep")],
      [sec("1-8", "new"), sec("1-1", "x")],
    );
    expect(merged.map((s) => s.id)).toEqual(["1-1", "1-2", "1-8"]);
    expect(merged.find((s) => s.id === "1-8")?.body).toBe("new");
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
    const callModel = vi.fn(async () => narrativeJson());
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
      .mockResolvedValueOnce("not json")
      .mockResolvedValueOnce(narrativeJson());
    const r = await runStep(3, makeContext(), withSignals, deps({ callModel }));
    expect(r).toMatchObject({ ok: true, extraAttempts: 1 });
    expect(callModel).toHaveBeenCalledTimes(2);
    expect(callModel.mock.calls[0]?.[0].user).not.toContain("이전 응답의 문제");
    expect(callModel.mock.calls[1]?.[0].user).toContain("이전 응답의 문제");
  });

  it("두 번 실패하면 validation 과 extraAttempts 1", async () => {
    const callModel = vi.fn(async () => "not json");
    const r = await runStep(3, makeContext(), withSignals, deps({ callModel }));
    expect(callModel).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({
      ok: false,
      failure: "validation",
      extraAttempts: 1,
    });
    if (!r.ok) expect(r.issues[0]?.code).toBe("invalid_json");
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
      .mockResolvedValueOnce("not json")
      .mockRejectedValueOnce(new Error("boom"));
    const r = await runStep(3, makeContext(), withSignals, deps({ callModel }));
    expect(r).toMatchObject({
      ok: false,
      failure: "upstream",
      extraAttempts: 1,
    });
  });

  it("예산 안에 끝나지 않으면 timeout", async () => {
    const callModel = vi.fn(() => new Promise<string>(() => undefined));
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
      failure: "validation",
      extraAttempts: 0,
    });
    if (!r.ok) expect(r.issues.length).toBeGreaterThan(0);
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
