import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimStep: vi.fn(),
  finishStep: vi.fn(),
  terminateSession: vi.fn(),
  reverseCredit: vi.fn(),
  loadSessionActivities: vi.fn(),
  updateSession: vi.fn(),
  updateSessionActivityAnalysis: vi.fn(),
}));
vi.mock("../db.js", () => ({
  claimStep: mocks.claimStep,
  finishStep: mocks.finishStep,
  terminateSession: mocks.terminateSession,
  reverseCredit: mocks.reverseCredit,
  loadSessionActivities: mocks.loadSessionActivities,
  updateSession: mocks.updateSession,
  updateSessionActivityAnalysis: mocks.updateSessionActivityAnalysis,
}));

import type { SessionRow } from "../rows.js";
import {
  type ActivityRecordLike,
  ANALYSIS_FIELDS,
  type Analysis,
} from "../types.js";
import type { SessionActivityWithRecord } from "../view.js";
import {
  buildAnalyzeSpec,
  resolveAnalysisConflict,
  runAnalyze,
  saveAnalysis,
  validateAnalyzeBody,
} from "./analyze.js";

const db = {} as never;
const callStructured = vi.fn();
const deps = () => ({
  callStructured: callStructured as never,
  now: () => new Date().toISOString(),
  startedAt: Date.now(),
});

const record = (id: string, p: Partial<ActivityRecordLike> = {}) =>
  ({
    id,
    sourceProgram: "performance",
    status: "confirmed",
    gradeLabel: "고2",
    semester: 1,
    subjectGroup: "과학",
    subject: "물리",
    topic: "미세먼지 측정",
    concept: "농도 단위",
    method: "센서로 측정",
    result: "평균 35 마이크로그램",
    limitation: "표본이 적음",
    numbers: ["35"],
    sources: [],
    createdAt: "2026-01-01T00:00:00Z",
    ...p,
  }) as ActivityRecordLike;

const session = (p: Partial<SessionRow> = {}) =>
  ({
    id: "s1",
    area: "subject",
    subject: "물리",
    activity_name: null,
    current_step: 2,
    ...p,
  }) as SessionRow;

const emptyValues = () =>
  Object.fromEntries(ANALYSIS_FIELDS.map((f) => [f, ""])) as Record<
    (typeof ANALYSIS_FIELDS)[number],
    string
  >;

const modelJson = (values: Partial<Record<string, string>>) =>
  JSON.stringify({ values: { ...emptyValues(), ...values } });

const storedAnalysis = (): Analysis => ({
  values: { ...emptyValues(), result: "평균 35 마이크로그램" },
  sources: Object.fromEntries(
    ANALYSIS_FIELDS.map((f) => [f, f === "result" ? "record" : "empty"]),
  ) as Analysis["sources"],
  conflicts: [],
});

const activity = (
  role: "core" | "support",
  rec: ActivityRecordLike,
  analysis: unknown = null,
  source: "model" | "student" | null = null,
) =>
  ({
    activity_record_id: rec.id,
    role,
    fit_score: null,
    fit_reasons: null,
    analysis,
    analysis_source: source,
    record: rec,
  }) satisfies SessionActivityWithRecord;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.claimStep.mockResolvedValue({ kind: "claimed", attempts: 1 });
  mocks.finishStep.mockResolvedValue(true);
});

describe("buildAnalyzeSpec", () => {
  const core = record("c1");
  const spec = buildAnalyzeSpec(
    { record: core, analysisSource: null },
    [],
    session(),
  );

  it("프롬프트에 기록 제목이 들어간다", () => {
    expect(spec.build([]).user).toContain("미세먼지 측정");
  });

  it("검증을 통과하면 3단계로 올리는 patch 와 분석 결과를 낸다", () => {
    const v = spec.validate(
      JSON.parse(modelJson({ result: "평균 35 마이크로그램" })),
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.patch).toEqual({
      current_step: 3,
      analyses: [
        {
          activity_record_id: "c1",
          analysis: v.result.analysis,
          analysis_source: "model",
        },
      ],
    });
    expect(v.result.analysis.sources.result).toBe("record");
    expect(v.result.analysisSource).toBe("model");
  });

  it("보조 활동과 수치가 다르면 충돌을 분석에 싣는다", () => {
    const s = buildAnalyzeSpec(
      { record: core, analysisSource: null },
      [
        record("s1", {
          topic: "미세먼지 측정 심화",
          result: "평균 80 마이크로그램",
        }),
      ],
      session(),
    );
    const v = s.validate(
      JSON.parse(modelJson({ result: "평균 35 마이크로그램" })),
    );
    expect(v.ok && v.result.analysis.conflicts.length).toBeGreaterThan(0);
  });

  it("값이 기록과 무관하면 실패 사유를 낸다", () => {
    const v = spec.validate(
      JSON.parse(modelJson({ result: "바나나 요리 대회 우승" })),
    );
    expect(v.ok).toBe(false);
  });
});

describe("runAnalyze", () => {
  it("활동 선택 전(단계 1)이면 order 다", async () => {
    const out = await runAnalyze(
      db,
      "u1",
      session({ current_step: 1 }),
      deps(),
    );
    expect(out).toEqual({ kind: "order", currentStep: 1 });
    expect(mocks.claimStep).not.toHaveBeenCalled();
  });

  it("모델로 분석하고 결과와 단계를 돌려준다", async () => {
    mocks.loadSessionActivities.mockResolvedValue([
      activity("core", record("c1")),
    ]);
    callStructured.mockResolvedValue({
      text: modelJson({ result: "평균 35 마이크로그램" }),
      finishReason: "STOP",
    });
    const out = await runAnalyze(db, "u1", session(), deps());
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.result.analysisSource).toBe("model");
    expect(out.result.currentStep).toBe(3);
    expect(mocks.finishStep).toHaveBeenCalledWith(
      db,
      "u1",
      "s1",
      "analyze",
      expect.objectContaining({ ok: true }),
    );
  });

  it("이미 3단계 이상인 세션을 재분석해도 단계는 내려가지 않는다", async () => {
    mocks.loadSessionActivities.mockResolvedValue([
      activity("core", record("c1")),
    ]);
    callStructured.mockResolvedValue({
      text: modelJson({ result: "평균 35 마이크로그램" }),
      finishReason: "STOP",
    });
    const out = await runAnalyze(
      db,
      "u1",
      session({ current_step: 5 }),
      deps(),
    );
    expect(out.kind === "ok" && out.result.currentStep).toBe(5);
  });

  it("학생이 직접 입력한 핵심 활동은 모델을 부르지 않고 3단계로 올린다", async () => {
    const a = storedAnalysis();
    mocks.loadSessionActivities.mockResolvedValue([
      activity("core", record("c1", { sourceProgram: "manual" }), a, "student"),
    ]);
    const out = await runAnalyze(
      db,
      "u1",
      session({ current_step: 2 }),
      deps(),
    );
    expect(callStructured).not.toHaveBeenCalled();
    expect(mocks.claimStep).not.toHaveBeenCalled();
    expect(mocks.updateSession).toHaveBeenCalledWith(db, "u1", "s1", {
      current_step: 3,
    });
    expect(out).toMatchObject({
      kind: "ok",
      attempts: 0,
      result: { analysis: a, analysisSource: "student", currentStep: 3 },
    });
  });

  it("직접 입력이고 이미 3단계면 세션을 다시 쓰지 않는다", async () => {
    mocks.loadSessionActivities.mockResolvedValue([
      activity("core", record("c1"), storedAnalysis(), "student"),
    ]);
    await runAnalyze(db, "u1", session({ current_step: 4 }), deps());
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });
});

describe("saveAnalysis", () => {
  it("분석 전(단계 2)이면 order 다", async () => {
    const out = await saveAnalysis(db, "u1", session({ current_step: 2 }), {});
    expect(out).toEqual({ kind: "order", currentStep: 2 });
  });

  it("고친 항목만 다시 분류해 저장한다", async () => {
    mocks.loadSessionActivities.mockResolvedValue([
      activity("core", record("c1"), storedAnalysis(), "model"),
    ]);
    const out = await saveAnalysis(db, "u1", session({ current_step: 3 }), {
      method: "엉뚱한 새 글",
    });
    expect(out.kind).toBe("done");
    if (out.kind !== "done") return;
    expect(out.result.analysis.values.method).toBe("엉뚱한 새 글");
    expect(out.result.analysis.sources.method).toBe("student");
    expect(mocks.updateSessionActivityAnalysis).toHaveBeenCalledWith(
      db,
      "u1",
      "s1",
      "c1",
      out.result.analysis,
    );
  });

  it("저장하면 세션의 마지막 활동 시각을 갱신한다", async () => {
    mocks.loadSessionActivities.mockResolvedValue([
      activity("core", record("c1"), storedAnalysis(), "model"),
    ]);
    await saveAnalysis(db, "u1", session({ current_step: 3 }), {
      method: "새 글",
    });
    expect(mocks.updateSession).toHaveBeenCalledWith(db, "u1", "s1", {
      last_activity_at: expect.any(String),
    });
  });
});

describe("resolveAnalysisConflict", () => {
  const conflicted = (): Analysis => ({
    ...storedAnalysis(),
    conflicts: [
      {
        kind: "numbers",
        a: { activityId: "c1", text: "35" },
        b: { activityId: "s1", text: "80" },
        resolved: null,
      },
    ],
  });

  it("고른 쪽 값을 conflicts 에만 기록하고 values 는 건드리지 않는다", async () => {
    mocks.loadSessionActivities.mockResolvedValue([
      activity("core", record("c1"), conflicted(), "model"),
    ]);
    const out = await resolveAnalysisConflict(
      db,
      "u1",
      session({ current_step: 3 }),
      0,
      "b",
    );
    expect(out.kind).toBe("done");
    if (out.kind !== "done") return;
    expect(out.result.analysis.conflicts[0]?.resolved).toBe("80");
    expect(out.result.analysis.values).toEqual(conflicted().values);
    expect(mocks.updateSessionActivityAnalysis).toHaveBeenCalledOnce();
    expect(mocks.updateSession).toHaveBeenCalledWith(db, "u1", "s1", {
      last_activity_at: expect.any(String),
    });
  });

  it("없는 index 는 400 CONFLICT_INDEX_INVALID 다", async () => {
    mocks.loadSessionActivities.mockResolvedValue([
      activity("core", record("c1"), conflicted(), "model"),
    ]);
    const out = await resolveAnalysisConflict(
      db,
      "u1",
      session({ current_step: 3 }),
      5,
      "a",
    );
    expect(out).toMatchObject({
      kind: "rejected",
      status: 400,
      code: "CONFLICT_INDEX_INVALID",
    });
    expect(mocks.updateSessionActivityAnalysis).not.toHaveBeenCalled();
  });

  it("분석 전이면 order 다", async () => {
    const out = await resolveAnalysisConflict(
      db,
      "u1",
      session({ current_step: 2 }),
      0,
      "a",
    );
    expect(out.kind).toBe("order");
  });
});

describe("validateAnalyzeBody", () => {
  const sid = "3f2b8c1e-9d4a-4b6e-8a1c-0e5d7f9a2b3c";
  it("run 은 sessionId 만 있으면 된다", () => {
    expect(validateAnalyzeBody({ sessionId: sid, action: "run" })).toEqual({
      ok: true,
      body: { sessionId: sid, action: "run" },
    });
  });

  it("sessionId 형식이 틀리거나 action 을 모르면 거절한다", () => {
    expect(validateAnalyzeBody({ sessionId: "x", action: "run" }).ok).toBe(
      false,
    );
    expect(validateAnalyzeBody({ sessionId: sid, action: "zzz" }).ok).toBe(
      false,
    );
    expect(validateAnalyzeBody(null).ok).toBe(false);
  });

  it("save 는 알려진 항목의 문자열 edits 만 받는다", () => {
    expect(
      validateAnalyzeBody({
        sessionId: sid,
        action: "save",
        edits: { method: "a" },
      }).ok,
    ).toBe(true);
    expect(
      validateAnalyzeBody({
        sessionId: sid,
        action: "save",
        edits: { nope: "a" },
      }).ok,
    ).toBe(false);
    expect(
      validateAnalyzeBody({
        sessionId: sid,
        action: "save",
        edits: { method: 1 },
      }).ok,
    ).toBe(false);
    expect(validateAnalyzeBody({ sessionId: sid, action: "save" }).ok).toBe(
      false,
    );
  });

  it("resolve-conflict 는 0 이상 정수 index 와 a 또는 b 를 받는다", () => {
    expect(
      validateAnalyzeBody({
        sessionId: sid,
        action: "resolve-conflict",
        index: 0,
        choice: "a",
      }).ok,
    ).toBe(true);
    expect(
      validateAnalyzeBody({
        sessionId: sid,
        action: "resolve-conflict",
        index: -1,
        choice: "a",
      }).ok,
    ).toBe(false);
    expect(
      validateAnalyzeBody({
        sessionId: sid,
        action: "resolve-conflict",
        index: 0,
        choice: "c",
      }).ok,
    ).toBe(false);
  });
});
