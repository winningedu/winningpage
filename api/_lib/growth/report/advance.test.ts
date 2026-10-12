import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimStep: vi.fn(),
  completeReport: vi.fn(),
  consumeCredit: vi.fn(),
  finishStep: vi.fn(),
  loadCarried: vi.fn(),
  loadContextInputs: vi.fn(),
  loadPreviousReportId: vi.fn(),
  loadReportRow: vi.fn(),
  reverseCredit: vi.fn(),
  terminateReportRpc: vi.fn(),
  runStep: vi.fn(),
  hasPaidServiceAccess: vi.fn(),
  notifyGrowthReportDone: vi.fn(),
}));
vi.mock("./notify.js", () => ({
  notifyGrowthReportDone: mocks.notifyGrowthReportDone,
}));

vi.mock("./reportDb.js", () => ({
  claimStep: mocks.claimStep,
  completeReport: mocks.completeReport,
  consumeCredit: mocks.consumeCredit,
  finishStep: mocks.finishStep,
  loadCarried: mocks.loadCarried,
  loadContextInputs: mocks.loadContextInputs,
  loadPreviousReportId: mocks.loadPreviousReportId,
  loadReportRow: mocks.loadReportRow,
  reverseCredit: mocks.reverseCredit,
  terminateReportRpc: mocks.terminateReportRpc,
}));
vi.mock("./runStep.js", () => ({ runStep: mocks.runStep }));
vi.mock("../../serviceAccess.js", () => ({
  SERVICE_CONFIGS: { growth: { service_key: "growth" } },
  hasPaidServiceAccess: mocks.hasPaidServiceAccess,
}));

import { advanceStep } from "./advance.js";
import type { ReportDbRow } from "./reportDb.js";
import type { RunStepDeps } from "./runStep.js";
import { emptyStepRecord } from "./stepState.js";
import type { StepNumber } from "./types.js";

const db = {} as never;
const deps = {
  callStructured: vi.fn(),
  now: () => "2026-10-06T00:00:00.000Z",
  startedAt: Date.now(),
};

function makeRow(over: Partial<ReportDbRow> = {}): ReportDbRow {
  return {
    id: "r1",
    status: "in_progress",
    ledger_id: null,
    ledger_reversed_at: null,
    step_state: { steps: {} },
    ...over,
  } as unknown as ReportDbRow;
}

const okResult = { ok: true, step: 1, output: {}, patch: {}, extraAttempts: 0 };
const failResult = (failure: string) => ({
  ok: false,
  step: 3,
  issues: [{ code: "x", message: "m" }],
  extraAttempts: 1,
  failure,
});

function stateWith(step: StepNumber, attempts: number) {
  return {
    steps: { [step]: { ...emptyStepRecord(), status: "failed", attempts } },
  };
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.hasPaidServiceAccess.mockResolvedValue({ allowed: true, reason: null });
  mocks.claimStep.mockResolvedValue({ kind: "claimed", attempts: 1 });
  mocks.loadContextInputs.mockResolvedValue({});
  mocks.loadPreviousReportId.mockResolvedValue(null);
  mocks.loadCarried.mockResolvedValue([]);
  mocks.finishStep.mockResolvedValue(true);
  mocks.loadReportRow.mockResolvedValue(makeRow({ ledger_id: "L1" }));
  mocks.terminateReportRpc.mockResolvedValue({
    ok: true,
    reason: "terminated",
    needsReverse: false,
  });
  mocks.reverseCredit.mockResolvedValue({ status: "reversed", reversed: true });
  mocks.runStep.mockResolvedValue(okResult);
});

describe("advanceStep 차감 게이트", () => {
  it("1단계 미차감인데 이용권이 없으면 선점 전에 no_entitlement", async () => {
    mocks.hasPaidServiceAccess.mockResolvedValue({
      allowed: false,
      reason: "none",
    });
    const out = await advanceStep(db, "u", makeRow(), 1, deps);
    expect(out.kind).toBe("no_entitlement");
    expect(mocks.claimStep).not.toHaveBeenCalled();
  });

  it("2단계 미차감이고 닫힌 회차면 차감하지 않고 locked claim_error", async () => {
    const out = await advanceStep(
      db,
      "u",
      makeRow({ status: "archived" }),
      2,
      deps,
    );
    expect(out).toMatchObject({
      kind: "claim_error",
      claim: { kind: "locked" },
      terminal: false,
    });
    expect(mocks.consumeCredit).not.toHaveBeenCalled();
    expect(mocks.claimStep).not.toHaveBeenCalled();
  });

  it("2단계 늦은 차감이 거절되면 no_entitlement", async () => {
    mocks.consumeCredit.mockResolvedValue({
      status: "quota_exhausted",
      charged: false,
    });
    const out = await advanceStep(db, "u", makeRow(), 2, deps);
    expect(out).toEqual({ kind: "no_entitlement", reason: "quota_exhausted" });
    expect(mocks.claimStep).not.toHaveBeenCalled();
  });

  it("2단계 늦은 차감이 성공하면 진행하고 charged true", async () => {
    mocks.consumeCredit.mockResolvedValue({ status: "charged", charged: true });
    mocks.runStep.mockResolvedValue({ ...okResult, step: 2 });
    const out = await advanceStep(db, "u", makeRow(), 2, deps);
    expect(out).toMatchObject({ kind: "ok", charged: true });
  });
});

describe("advanceStep 성공 경로", () => {
  it("1단계 성공 후 차감하고 charged 를 싣는다", async () => {
    mocks.consumeCredit.mockResolvedValue({ status: "charged", charged: true });
    const out = await advanceStep(db, "u", makeRow(), 1, deps);
    expect(out).toMatchObject({ kind: "ok", charged: true });
    expect(mocks.consumeCredit).toHaveBeenCalledTimes(1);
  });

  it("1단계 차감 거절은 진행을 막지 않고 charged false", async () => {
    mocks.consumeCredit.mockResolvedValue({
      status: "quota_exhausted",
      charged: false,
    });
    const out = await advanceStep(db, "u", makeRow(), 1, deps);
    expect(out).toMatchObject({ kind: "ok", charged: false });
  });

  it("차감된 회차의 3단계는 charged 를 싣지 않는다", async () => {
    const out = await advanceStep(
      db,
      "u",
      makeRow({ ledger_id: "L1" }),
      3,
      deps,
    );
    expect(out.kind).toBe("ok");
    expect("charged" in out).toBe(false);
  });

  it("finishStep 이 false 면 superseded", async () => {
    mocks.finishStep.mockResolvedValue(false);
    const out = await advanceStep(
      db,
      "u",
      makeRow({ ledger_id: "L1" }),
      3,
      deps,
    );
    expect(out.kind).toBe("superseded");
  });

  it("이미 성공한 단계는 done", async () => {
    mocks.claimStep.mockResolvedValue({ kind: "done" });
    const out = await advanceStep(
      db,
      "u",
      makeRow({ ledger_id: "L1" }),
      3,
      deps,
    );
    expect(out.kind).toBe("done");
    expect(mocks.runStep).not.toHaveBeenCalled();
  });
});

describe("advanceStep 8단계", () => {
  const completion = { sections: [], planRows: [], profile: {} };
  const row8 = makeRow({ ledger_id: "L1" });

  it("완료되면 completion 을 싣는다", async () => {
    mocks.runStep.mockResolvedValue({ ...okResult, step: 8, completion });
    mocks.completeReport.mockResolvedValue({
      ok: true,
      reason: "completed",
      issuedAt: "t",
      planItemCount: 4,
    });
    const out = await advanceStep(db, "u", row8, 8, deps);
    expect(out).toMatchObject({
      kind: "ok",
      completion: { issuedAt: "t", planItemCount: 4 },
    });
  });

  it("완료되면 학생 id 와 회차 id 로 학부모 알림을 부른다", async () => {
    mocks.runStep.mockResolvedValue({ ...okResult, step: 8, completion });
    mocks.completeReport.mockResolvedValue({
      ok: true,
      reason: "completed",
      issuedAt: "t",
      planItemCount: 4,
    });
    mocks.notifyGrowthReportDone.mockResolvedValue({ sent: true, count: 1 });
    await advanceStep(db, "u", row8, 8, deps);
    expect(mocks.notifyGrowthReportDone).toHaveBeenCalledWith(db, "u", "r1");
  });

  it("알림이 던져도 결과는 그대로 ok", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.runStep.mockResolvedValue({ ...okResult, step: 8, completion });
    mocks.completeReport.mockResolvedValue({
      ok: true,
      reason: "completed",
      issuedAt: "t",
      planItemCount: 4,
    });
    mocks.notifyGrowthReportDone.mockRejectedValue(new Error("boom"));
    const out = await advanceStep(db, "u", row8, 8, deps);
    expect(out).toMatchObject({ kind: "ok", completion: { planItemCount: 4 } });
  });

  it("알림이 5초 넘게 걸려도 advanceStep 은 5초 안에 ok 를 돌려주고 경고한다", async () => {
    vi.useFakeTimers();
    try {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      mocks.runStep.mockResolvedValue({ ...okResult, step: 8, completion });
      mocks.completeReport.mockResolvedValue({
        ok: true,
        reason: "completed",
        issuedAt: "t",
        planItemCount: 4,
      });
      mocks.notifyGrowthReportDone.mockReturnValue(new Promise(() => {}));
      let out: unknown;
      const p = advanceStep(db, "u", row8, 8, deps).then((o) => {
        out = o;
      });
      await vi.advanceTimersByTimeAsync(5000);
      await p;
      expect(out).toMatchObject({ kind: "ok" });
      expect(warn).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("already_completed 면 알림 없이 done", async () => {
    mocks.runStep.mockResolvedValue({ ...okResult, step: 8, completion });
    mocks.completeReport.mockResolvedValue({
      ok: true,
      reason: "already_completed",
    });
    const out = await advanceStep(db, "u", row8, 8, deps);
    expect(out.kind).toBe("done");
    expect(mocks.notifyGrowthReportDone).not.toHaveBeenCalled();
  });

  it("not_ready 면 선점을 닫고 not_ready", async () => {
    mocks.runStep.mockResolvedValue({ ...okResult, step: 8, completion });
    mocks.completeReport.mockResolvedValue({ ok: false, reason: "not_ready" });
    const out = await advanceStep(db, "u", row8, 8, deps);
    expect(out.kind).toBe("not_ready");
    expect(mocks.finishStep).toHaveBeenCalledWith(
      db,
      "u",
      "r1",
      8,
      false,
      {},
      expect.any(Array),
      0,
    );
  });

  it("그 밖의 거절은 superseded", async () => {
    mocks.runStep.mockResolvedValue({ ...okResult, step: 8, completion });
    mocks.completeReport.mockResolvedValue({ ok: false, reason: "other" });
    const out = await advanceStep(db, "u", row8, 8, deps);
    expect(out.kind).toBe("superseded");
  });
});

describe("advanceStep 실패와 종결", () => {
  const charged = makeRow({ ledger_id: "L1" });

  it("컨텍스트 조립이 던지면 context_error 로 선점을 닫는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.loadContextInputs.mockRejectedValue(new Error("boom"));
    const out = await advanceStep(db, "u", charged, 3, deps);
    expect(out.kind).toBe("context_error");
    expect(mocks.finishStep).toHaveBeenCalledWith(
      db,
      "u",
      "r1",
      3,
      false,
      {},
      [expect.objectContaining({ code: "context_error" })],
      0,
    );
  });

  it("일반 실패는 종결하지 않는다", async () => {
    mocks.runStep.mockResolvedValue(failResult("validation"));
    mocks.loadReportRow.mockResolvedValue(
      makeRow({ ledger_id: "L1", step_state: stateWith(3, 2) }),
    );
    const out = await advanceStep(db, "u", charged, 3, deps);
    expect(out).toMatchObject({
      kind: "failure",
      failure: "validation",
      terminal: false,
    });
    expect(mocks.terminateReportRpc).not.toHaveBeenCalled();
  });

  it("실패 기록이 superseded 면 종결 판정을 하지 않는다", async () => {
    mocks.runStep.mockResolvedValue(failResult("fatal"));
    mocks.finishStep.mockResolvedValue(false);
    const out = await advanceStep(db, "u", charged, 3, deps);
    expect(out.kind).toBe("superseded");
    expect(mocks.terminateReportRpc).not.toHaveBeenCalled();
  });

  it("fatal 은 종결하고 needsReverse 일 때만 되돌린다", async () => {
    mocks.runStep.mockResolvedValue(failResult("fatal"));
    mocks.terminateReportRpc.mockResolvedValue({
      ok: true,
      reason: "terminated",
      needsReverse: true,
    });
    const out = await advanceStep(db, "u", charged, 3, deps);
    expect(out).toMatchObject({ kind: "failure", terminal: true });
    expect(mocks.terminateReportRpc).toHaveBeenCalledWith(
      db,
      "u",
      "r1",
      3,
      "3단계 복구 불가 오류",
    );
    expect(mocks.reverseCredit).toHaveBeenCalledTimes(1);
  });

  it("needsReverse 가 false 면 되돌리지 않는다", async () => {
    mocks.runStep.mockResolvedValue(failResult("fatal"));
    await advanceStep(db, "u", charged, 3, deps);
    expect(mocks.reverseCredit).not.toHaveBeenCalled();
  });

  it("시도 상한 선점은 종결 RPC 를 쓰고 terminal claim_error", async () => {
    mocks.claimStep.mockResolvedValue({ kind: "exhausted", attempts: 10 });
    const out = await advanceStep(db, "u", charged, 3, deps);
    expect(out).toMatchObject({
      kind: "claim_error",
      claim: { kind: "exhausted" },
      terminal: true,
    });
    expect(mocks.terminateReportRpc).toHaveBeenCalledWith(
      db,
      "u",
      "r1",
      3,
      "3단계 시도 상한 초과",
    );
  });

  it("그 밖의 선점 거절은 종결하지 않는다", async () => {
    mocks.claimStep.mockResolvedValue({ kind: "running" });
    const out = await advanceStep(db, "u", charged, 3, deps);
    expect(out).toMatchObject({ kind: "claim_error", terminal: false });
    expect(mocks.terminateReportRpc).not.toHaveBeenCalled();
  });

  it("실행 중 예외는 선점을 닫고 다시 던진다", async () => {
    mocks.runStep.mockRejectedValue(new Error("x"));
    await expect(advanceStep(db, "u", charged, 3, deps)).rejects.toThrow("x");
    expect(mocks.finishStep).toHaveBeenCalledWith(
      db,
      "u",
      "r1",
      3,
      false,
      {},
      [expect.objectContaining({ code: "internal" })],
      0,
    );
  });
});

describe("advanceStep 계기판 기록", () => {
  /** 받은 자식 핸들에 행 하나를 기록하는 가짜 callStructured. */
  const tracedDeps = {
    ...deps,
    callStructured: (async (
      _system: string,
      _user: unknown,
      options: { telemetry?: { recordCall: (e: unknown) => void } } = {},
    ) => {
      options.telemetry?.recordCall({
        kind: "generate",
        model: "m",
        startedAt: 0,
        latencyMs: 1,
        transportAttempt: 1,
        status: "ok",
      });
      return { text: "{}", finishReason: "STOP" };
    }) as unknown as typeof deps.callStructured,
  };
  const bundle = {
    system: "S",
    user: "U",
    responseSchema: {} as never,
    maxOutputTokens: 10,
    callInfo: {
      step: 3 as const,
      kind: "step" as const,
      sectionId: null,
      batchIndex: null,
      attempt: 0 as const,
    },
  };
  const callOnce = (d: RunStepDeps) =>
    d.callModel(bundle, new AbortController().signal);
  const makeDb = () => {
    const insert = vi.fn(async (_rows: unknown) => ({ error: null }));
    const from = vi.fn(() => ({ insert }));
    return { db: { from } as never, insert, from };
  };

  it("runStep 에는 계기판 필드 없이 callModel 만 넘기고 그 호출 행을 성공 뒤 한 번 내보낸다", async () => {
    const t = makeDb();
    mocks.runStep.mockImplementation(async (_s, _c, _o, d) => {
      expect("telemetry" in d).toBe(false);
      await callOnce(d);
      return okResult;
    });
    await advanceStep(t.db, "u", makeRow({ ledger_id: "L1" }), 3, tracedDeps);
    expect(t.from).toHaveBeenCalledWith("ai_model_calls");
    expect(t.insert).toHaveBeenCalledTimes(1);
    const rows = t.insert.mock.calls[0]?.[0] as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({
      service: "growth",
      feature: "report_step",
      step: "3",
      call_key: "step",
      attempt: 1,
      target_kind: "growth_report",
      profile_id: "u",
    });
  });

  it("실패 결과에도 한 번 내보낸다", async () => {
    const t = makeDb();
    mocks.runStep.mockImplementation(async (_s, _c, _o, d) => {
      await callOnce(d);
      return failResult("validation");
    });
    await advanceStep(t.db, "u", makeRow({ ledger_id: "L1" }), 3, tracedDeps);
    expect(t.insert).toHaveBeenCalledTimes(1);
  });

  it("실행 중 예외로 끝나도 한 번 내보내고 예외는 그대로 던진다", async () => {
    const t = makeDb();
    mocks.runStep.mockImplementation(async (_s, _c, _o, d) => {
      await callOnce(d);
      throw new Error("x");
    });
    await expect(
      advanceStep(t.db, "u", makeRow({ ledger_id: "L1" }), 3, tracedDeps),
    ).rejects.toThrow("x");
    expect(t.insert).toHaveBeenCalledTimes(1);
  });

  it("모델을 부르지 않은 단계는 insert 하지 않는다", async () => {
    const t = makeDb();
    await advanceStep(t.db, "u", makeRow({ ledger_id: "L1" }), 2, deps);
    expect(t.insert).not.toHaveBeenCalled();
  });
});
