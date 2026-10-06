import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimStep: vi.fn(),
  finishStep: vi.fn(),
  terminateSession: vi.fn(),
  reverseCredit: vi.fn(),
  consumeCredit: vi.fn(),
  loadSessionActivities: vi.fn(),
  loadReports: vi.fn(),
  insertReport: vi.fn(),
  hasSelfevalAccess: vi.fn(),
  readSelfevalQuota: vi.fn(),
}));
vi.mock("../db.js", () => ({
  claimStep: mocks.claimStep,
  finishStep: mocks.finishStep,
  terminateSession: mocks.terminateSession,
  reverseCredit: mocks.reverseCredit,
  consumeCredit: mocks.consumeCredit,
  loadSessionActivities: mocks.loadSessionActivities,
  loadReports: mocks.loadReports,
  insertReport: mocks.insertReport,
}));
vi.mock("../access.js", () => ({
  hasSelfevalAccess: mocks.hasSelfevalAccess,
  readSelfevalQuota: mocks.readSelfevalQuota,
}));

import type { ReportRow, SessionRow } from "../rows.js";
import {
  type ActivityRecordLike,
  ANALYSIS_FIELDS,
  type Analysis,
  type GenerationSections,
} from "../types.js";
import type { SessionActivityWithRecord } from "../view.js";
import {
  buildWriteInput,
  buildWriteSpec,
  confirmFeelingSentence,
  runWrite,
  saveEdit,
  validateWriteBody,
} from "./write.js";

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
    sources: ["환경부 자료"],
    createdAt: "2026-01-01T00:00:00Z",
    ...p,
  }) as ActivityRecordLike;

const session = (p: Partial<SessionRow> = {}) =>
  ({
    id: "s1",
    area: "subject",
    subject: "물리",
    activity_name: null,
    school_prompt: "탐구 과정에서 배운 점을 서술하시오",
    teacher_note: null,
    target_chars: null,
    target_chars_mode: "with_space",
    career: { career: "의사", department: "의학과", universities: ["가나대"] },
    growth_applied: false,
    growth_snapshot: null,
    current_step: 3,
    regenerate_count: 0,
    ledger_id: null,
    ledger_reversed_at: null,
    ...p,
  }) as SessionRow;

const analysis = (p: Partial<Analysis> = {}): Analysis => ({
  values: Object.fromEntries(
    ANALYSIS_FIELDS.map((f) => [f, f === "result" ? "평균 35" : ""]),
  ) as Analysis["values"],
  sources: Object.fromEntries(
    ANALYSIS_FIELDS.map((f) => [f, f === "result" ? "record" : "empty"]),
  ) as Analysis["sources"],
  conflicts: [],
  ...p,
});

const core = (a: Analysis = analysis()) => ({
  record: record("c1"),
  analysis: a,
});

const sentence = (text: string) => ({
  text,
  evidence: { activityId: "c1", field: "result" },
  feeling: false,
});
const modelJson = () =>
  JSON.stringify({
    paragraphs: [
      {
        role: "process",
        sentences: [sentence("센서로 미세먼지를 측정하였다.")],
      },
      {
        role: "judgment",
        sentences: [sentence("평균 35 마이크로그램이었다.")],
      },
      { role: "wrap", sentences: [sentence("표본을 늘려 보겠다.")] },
    ],
  });

const reportRow = (p: Partial<ReportRow>): ReportRow => ({
  id: "r1",
  session_id: "s1",
  report_type: "generation",
  revision: 1,
  sections: { paragraphs: [] },
  char_count: { withSpace: 10, withoutSpace: 8 },
  score: null,
  mandatory_fixes: null,
  created_at: "2026-10-06T00:00:00Z",
  ...p,
});

const activities = (a: Analysis = analysis()): SessionActivityWithRecord[] => [
  {
    activity_record_id: "c1",
    role: "core",
    fit_score: null,
    fit_reasons: null,
    analysis: a,
    analysis_source: "model",
    record: record("c1"),
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.claimStep.mockResolvedValue({ kind: "claimed", attempts: 1 });
  mocks.finishStep.mockResolvedValue(true);
  mocks.loadSessionActivities.mockResolvedValue(activities());
  mocks.hasSelfevalAccess.mockResolvedValue(true);
  mocks.readSelfevalQuota.mockResolvedValue({ quotaRemaining: null });
  mocks.consumeCredit.mockResolvedValue({ status: "charged", charged: true });
  callStructured.mockResolvedValue({ text: modelJson(), finishReason: "STOP" });
});

describe("buildWriteInput", () => {
  it("미해결 충돌이 있으면 CONFLICTS_UNRESOLVED 다", () => {
    const a = analysis({
      conflicts: [
        {
          kind: "numbers",
          a: { activityId: "c1", text: "35" },
          b: { activityId: "s2", text: "80" },
          resolved: null,
        },
      ],
    });
    expect(buildWriteInput(session(), core(a), [])).toEqual({
      ok: false,
      code: "CONFLICTS_UNRESOLVED",
    });
  });

  it("해결된 충돌은 막지 않는다", () => {
    const a = analysis({
      conflicts: [
        {
          kind: "numbers",
          a: { activityId: "c1", text: "35" },
          b: { activityId: "s2", text: "80" },
          resolved: "35",
        },
      ],
    });
    expect(buildWriteInput(session(), core(a), []).ok).toBe(true);
  });

  it("세션과 활동을 프롬프트 입력으로 옮긴다", () => {
    const r = buildWriteInput(session(), core(), [
      record("s2", {
        topic: "황사 비교",
        method: "기상청 자료 분석",
        result: "황사철 증가",
      }),
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.core).toMatchObject({
      activityName: "미세먼지 측정",
      activityId: "c1",
    });
    expect(r.input.supports).toEqual([
      {
        activityId: "s2",
        activityName: "황사 비교",
        summary: expect.stringContaining("방법: 기상청 자료 분석"),
      },
    ]);
    expect(r.input.promptKeywords.length).toBeGreaterThan(0);
    expect(r.input.career).toEqual({ career: "의사", department: "의학과" });
    expect(r.input.growth).toBeNull();
    expect(r.input.mode).toBe("with_space");
  });

  it("성장설계가 켜져 있고 주제가 있으면 강조점을 싣는다", () => {
    const snapshot = {
      narrativeTheme: "환경 데이터 탐구자",
      stage: "flower",
      weakAxes: [
        {
          axis: "a",
          name: "축",
          count: 1,
          required: 3,
          guideline: "수치를 더 넣기",
        },
      ],
    } as never;
    const r = buildWriteInput(
      session({ growth_applied: true, growth_snapshot: snapshot }),
      core(),
      [],
    );
    expect(r.ok && r.input.growth).toEqual({
      theme: "환경 데이터 탐구자",
      stageLabel: "꽃",
      weakAxisGuidelines: ["수치를 더 넣기"],
    });
  });
});

describe("buildWriteSpec", () => {
  it("검증을 통과하면 4단계로 올리고 생성 리포트를 patch 에 싣는다", () => {
    const built = buildWriteSpec(session(), core(), [], false);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const v = built.spec.validate(JSON.parse(modelJson()));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.patch).toMatchObject({
      current_step: 4,
      report: {
        report_type: "generation",
        score: null,
        mandatory_fixes: null,
        sections: v.result.sections,
        char_count: v.result.charCount,
      },
    });
    expect(v.patch.regenerate_increment).toBeUndefined();
  });

  it("재생성이면 patch 에 regenerate_increment 를 싣는다", () => {
    const built = buildWriteSpec(session(), core(), [], true);
    expect(built.ok && built.spec.patchOnSuccess).toEqual({
      regenerate_increment: true,
    });
  });

  it("보조 활동이 있으면 4문단을 기대한다", () => {
    const built = buildWriteSpec(session(), core(), [record("s2")], false);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // 3문단 응답은 4문단 기대에 실패한다
    expect(built.spec.validate(JSON.parse(modelJson())).ok).toBe(false);
  });
});

describe("runWrite", () => {
  it("분석 전(단계 2)이면 order 다", async () => {
    const out = await runWrite(
      db,
      "u1",
      session({ current_step: 2 }),
      [],
      deps(),
    );
    expect(out).toEqual({ kind: "order", currentStep: 2 });
  });

  it("충돌이 남아 있으면 모델을 부르지 않고 409 로 거절한다", async () => {
    mocks.loadSessionActivities.mockResolvedValue(
      activities(
        analysis({
          conflicts: [
            {
              kind: "numbers",
              a: { activityId: "c1", text: "35" },
              b: { activityId: "s2", text: "80" },
              resolved: null,
            },
          ],
        }),
      ),
    );
    const out = await runWrite(db, "u1", session(), [], deps());
    expect(out).toMatchObject({
      kind: "rejected",
      status: 409,
      code: "CONFLICTS_UNRESOLVED",
    });
    expect(mocks.claimStep).not.toHaveBeenCalled();
  });

  it("재생성 상한이면 선점 없이 regenerate_exhausted 다", async () => {
    const out = await runWrite(
      db,
      "u1",
      session({ regenerate_count: 3 }),
      [reportRow({})],
      deps(),
    );
    expect(out).toEqual({ kind: "regenerate_exhausted" });
    expect(mocks.claimStep).not.toHaveBeenCalled();
  });

  it("첫 생성 때 regenerate_count 가 상한이어도 막지 않는다", async () => {
    mocks.loadReports.mockResolvedValue([reportRow({})]);
    const out = await runWrite(
      db,
      "u1",
      session({ regenerate_count: 3 }),
      [],
      deps(),
    );
    expect(out.kind).toBe("ok");
  });

  it("차감이 필요한데 이용권이 없으면 선점 전에 no_entitlement 다", async () => {
    mocks.hasSelfevalAccess.mockResolvedValue(false);
    const out = await runWrite(db, "u1", session(), [], deps());
    expect(out).toEqual({ kind: "no_entitlement" });
    expect(mocks.claimStep).not.toHaveBeenCalled();
  });

  it("잔여가 0 이면 quota_exhausted 다", async () => {
    mocks.readSelfevalQuota.mockResolvedValue({ quotaRemaining: 0 });
    const out = await runWrite(db, "u1", session(), [], deps());
    expect(out).toEqual({ kind: "quota_exhausted" });
  });

  it("첫 생성 성공 뒤 차감하고 저장된 리포트와 남은 재생성 횟수를 돌려준다", async () => {
    mocks.loadReports.mockResolvedValue([reportRow({ id: "r9", revision: 1 })]);
    const out = await runWrite(db, "u1", session(), [], deps());
    expect(out).toMatchObject({
      kind: "ok",
      attempts: 1,
      softIssues: [],
      result: {
        report: { id: "r9", revision: 1 },
        charged: true,
        regenerationsLeft: 3,
        currentStep: 4,
      },
    });
    expect(mocks.consumeCredit).toHaveBeenCalledWith(
      db,
      "u1",
      "s1",
      "selfeval:write-success",
    );
    const patch = mocks.finishStep.mock.calls[0]?.[4].patch;
    expect(patch.regenerate_increment).toBeUndefined();
  });

  it("재생성이면 횟수를 올리고 이미 차감된 세션은 다시 차감하지 않는다", async () => {
    mocks.loadReports.mockResolvedValue([
      reportRow({ id: "r1" }),
      reportRow({ id: "r2", revision: 2 }),
    ]);
    const out = await runWrite(
      db,
      "u1",
      session({ regenerate_count: 1, ledger_id: "l1", current_step: 5 }),
      [reportRow({})],
      deps(),
    );
    expect(out).toMatchObject({
      kind: "ok",
      result: {
        report: { id: "r2", revision: 2 },
        charged: true,
        regenerationsLeft: 1,
        currentStep: 5,
      },
    });
    expect(mocks.consumeCredit).not.toHaveBeenCalled();
    expect(mocks.hasSelfevalAccess).not.toHaveBeenCalled();
    expect(mocks.finishStep.mock.calls[0]?.[4].patch.regenerate_increment).toBe(
      true,
    );
  });

  it("차감이 거절돼도 진행은 막지 않고 charged false 로 알린다", async () => {
    mocks.consumeCredit.mockResolvedValue({
      status: "quota_exhausted",
      charged: false,
    });
    mocks.loadReports.mockResolvedValue([reportRow({})]);
    const out = await runWrite(db, "u1", session(), [], deps());
    expect(out.kind === "ok" && out.result.charged).toBe(false);
  });

  it("모델 실패면 차감하지 않는다", async () => {
    callStructured.mockResolvedValue({ text: "{}", finishReason: "STOP" });
    const out = await runWrite(db, "u1", session(), [], deps());
    expect(out).toMatchObject({ kind: "failure", failure: "validation" });
    expect(mocks.consumeCredit).not.toHaveBeenCalled();
  });
});

const base: GenerationSections = {
  paragraphs: [
    {
      role: "process",
      sentences: [
        {
          id: "p1-s1",
          text: "첫 문장이다.",
          evidence: { activityId: "c1", field: "result" },
          feeling: true,
          confirmed: false,
        },
      ],
    },
  ],
};

describe("saveEdit", () => {
  it("생성 전(단계 3)이면 order 다", async () => {
    const out = await saveEdit(db, "u1", session({ current_step: 3 }), base, [
      "a",
    ]);
    expect(out.kind).toBe("order");
  });

  it("문단 수가 다르면 400 PARAGRAPH_COUNT 다", async () => {
    const out = await saveEdit(db, "u1", session({ current_step: 4 }), base, [
      "a",
      "b",
    ]);
    expect(out).toMatchObject({
      kind: "rejected",
      status: 400,
      code: "PARAGRAPH_COUNT",
    });
    expect(mocks.insertReport).not.toHaveBeenCalled();
  });

  it("고친 본문을 edited 리포트로 쌓는다", async () => {
    mocks.insertReport.mockResolvedValue(
      reportRow({ id: "e1", report_type: "edited", revision: 2 }),
    );
    const out = await saveEdit(db, "u1", session({ current_step: 4 }), base, [
      "새 문장이다.",
    ]);
    expect(out).toMatchObject({
      kind: "done",
      result: { report: { id: "e1", revision: 2 } },
    });
    const row = mocks.insertReport.mock.calls[0]?.[3];
    expect(row).toMatchObject({
      report_type: "edited",
      score: null,
      mandatory_fixes: null,
      char_count: { withSpace: 7, withoutSpace: 6 },
    });
    expect(row.sections.paragraphs[0].sentences[0].text).toBe("새 문장이다.");
  });
});

describe("confirmFeelingSentence", () => {
  it("느낌 문장을 확인 처리한 본문을 edited 로 쌓는다", async () => {
    mocks.insertReport.mockResolvedValue(
      reportRow({ id: "e2", report_type: "edited", revision: 1 }),
    );
    const out = await confirmFeelingSentence(
      db,
      "u1",
      session({ current_step: 4 }),
      base,
      "p1-s1",
    );
    expect(out.kind).toBe("done");
    const row = mocks.insertReport.mock.calls[0]?.[3];
    expect(row.sections.paragraphs[0].sentences[0].confirmed).toBe(true);
  });

  it("없는 문장 id 는 404 SENTENCE_NOT_FOUND 다", async () => {
    const out = await confirmFeelingSentence(
      db,
      "u1",
      session({ current_step: 4 }),
      base,
      "nope",
    );
    expect(out).toMatchObject({
      kind: "rejected",
      status: 404,
      code: "SENTENCE_NOT_FOUND",
    });
  });

  it("생성 전이면 order 다", async () => {
    const out = await confirmFeelingSentence(
      db,
      "u1",
      session(),
      base,
      "p1-s1",
    );
    expect(out.kind).toBe("order");
  });
});

describe("validateWriteBody", () => {
  const sid = "3f2b8c1e-9d4a-4b6e-8a1c-0e5d7f9a2b3c";
  it("generate 는 sessionId 만 있으면 된다", () => {
    expect(validateWriteBody({ sessionId: sid, action: "generate" }).ok).toBe(
      true,
    );
  });
  it("edit 는 문자열 문단 배열이 필요하다", () => {
    expect(
      validateWriteBody({ sessionId: sid, action: "edit", paragraphs: ["a"] })
        .ok,
    ).toBe(true);
    expect(
      validateWriteBody({ sessionId: sid, action: "edit", paragraphs: [] }).ok,
    ).toBe(false);
    expect(
      validateWriteBody({ sessionId: sid, action: "edit", paragraphs: [1] }).ok,
    ).toBe(false);
  });
  it("confirm-feeling 은 sentenceId 가 필요하다", () => {
    expect(
      validateWriteBody({
        sessionId: sid,
        action: "confirm-feeling",
        sentenceId: "p1-s1",
      }).ok,
    ).toBe(true);
    expect(
      validateWriteBody({ sessionId: sid, action: "confirm-feeling" }).ok,
    ).toBe(false);
  });
  it("sessionId 나 action 이 틀리면 거절한다", () => {
    expect(validateWriteBody({ sessionId: "x", action: "generate" }).ok).toBe(
      false,
    );
    expect(validateWriteBody({ sessionId: sid, action: "zzz" }).ok).toBe(false);
  });
});
