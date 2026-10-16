import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimStep: vi.fn(),
  finishStep: vi.fn(),
  terminateSession: vi.fn(),
  reverseCredit: vi.fn(),
}));
vi.mock("./db.js", () => ({
  claimStep: mocks.claimStep,
  finishStep: mocks.finishStep,
  terminateSession: mocks.terminateSession,
  reverseCredit: mocks.reverseCredit,
}));

import type { SessionRow } from "./rows.js";
import { outcomeToHttp, runModelStep } from "./runModelStep.js";

const db = {} as never;
const session = { id: "s1" } as SessionRow;
const bundle = {
  system: "sys",
  user: "usr",
  responseSchema: {},
  maxOutputTokens: 100,
};

const callStructured = vi.fn();
const deps = () => ({
  callStructured: callStructured as never,
  now: () => new Date().toISOString(),
  startedAt: Date.now(),
});

const okValidate = (value: unknown) => ({
  ok: true as const,
  patch: { current_step: 3 },
  result: value,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.claimStep.mockResolvedValue({ kind: "claimed", attempts: 1 });
  mocks.finishStep.mockResolvedValue(true);
  mocks.terminateSession.mockResolvedValue({
    ok: true,
    needsReverse: false,
    ledgerId: null,
  });
});

describe("선점", () => {
  it.each([
    [{ kind: "locked" }, { kind: "locked" }],
    [{ kind: "running" }, { kind: "running" }],
    [
      { kind: "order", currentStep: 1 },
      { kind: "order", currentStep: 1 },
    ],
  ])(
    "선점 결과 %j 는 모델 호출 없이 그대로 돌려준다",
    async (claim, expected) => {
      mocks.claimStep.mockResolvedValue(claim);
      const out = await runModelStep(db, "u1", session, "write", deps(), {
        build: () => bundle,
        validate: okValidate,
      });
      expect(out).toEqual(expected);
      expect(callStructured).not.toHaveBeenCalled();
    },
  );

  it("시도 상한에 닿았으면 세션을 종결하고 terminal 로 돌려준다", async () => {
    mocks.claimStep.mockResolvedValue({ kind: "exhausted", attempts: 10 });
    const out = await runModelStep(db, "u1", session, "write", deps(), {
      build: () => bundle,
      validate: okValidate,
    });
    expect(out).toEqual({ kind: "exhausted", terminal: true });
    expect(mocks.terminateSession).toHaveBeenCalledWith(
      db,
      "u1",
      "s1",
      "write",
      "exhausted",
    );
    expect(mocks.reverseCredit).not.toHaveBeenCalled();
  });

  it("종결 때 되돌릴 차감이 있으면 selfeval:exhausted 로 되돌린다", async () => {
    mocks.claimStep.mockResolvedValue({ kind: "exhausted", attempts: 10 });
    mocks.terminateSession.mockResolvedValue({
      ok: true,
      needsReverse: true,
      ledgerId: "l1",
    });
    await runModelStep(db, "u1", session, "verify", deps(), {
      build: () => bundle,
      validate: okValidate,
    });
    expect(mocks.reverseCredit).toHaveBeenCalledWith(
      db,
      "u1",
      "s1",
      "selfeval:exhausted",
    );
  });
});

describe("성공", () => {
  it("모델 응답이 검증을 통과하면 patch 와 함께 단계를 닫는다", async () => {
    callStructured.mockResolvedValue({ text: '{"a":1}', finishReason: "STOP" });
    const out = await runModelStep(db, "u1", session, "write", deps(), {
      build: () => bundle,
      validate: okValidate,
      patchOnSuccess: { regenerate_increment: true },
    });
    expect(out).toEqual({
      kind: "ok",
      result: { a: 1 },
      attempts: 1,
      softIssues: [],
    });
    expect(mocks.finishStep).toHaveBeenCalledWith(db, "u1", "s1", "write", {
      ok: true,
      patch: { current_step: 3, regenerate_increment: true },
      extraAttempts: 0,
    });
    expect(callStructured).toHaveBeenCalledWith(
      "sys",
      "usr",
      expect.objectContaining({
        responseMimeType: "application/json",
        maxOutputTokens: 100,
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });

  it("finishStep 이 false 면 다른 요청이 가져간 것이라 superseded 다", async () => {
    callStructured.mockResolvedValue({ text: "{}", finishReason: "STOP" });
    mocks.finishStep.mockResolvedValue(false);
    const out = await runModelStep(db, "u1", session, "write", deps(), {
      build: () => bundle,
      validate: okValidate,
    });
    expect(out).toEqual({ kind: "superseded" });
  });
});

describe("재요청", () => {
  const stop = (text: string) => ({ text, finishReason: "STOP" });
  const hard = {
    ok: false as const,
    issues: [{ code: "missing_field", message: "항목이 없습니다." }],
  };

  it("첫 응답이 잘렸으면 재요청 메모를 붙여 한 번 더 부르고 extraAttempts 1 로 닫는다", async () => {
    callStructured
      .mockResolvedValueOnce({ text: "{", finishReason: "MAX_TOKENS" })
      .mockResolvedValueOnce(stop('{"a":2}'));
    const build = vi.fn((_notes: string[]) => bundle);
    const out = await runModelStep(db, "u1", session, "write", deps(), {
      build,
      validate: okValidate,
    });
    expect(out).toMatchObject({ kind: "ok", result: { a: 2 }, attempts: 2 });
    expect(build.mock.calls[0]?.[0]).toEqual([]);
    expect(build.mock.calls[1]?.[0]).not.toEqual([]);
    expect(mocks.finishStep).toHaveBeenCalledWith(
      db,
      "u1",
      "s1",
      "write",
      expect.objectContaining({ ok: true, extraAttempts: 1 }),
    );
  });

  it("두 번 다 검증에 실패하면 validation 실패로 닫고 issues 를 기록한다", async () => {
    callStructured.mockResolvedValue(stop("{}"));
    const out = await runModelStep(db, "u1", session, "write", deps(), {
      build: () => bundle,
      validate: () => hard,
    });
    expect(out).toEqual({
      kind: "failure",
      failure: "validation",
      issues: hard.issues,
      attempts: 2,
      terminal: false,
    });
    expect(mocks.finishStep).toHaveBeenCalledWith(db, "u1", "s1", "write", {
      ok: false,
      issues: hard.issues,
      extraAttempts: 1,
    });
    expect(mocks.terminateSession).not.toHaveBeenCalled();
  });

  it("JSON 이 아닌 응답도 한 번 재요청한다", async () => {
    callStructured
      .mockResolvedValueOnce(stop("not json"))
      .mockResolvedValueOnce(stop("{}"));
    const out = await runModelStep(db, "u1", session, "write", deps(), {
      build: () => bundle,
      validate: okValidate,
    });
    expect(out.kind).toBe("ok");
    expect(callStructured).toHaveBeenCalledTimes(2);
  });

  it("첫 시도에 soft 만 있으면 재요청하고, 다시 soft 면 통과시킨다", async () => {
    const soft = [{ code: "length_off_target", message: "분량" }];
    callStructured.mockResolvedValue(stop("{}"));
    const out = await runModelStep(db, "u1", session, "write", deps(), {
      build: () => bundle,
      validate: (v) => ({ ...okValidate(v), softIssues: soft }),
    });
    expect(callStructured).toHaveBeenCalledTimes(2);
    expect(out).toMatchObject({ kind: "ok", softIssues: soft, attempts: 2 });
  });

  it("soft 통과 뒤 재요청이 hard 로 실패하면 첫 결과를 쓴다", async () => {
    const soft = [{ code: "length_off_target", message: "분량" }];
    callStructured.mockResolvedValue(stop("{}"));
    const validate = vi
      .fn()
      .mockReturnValueOnce({ ...okValidate("first"), softIssues: soft })
      .mockReturnValueOnce(hard);
    const out = await runModelStep(db, "u1", session, "write", deps(), {
      build: () => bundle,
      validate,
    });
    expect(out).toMatchObject({
      kind: "ok",
      result: "first",
      softIssues: soft,
    });
  });

  it("soft 가 없으면 재요청하지 않는다", async () => {
    callStructured.mockResolvedValue(stop("{}"));
    await runModelStep(db, "u1", session, "write", deps(), {
      build: () => bundle,
      validate: okValidate,
    });
    expect(callStructured).toHaveBeenCalledTimes(1);
  });
});

describe("실패 분류와 종결", () => {
  it("모델 호출 예외는 upstream 이고 재요청하지 않는다", async () => {
    callStructured.mockRejectedValue(new Error("503"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await runModelStep(db, "u1", session, "write", deps(), {
      build: () => bundle,
      validate: okValidate,
    });
    expect(out).toMatchObject({
      kind: "failure",
      failure: "upstream",
      attempts: 1,
      terminal: false,
    });
    expect(callStructured).toHaveBeenCalledTimes(1);
  });

  it("예산이 이미 소진됐으면 모델을 부르지 않고 timeout 이다", async () => {
    const out = await runModelStep(
      db,
      "u1",
      session,
      "write",
      { ...deps(), startedAt: Date.now() - 60_000 },
      { build: () => bundle, validate: okValidate },
    );
    expect(out).toMatchObject({ kind: "failure", failure: "timeout" });
    expect(callStructured).not.toHaveBeenCalled();
  });

  it("호출 중 예산이 끝나 abort 되면 timeout 이다", async () => {
    callStructured.mockImplementation(
      (_s: string, _u: string, o: { abortSignal: AbortSignal }) =>
        new Promise((_, reject) => {
          o.abortSignal.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );
    const out = await runModelStep(
      db,
      "u1",
      session,
      "write",
      // 남은 예산 20ms
      { ...deps(), startedAt: Date.now() - 49_980 },
      { build: () => bundle, validate: okValidate },
    );
    expect(out).toMatchObject({ kind: "failure", failure: "timeout" });
  });

  it("누계가 상한에 닿는 실패는 세션을 종결하고 차감을 되돌린다", async () => {
    mocks.claimStep.mockResolvedValue({ kind: "claimed", attempts: 9 });
    mocks.terminateSession.mockResolvedValue({
      ok: true,
      needsReverse: true,
      ledgerId: "l1",
    });
    callStructured.mockResolvedValue({ text: "{}", finishReason: "STOP" });
    const out = await runModelStep(db, "u1", session, "verify", deps(), {
      build: () => bundle,
      validate: () => ({
        ok: false,
        issues: [{ code: "x", message: "x" }],
      }),
    });
    expect(out).toMatchObject({
      kind: "failure",
      attempts: 10,
      terminal: true,
    });
    expect(mocks.terminateSession).toHaveBeenCalledWith(
      db,
      "u1",
      "s1",
      "verify",
      "exhausted",
    );
    expect(mocks.reverseCredit).toHaveBeenCalledWith(
      db,
      "u1",
      "s1",
      "selfeval:exhausted",
    );
  });

  it("실패 종료 때 다른 요청이 가져갔으면 superseded 이고 종결하지 않는다", async () => {
    mocks.claimStep.mockResolvedValue({ kind: "claimed", attempts: 10 });
    mocks.finishStep.mockResolvedValue(false);
    callStructured.mockRejectedValue(new Error("x"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await runModelStep(db, "u1", session, "write", deps(), {
      build: () => bundle,
      validate: okValidate,
    });
    expect(out).toEqual({ kind: "superseded" });
    expect(mocks.terminateSession).not.toHaveBeenCalled();
  });

  it("검증 함수가 던지면 fatal 로 닫고 단계를 실패 처리한다", async () => {
    callStructured.mockResolvedValue({ text: "{}", finishReason: "STOP" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await runModelStep(db, "u1", session, "write", deps(), {
      build: () => bundle,
      validate: () => {
        throw new Error("boom");
      },
    });
    expect(out).toMatchObject({ kind: "failure", failure: "fatal" });
    expect(mocks.finishStep).toHaveBeenCalledWith(
      db,
      "u1",
      "s1",
      "write",
      expect.objectContaining({ ok: false }),
    );
  });

  it("실패 응답은 코드별 HTTP 상태로 매핑한다", () => {
    const f = (failure: "validation" | "upstream" | "timeout" | "fatal") =>
      outcomeToHttp({
        kind: "failure",
        failure,
        issues: [],
        attempts: 3,
        terminal: false,
        reversed: true,
      });
    expect([f("validation").status, f("validation").code]).toEqual([
      422,
      "STEP_VALIDATION_FAILED",
    ]);
    expect(f("upstream").status).toBe(502);
    expect(f("timeout").status).toBe(504);
    expect(f("fatal").code).toBe("STEP_FATAL");
    expect(f("upstream").extra).toMatchObject({ attempts: 3, reversed: true });
  });
});

describe("outcomeToHttp", () => {
  it("성공은 200 과 attempts, softIssues 를 extra 로 싣는다", () => {
    const http = outcomeToHttp({
      kind: "ok",
      result: {},
      attempts: 2,
      softIssues: [],
    });
    expect(http.status).toBe(200);
    expect(http.extra).toEqual({ attempts: 2, softIssues: [] });
  });

  it("선점 거절은 코드가 붙은 409 다", () => {
    expect(outcomeToHttp({ kind: "locked" })).toMatchObject({
      status: 409,
      code: "SESSION_NOT_OPEN",
    });
    expect(outcomeToHttp({ kind: "running" })).toMatchObject({
      status: 409,
      code: "STEP_RUNNING",
    });
    expect(outcomeToHttp({ kind: "order", currentStep: 2 })).toMatchObject({
      status: 409,
      code: "STEP_ORDER",
      extra: { currentStep: 2 },
    });
    expect(outcomeToHttp({ kind: "superseded" })).toMatchObject({
      status: 409,
      code: "STEP_SUPERSEDED",
    });
    expect(outcomeToHttp({ kind: "exhausted", terminal: true })).toMatchObject({
      status: 409,
      code: "ATTEMPTS_EXHAUSTED",
      extra: { terminal: true },
    });
  });
});

describe("계기판 기록", () => {
  type Row = Record<string, unknown>;
  const stop = (text: string) => ({ text, finishReason: "STOP" });
  const soft = [{ code: "length_off_target", message: "분량" }];
  const makeTelemetryDb = () => {
    const insert = vi.fn(async (_rows: unknown) => ({ error: null }));
    return {
      db: { from: vi.fn(() => ({ insert })) } as never,
      insert,
      rows: () => (insert.mock.calls[0]?.[0] ?? []) as Row[],
    };
  };
  // 실제 callStructured 처럼 호출마다 telemetry 에 한 건 기록한다.
  const record = (options: {
    telemetry?: { recordCall: (e: never) => void };
  }) =>
    options.telemetry?.recordCall({
      kind: "generate",
      model: "m",
      startedAt: 0,
      latencyMs: 1,
      transportAttempt: 1,
      status: "ok",
    } as never);
  const queueReplies = (
    ...replies: { text: string; finishReason: string }[]
  ) => {
    const q = [...replies];
    callStructured.mockImplementation(async (_s, _u, options) => {
      record(options);
      return q.shift();
    });
  };

  it("잘림 재요청은 1회차 failed truncated, 2회차 ok 이고 한 번만 내보낸다", async () => {
    const t = makeTelemetryDb();
    queueReplies({ text: "{", finishReason: "MAX_TOKENS" }, stop('{"a":2}'));
    await runModelStep(t.db, "u1", session, "write", deps(), {
      build: () => bundle,
      validate: okValidate,
    });
    expect(t.insert).toHaveBeenCalledTimes(1);
    expect(t.rows()).toMatchObject([
      {
        service: "selfeval",
        feature: "write",
        target_kind: "selfeval_session",
        profile_id: "u1",
        attempt: 1,
        retry_reason: null,
        validation: "failed",
        issue_codes: ["truncated"],
      },
      { attempt: 2, retry_reason: "truncated", validation: "ok" },
    ]);
  });

  it("검증 실패는 issue 코드를 남기고 재요청 사유로 쓴다", async () => {
    const t = makeTelemetryDb();
    queueReplies(stop("{}"), stop("{}"));
    const validate = vi
      .fn()
      .mockReturnValueOnce({
        ok: false,
        issues: [{ code: "missing_field", message: "m" }],
      })
      .mockReturnValueOnce(okValidate("v"));
    await runModelStep(t.db, "u1", session, "write", deps(), {
      build: () => bundle,
      validate,
    });
    expect(t.rows()).toMatchObject([
      { validation: "failed", issue_codes: ["missing_field"] },
      { retry_reason: "missing_field", validation: "ok" },
    ]);
  });

  it("soft 재요청 뒤 hard 실패로 첫 결과를 쓰면 마지막 시도는 failed 로 남긴다", async () => {
    const t = makeTelemetryDb();
    queueReplies(stop("{}"), stop("{}"));
    const validate = vi
      .fn()
      .mockReturnValueOnce({ ...okValidate("first"), softIssues: soft })
      .mockReturnValueOnce({
        ok: false,
        issues: [{ code: "missing_field", message: "m" }],
      });
    await runModelStep(t.db, "u1", session, "write", deps(), {
      build: () => bundle,
      validate,
    });
    expect(t.rows()).toMatchObject([
      { validation: "failed", issue_codes: ["length_off_target"] },
      {
        retry_reason: "length_off_target",
        validation: "failed",
        issue_codes: ["missing_field"],
      },
    ]);
  });

  it("모델 호출 예외는 annotate 없이 한 번 내보낸다", async () => {
    const t = makeTelemetryDb();
    callStructured.mockImplementation(async (_s, _u, options) => {
      record(options);
      throw new Error("503");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await runModelStep(t.db, "u1", session, "write", deps(), {
      build: () => bundle,
      validate: okValidate,
    });
    expect(t.insert).toHaveBeenCalledTimes(1);
    expect(t.rows()[0]?.validation).toBeNull();
  });

  it("검증 함수가 던져 fatal 로 끝나도 한 번 내보낸다", async () => {
    const t = makeTelemetryDb();
    queueReplies(stop("{}"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await runModelStep(t.db, "u1", session, "write", deps(), {
      build: () => bundle,
      validate: () => {
        throw new Error("boom");
      },
    });
    expect(t.insert).toHaveBeenCalledTimes(1);
  });
});
