import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimStep: vi.fn(),
  finishStep: vi.fn(),
  terminateSession: vi.fn(),
  reverseCredit: vi.fn(),
  consumeCredit: vi.fn(),
  loadSessionActivities: vi.fn(),
  loadReports: vi.fn(),
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
}));
vi.mock("../access.js", () => ({
  hasSelfevalAccess: mocks.hasSelfevalAccess,
  readSelfevalQuota: mocks.readSelfevalQuota,
}));

import { SCORE_RUBRIC } from "../dictionaries.js";
import type { ReportRow, SessionRow } from "../rows.js";
import {
  type ActivityRecordLike,
  ANALYSIS_FIELDS,
  type Analysis,
  type GenerationSections,
} from "../types.js";
import type { SessionActivityWithRecord } from "../view.js";
import {
  buildVerifyInput,
  buildVerifySpec,
  runVerify,
  validateVerifyBody,
} from "./verify.js";

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
    grade_label: "고2",
    subject: "물리",
    activity_name: null,
    school_prompt: "탐구 과정에서 배운 점을 서술하시오",
    teacher_note: null,
    target_chars: null,
    target_chars_mode: "with_space",
    career: { career: null, department: null, universities: ["가나대"] },
    growth_applied: false,
    growth_snapshot: null,
    current_step: 4,
    regenerate_count: 0,
    ledger_id: null,
    ledger_reversed_at: null,
    ...p,
  }) as SessionRow;

const analysis = (): Analysis => ({
  values: Object.fromEntries(
    ANALYSIS_FIELDS.map((f) => [
      f,
      f === "concept" ? "농도 단위 이해" : f === "role" ? "측정 담당" : "",
    ]),
  ) as Analysis["values"],
  sources: Object.fromEntries(
    ANALYSIS_FIELDS.map((f) => [f, "record"]),
  ) as Analysis["sources"],
  conflicts: [],
});

const sections: GenerationSections = {
  paragraphs: [
    {
      role: "process",
      sentences: [
        {
          id: "p1-s1",
          text: "센서로 미세먼지를 측정하였다.",
          evidence: { activityId: "c1", field: "method" },
          feeling: false,
          confirmed: false,
        },
        {
          id: "p1-s2",
          text: "농도를 비교하였다.",
          evidence: null,
          feeling: true,
          confirmed: false,
        },
      ],
    },
  ],
};

const reportRow = (p: Partial<ReportRow>): ReportRow => ({
  id: "g1",
  session_id: "s1",
  report_type: "generation",
  revision: 1,
  sections,
  char_count: { withSpace: 10, withoutSpace: 8 },
  score: null,
  mandatory_fixes: null,
  created_at: "2026-10-06T00:00:00Z",
  ...p,
});

const core = () => ({ record: record("c1"), analysis: analysis() });

const verifyJson = (pass = true) =>
  JSON.stringify({
    items: SCORE_RUBRIC.map((r) => ({
      key: r.key,
      checks: r.checks.map((text) => ({ text, pass })),
    })),
    stageChecks: [
      { text: "a", pass },
      { text: "b", pass },
    ],
  });

const activities = (): SessionActivityWithRecord[] => [
  {
    activity_record_id: "c1",
    role: "core",
    fit_score: null,
    fit_reasons: null,
    analysis: analysis(),
    analysis_source: "model",
    record: record("c1"),
  },
  {
    activity_record_id: "s2",
    role: "support",
    fit_score: null,
    fit_reasons: null,
    analysis: null,
    analysis_source: null,
    record: record("s2", { topic: "황사 비교" }),
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.claimStep.mockResolvedValue({ kind: "claimed", attempts: 1 });
  mocks.finishStep.mockResolvedValue(true);
  mocks.loadSessionActivities.mockResolvedValue(activities());
  mocks.hasSelfevalAccess.mockResolvedValue(true);
  mocks.readSelfevalQuota.mockResolvedValue({ quotaRemaining: null });
  mocks.consumeCredit.mockResolvedValue({ status: "charged", charged: true });
  mocks.reverseCredit.mockResolvedValue({ status: "reversed", reversed: true });
  mocks.terminateSession.mockResolvedValue({
    ok: true,
    needsReverse: true,
    ledgerId: "l1",
  });
  callStructured.mockResolvedValue({
    text: verifyJson(),
    finishReason: "STOP",
  });
});

describe("buildVerifyInput", () => {
  it("본문, 문장 목록, 핵심 낱말, 보조 활동 이름을 모은다", () => {
    const input = buildVerifyInput(session(), sections, core(), [
      record("s2", { topic: "황사 비교" }),
    ]);
    expect(input.text).toBe("센서로 미세먼지를 측정하였다. 농도를 비교하였다.");
    expect(input.sentences).toEqual([
      { id: "p1-s1", text: "센서로 미세먼지를 측정하였다." },
      { id: "p1-s2", text: "농도를 비교하였다." },
    ]);
    expect(input.coreTerms.concepts).toContain("단위");
    expect(input.coreTerms.roles).toContain("측정");
    expect(input.supportNames).toEqual(["황사 비교"]);
    expect(input.promptKeywords.length).toBeGreaterThan(0);
    expect(input.growth).toBeNull();
  });

  it("성장설계가 켜져 있으면 현재 단계와 이번 학년 하위 주제를 싣는다", () => {
    const snapshot = {
      narrativeTheme: "주제",
      stage: "flower",
      gradeSubthemes: [
        { grade: "고2", stage: "flower", text: "데이터로 말하기" },
      ],
      weakAxes: [],
    } as never;
    const input = buildVerifyInput(
      session({ growth_applied: true, growth_snapshot: snapshot }),
      sections,
      core(),
      [],
    );
    expect(input.growth).toEqual({
      stageLabel: "꽃",
      currentSubtheme: "데이터로 말하기",
    });
  });
});

describe("buildVerifySpec", () => {
  it("검증을 통과하면 5단계로 올리고 점수와 필수 수정을 리포트에 싣는다", () => {
    const spec = buildVerifySpec(session(), sections, core(), []);
    const v = spec.validate(JSON.parse(verifyJson(true)));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const { sections: ver } = v.result;
    expect(ver.total).toBe(ver.items.reduce((sum, i) => sum + i.score, 0));
    expect(ver.total).toBeGreaterThan(0);
    expect(v.patch).toMatchObject({
      current_step: 5,
      report: {
        report_type: "verification",
        sections: ver,
        char_count: ver.charCount,
        score: ver.total,
        mandatory_fixes: ver.mandatoryFixes,
      },
    });
    expect(ver.growthFit).toBeNull();
  });

  it("문항 핵심 낱말이 본문에 있으면 모델이 false 로 줘도 서버가 통과로 덮는다", () => {
    const spec = buildVerifySpec(
      session({ school_prompt: "미세먼지 측정 과정을 서술하시오" }),
      sections,
      core(),
      [],
    );
    const v = spec.validate(JSON.parse(verifyJson(false)));
    expect(
      v.ok &&
        v.result.sections.items.find((i) => i.key === "prompt")?.checks[1]
          ?.pass,
    ).toBe(true);
  });

  it("성장설계 적용이면 단계 확인과 축 확인을 growthFit 으로 싣는다", () => {
    const snapshot = {
      narrativeTheme: "주제",
      stage: "flower",
      gradeSubthemes: [],
      weakAxes: [
        {
          axis: "x",
          name: "축",
          count: 1,
          required: 3,
          guideline: "센서 활용 늘리기",
        },
      ],
    } as never;
    const spec = buildVerifySpec(
      session({ growth_applied: true, growth_snapshot: snapshot }),
      sections,
      core(),
      [],
    );
    const v = spec.validate(JSON.parse(verifyJson(true)));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.result.sections.growthFit?.stageChecks).toHaveLength(2);
    expect(v.result.sections.growthFit?.axisChecks[0]).toMatchObject({
      name: "축",
      satisfied: true,
    });
  });

  it("확인 문장 수가 틀리면 실패 사유를 낸다", () => {
    const spec = buildVerifySpec(session(), sections, core(), []);
    expect(spec.validate({ items: [] }).ok).toBe(false);
  });
});

describe("runVerify", () => {
  const withGen = [reportRow({})];

  it("생성 전(단계 3)이면 order 다", async () => {
    const out = await runVerify(
      db,
      "u1",
      session({ current_step: 3 }),
      withGen,
      deps(),
    );
    expect(out).toEqual({ kind: "order", currentStep: 3 });
  });

  it("차감이 필요한데 잔여가 0 이면 선점 전에 거절한다", async () => {
    mocks.readSelfevalQuota.mockResolvedValue({ quotaRemaining: 0 });
    const out = await runVerify(db, "u1", session(), withGen, deps());
    expect(out).toEqual({ kind: "quota_exhausted" });
    expect(mocks.claimStep).not.toHaveBeenCalled();
  });

  it("성공하면 최신 검증 리포트와 차감 여부를 돌려준다", async () => {
    mocks.loadReports.mockResolvedValue([
      ...withGen,
      reportRow({
        id: "v1",
        report_type: "verification",
        revision: 1,
        score: 80,
        mandatory_fixes: [],
        created_at: "2026-10-06T00:01:00Z",
      }),
    ]);
    const out = await runVerify(db, "u1", session(), withGen, deps());
    expect(out).toMatchObject({
      kind: "ok",
      result: {
        verification: { id: "v1", revision: 1, score: 80, mandatoryFixes: [] },
        charged: true,
        currentStep: 5,
      },
    });
    expect(mocks.consumeCredit).toHaveBeenCalledWith(
      db,
      "u1",
      "s1",
      "selfeval:verify-success",
    );
  });

  it("활성 차감이 있으면 재차감하지 않는다", async () => {
    mocks.loadReports.mockResolvedValue([
      ...withGen,
      reportRow({
        id: "v1",
        report_type: "verification",
        created_at: "2026-10-06T00:01:00Z",
      }),
    ]);
    await runVerify(db, "u1", session({ ledger_id: "l1" }), withGen, deps());
    expect(mocks.consumeCredit).not.toHaveBeenCalled();
  });

  it("되돌려진 차감은 재검증 성공 때 다시 차감한다", async () => {
    mocks.loadReports.mockResolvedValue([
      ...withGen,
      reportRow({
        id: "v1",
        report_type: "verification",
        created_at: "2026-10-06T00:01:00Z",
      }),
    ]);
    await runVerify(
      db,
      "u1",
      session({ ledger_id: "l1", ledger_reversed_at: "2026-10-06T00:00:30Z" }),
      withGen,
      deps(),
    );
    expect(mocks.consumeCredit).toHaveBeenCalledOnce();
  });

  it("검증 실패 때 활성 차감을 되돌리고 reversed true 를 알린다", async () => {
    callStructured.mockResolvedValue({ text: "{}", finishReason: "STOP" });
    const out = await runVerify(
      db,
      "u1",
      session({ ledger_id: "l1" }),
      withGen,
      deps(),
    );
    expect(out).toMatchObject({
      kind: "failure",
      failure: "validation",
      reversed: true,
      terminal: false,
    });
    expect(mocks.reverseCredit).toHaveBeenCalledWith(
      db,
      "u1",
      "s1",
      "selfeval:verify-failed",
    );
  });

  it("차감 이력이 없으면 되돌리지 않고 reversed false 다", async () => {
    callStructured.mockRejectedValue(new Error("503"));
    const out = await runVerify(db, "u1", session(), withGen, deps());
    expect(out).toMatchObject({
      kind: "failure",
      failure: "upstream",
      reversed: false,
    });
    expect(mocks.reverseCredit).not.toHaveBeenCalled();
  });

  it("상한으로 종결된 실패는 종결 쪽에서 되돌리므로 다시 부르지 않는다", async () => {
    mocks.claimStep.mockResolvedValue({ kind: "claimed", attempts: 10 });
    callStructured.mockResolvedValue({ text: "{}", finishReason: "STOP" });
    const out = await runVerify(
      db,
      "u1",
      session({ ledger_id: "l1" }),
      withGen,
      deps(),
    );
    expect(out).toMatchObject({
      kind: "failure",
      terminal: true,
      reversed: true,
    });
    expect(mocks.reverseCredit).toHaveBeenCalledTimes(1);
    expect(mocks.reverseCredit).toHaveBeenCalledWith(
      db,
      "u1",
      "s1",
      "selfeval:exhausted",
    );
  });

  it("최신 편집본이 있으면 그 본문을 검증 대상으로 쓴다", async () => {
    const editedSections: GenerationSections = {
      paragraphs: [
        {
          role: "process",
          sentences: [
            {
              id: "p1-e1",
              text: "학생이 고친 문장이다.",
              evidence: { student: true },
              feeling: false,
              confirmed: false,
            },
          ],
        },
      ],
    };
    mocks.loadReports.mockResolvedValue([
      ...withGen,
      reportRow({
        id: "v1",
        report_type: "verification",
        created_at: "2026-10-06T00:09:00Z",
      }),
    ]);
    await runVerify(
      db,
      "u1",
      session({ ledger_id: "l1" }),
      [
        ...withGen,
        reportRow({
          id: "e1",
          report_type: "edited",
          sections: editedSections,
          created_at: "2026-10-06T00:05:00Z",
        }),
      ],
      deps(),
    );
    expect(callStructured.mock.calls[0]?.[1]).toContain(
      "학생이 고친 문장이다.",
    );
  });
});

describe("validateVerifyBody", () => {
  it("sessionId 만 받는다", () => {
    expect(
      validateVerifyBody({ sessionId: "3f2b8c1e-9d4a-4b6e-8a1c-0e5d7f9a2b3c" })
        .ok,
    ).toBe(true);
    expect(validateVerifyBody({ sessionId: "x" }).ok).toBe(false);
    expect(validateVerifyBody(null).ok).toBe(false);
  });
});
