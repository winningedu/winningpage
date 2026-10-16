import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimGeneration: vi.fn(),
  finishGeneration: vi.fn(),
  terminateSession: vi.fn(),
  reverseCredit: vi.fn(),
  loadSession: vi.fn(),
}));
vi.mock("./generateDb.js", () => ({
  claimGeneration: mocks.claimGeneration,
  finishGeneration: mocks.finishGeneration,
  terminateSession: mocks.terminateSession,
  reverseCredit: mocks.reverseCredit,
}));
vi.mock("./db.js", () => ({ loadSession: mocks.loadSession }));

import {
  type GenerationDeps,
  type GenerationSpec,
  generationErrorOf,
  retryNotesFor,
  runGeneration,
} from "./generate.js";
import type { ValidationIssue } from "./types.js";
import { TRUNCATED_RETRY_NOTE } from "./validation.js";

const db = {} as never;
const bundle = (user: string) => ({
  system: "sys",
  user,
  responseSchema: {} as never,
  maxOutputTokens: 100,
});

function generationOf(attempts: number) {
  return {
    generation_state: {
      modes: {
        topic_recommendation: {
          status: "pending",
          attempts,
          startedAt: null,
          finishedAt: null,
          issues: [],
        },
      },
    },
  };
}

function makeDeps(over: Partial<GenerationDeps> = {}): GenerationDeps {
  return {
    callStructured: vi.fn(),
    now: () => "2026-10-06T00:00:00.000Z",
    startedAt: Date.now(),
    ...over,
  };
}

type Parsed = { n: number };
function makeSpec(
  over: Partial<GenerationSpec<Parsed, string>> = {},
): GenerationSpec<Parsed, string> {
  return {
    mode: "topic_recommendation",
    precheck: () => ({ ok: true }),
    prompt: bundle("first"),
    validate: (v) =>
      typeof v === "object" && v !== null && "n" in v
        ? { ok: true, value: v as Parsed }
        : { ok: false, issues: [{ code: "bad", message: "나쁨" }] },
    retryPrompt: (_issues, truncated) =>
      bundle(truncated ? "retry-truncated" : "retry"),
    persist: vi.fn(async () => "saved"),
    ...over,
  };
}

const reply = (text: string, finishReason: string | null = "STOP") => ({
  text,
  finishReason,
});

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.claimGeneration.mockResolvedValue({ kind: "claimed", attempts: 1 });
  mocks.finishGeneration.mockResolvedValue(true);
  mocks.terminateSession.mockResolvedValue({ needsReverse: false });
  mocks.reverseCredit.mockResolvedValue({ status: "reversed", reversed: true });
  mocks.loadSession.mockResolvedValue(generationOf(1));
});

describe("runGeneration 성공", () => {
  it("선점, 모델 호출, 저장, finish(ok) 순으로 진행하고 saved 를 돌려준다", async () => {
    const callStructured = vi.fn().mockResolvedValue(reply('{"n":1}'));
    const spec = makeSpec();
    const out = await runGeneration(
      db,
      "u1",
      "s1",
      spec,
      makeDeps({ callStructured }),
    );

    expect(out).toMatchObject({ kind: "ok", saved: "saved", attempts: 1 });
    expect(mocks.claimGeneration).toHaveBeenCalledWith(
      db,
      "s1",
      "u1",
      "topic_recommendation",
    );
    expect(callStructured).toHaveBeenCalledTimes(1);
    expect(callStructured).toHaveBeenCalledWith(
      "sys",
      "first",
      expect.objectContaining({
        responseMimeType: "application/json",
        maxOutputTokens: 100,
        abortSignal: expect.any(AbortSignal),
      }),
    );
    expect(spec.persist).toHaveBeenCalledWith({ n: 1 }, 1);
    expect(mocks.finishGeneration).toHaveBeenCalledWith(
      db,
      "s1",
      "u1",
      "topic_recommendation",
      true,
      [],
      0,
    );
  });
});

describe("runGeneration 선행 조건과 선점", () => {
  it("precheck 실패는 선점하지 않고 그 오류를 그대로 돌려준다", async () => {
    const callStructured = vi.fn();
    const out = await runGeneration(
      db,
      "u1",
      "s1",
      makeSpec({
        precheck: () => ({
          ok: false,
          status: 409,
          code: "ROUND_LIMIT",
          message: "m",
          extra: { maxRounds: 4 },
        }),
      }),
      makeDeps({ callStructured }),
    );
    expect(out).toEqual({
      kind: "precheck",
      status: 409,
      code: "ROUND_LIMIT",
      message: "m",
      extra: { maxRounds: 4 },
    });
    expect(mocks.claimGeneration).not.toHaveBeenCalled();
    expect(callStructured).not.toHaveBeenCalled();
  });

  it("다른 요청이 실행 중이면 GENERATION_RUNNING 이고 모델을 부르지 않는다", async () => {
    mocks.claimGeneration.mockResolvedValue({ kind: "running" });
    const callStructured = vi.fn();
    const out = await runGeneration(
      db,
      "u1",
      "s1",
      makeSpec(),
      makeDeps({ callStructured }),
    );
    expect(out).toMatchObject({
      kind: "claim_error",
      code: "GENERATION_RUNNING",
      attempts: null,
      terminal: false,
    });
    expect(callStructured).not.toHaveBeenCalled();
    expect(mocks.finishGeneration).not.toHaveBeenCalled();
  });

  it("세션이 닫혔으면(locked) SESSION_NOT_OPEN 이다", async () => {
    mocks.claimGeneration.mockResolvedValue({ kind: "locked" });
    const out = await runGeneration(db, "u1", "s1", makeSpec(), makeDeps());
    expect(out).toMatchObject({
      kind: "claim_error",
      code: "SESSION_NOT_OPEN",
      terminal: false,
    });
  });

  it("시도 상한이면 세션을 종결하고 차감을 되돌린 뒤 terminal 로 알린다", async () => {
    mocks.claimGeneration.mockResolvedValue({
      kind: "exhausted",
      attempts: 10,
    });
    mocks.terminateSession.mockResolvedValue({ needsReverse: true });
    const out = await runGeneration(db, "u1", "s1", makeSpec(), makeDeps());
    expect(out).toMatchObject({
      kind: "claim_error",
      code: "ATTEMPTS_EXHAUSTED",
      attempts: 10,
      terminal: true,
    });
    expect(mocks.terminateSession).toHaveBeenCalledWith(
      db,
      "s1",
      "u1",
      "topic_recommendation",
      "exhausted",
    );
    expect(mocks.reverseCredit).toHaveBeenCalledWith(db, "s1", "u1");
  });

  it("되돌릴 차감이 없으면 reverse 를 부르지 않는다", async () => {
    mocks.claimGeneration.mockResolvedValue({
      kind: "exhausted",
      attempts: 10,
    });
    await runGeneration(db, "u1", "s1", makeSpec(), makeDeps());
    expect(mocks.reverseCredit).not.toHaveBeenCalled();
  });

  it("되돌림이 던져도 응답은 막지 않는다", async () => {
    mocks.claimGeneration.mockResolvedValue({
      kind: "exhausted",
      attempts: 10,
    });
    mocks.terminateSession.mockResolvedValue({ needsReverse: true });
    mocks.reverseCredit.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await runGeneration(db, "u1", "s1", makeSpec(), makeDeps());
    expect(out).toMatchObject({ kind: "claim_error", terminal: true });
    spy.mockRestore();
  });
});

describe("runGeneration 재요청", () => {
  it("검증 실패 뒤 재요청이 성공하면 extra_attempts 1 로 닫는다", async () => {
    const callStructured = vi
      .fn()
      .mockResolvedValueOnce(reply('{"bad":1}'))
      .mockResolvedValueOnce(reply('{"n":2}'));
    const retryPrompt = vi.fn((_i: ValidationIssue[], _t: boolean) =>
      bundle("retry"),
    );
    const spec = makeSpec({ retryPrompt });
    mocks.loadSession.mockResolvedValue(generationOf(2));

    const out = await runGeneration(
      db,
      "u1",
      "s1",
      spec,
      makeDeps({ callStructured }),
    );

    expect(out).toMatchObject({ kind: "ok", attempts: 2 });
    expect(callStructured).toHaveBeenCalledTimes(2);
    expect(callStructured.mock.calls[1]?.[1]).toBe("retry");
    expect(retryPrompt).toHaveBeenCalledWith(
      [{ code: "bad", message: "나쁨" }],
      false,
    );
    expect(spec.persist).toHaveBeenCalledWith({ n: 2 }, 2);
    expect(mocks.finishGeneration).toHaveBeenCalledWith(
      db,
      "s1",
      "u1",
      "topic_recommendation",
      true,
      [],
      1,
    );
  });

  it("JSON 이 아닌 응답도 문제 목록으로 재요청한다", async () => {
    const callStructured = vi
      .fn()
      .mockResolvedValueOnce(reply("not json"))
      .mockResolvedValueOnce(reply('{"n":3}'));
    const retryPrompt = vi.fn((_i: ValidationIssue[], _t: boolean) =>
      bundle("retry"),
    );
    const out = await runGeneration(
      db,
      "u1",
      "s1",
      makeSpec({ retryPrompt }),
      makeDeps({ callStructured }),
    );
    expect(out.kind).toBe("ok");
    expect(retryPrompt.mock.calls[0]?.[0]?.[0]?.code).toBe("invalid_json");
  });

  it("MAX_TOKENS 로 잘리면 응답을 버리고 잘림 재요청 프롬프트로 다시 부른다", async () => {
    const callStructured = vi
      .fn()
      .mockResolvedValueOnce(reply('{"n":9}', "MAX_TOKENS"))
      .mockResolvedValueOnce(reply('{"n":4}'));
    const spec = makeSpec();
    const retryPrompt = vi.spyOn(spec, "retryPrompt");
    const out = await runGeneration(
      db,
      "u1",
      "s1",
      spec,
      makeDeps({ callStructured }),
    );

    expect(out.kind).toBe("ok");
    expect(callStructured.mock.calls[1]?.[1]).toBe("retry-truncated");
    expect(retryPrompt.mock.calls[0]?.[1]).toBe(true);
    expect(retryPrompt.mock.calls[0]?.[0]?.[0]?.code).toBe("truncated");
    expect(spec.persist).toHaveBeenCalledWith({ n: 4 }, 2);
  });

  it("재요청도 실패하면 validation 실패이고 세션은 열어 둔다", async () => {
    const callStructured = vi.fn().mockResolvedValue(reply('{"bad":1}'));
    mocks.loadSession.mockResolvedValue(generationOf(2));
    const spec = makeSpec();
    const out = await runGeneration(
      db,
      "u1",
      "s1",
      spec,
      makeDeps({ callStructured }),
    );

    expect(out).toMatchObject({
      kind: "failure",
      failure: "validation",
      attempts: 2,
      terminal: false,
      issues: [{ code: "bad", message: "나쁨" }],
    });
    expect(spec.persist).not.toHaveBeenCalled();
    expect(mocks.finishGeneration).toHaveBeenCalledWith(
      db,
      "s1",
      "u1",
      "topic_recommendation",
      false,
      [{ code: "bad", message: "나쁨" }],
      1,
    );
    expect(mocks.terminateSession).not.toHaveBeenCalled();
  });

  it("실패로 시도 누계가 상한에 닿으면 종결하고 되돌린다", async () => {
    const callStructured = vi.fn().mockResolvedValue(reply('{"bad":1}'));
    mocks.loadSession.mockResolvedValue(generationOf(10));
    mocks.terminateSession.mockResolvedValue({ needsReverse: true });
    const out = await runGeneration(
      db,
      "u1",
      "s1",
      makeSpec(),
      makeDeps({ callStructured }),
    );
    expect(out).toMatchObject({
      kind: "failure",
      failure: "validation",
      attempts: 10,
      terminal: true,
    });
    expect(mocks.terminateSession).toHaveBeenCalledWith(
      db,
      "s1",
      "u1",
      "topic_recommendation",
      "exhausted",
    );
    expect(mocks.reverseCredit).toHaveBeenCalledTimes(1);
  });

  it("다른 요청이 선점을 가져갔으면(finish false) 종결 판정 없이 RUNNING 으로 알린다", async () => {
    const callStructured = vi.fn().mockResolvedValue(reply('{"bad":1}'));
    mocks.finishGeneration.mockResolvedValue(false);
    mocks.loadSession.mockResolvedValue(generationOf(10));
    const out = await runGeneration(
      db,
      "u1",
      "s1",
      makeSpec(),
      makeDeps({ callStructured }),
    );
    expect(out).toMatchObject({
      kind: "claim_error",
      code: "GENERATION_RUNNING",
      terminal: false,
    });
    expect(mocks.terminateSession).not.toHaveBeenCalled();
  });
});

describe("runGeneration 모델 오류와 예산", () => {
  it("모델 호출이 던지면 upstream 실패이고 재요청하지 않는다", async () => {
    const callStructured = vi.fn().mockRejectedValue(new Error("503"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await runGeneration(
      db,
      "u1",
      "s1",
      makeSpec(),
      makeDeps({ callStructured }),
    );
    spy.mockRestore();
    expect(out).toMatchObject({
      kind: "failure",
      failure: "upstream",
      issues: [{ code: "upstream_error" }],
      terminal: false,
    });
    expect(callStructured).toHaveBeenCalledTimes(1);
    expect(mocks.finishGeneration).toHaveBeenCalledWith(
      db,
      "s1",
      "u1",
      "topic_recommendation",
      false,
      [expect.objectContaining({ code: "upstream_error" })],
      0,
    );
  });

  it("예산이 이미 바닥이면 모델을 부르지 않고 timeout 이다", async () => {
    const callStructured = vi.fn();
    const out = await runGeneration(
      db,
      "u1",
      "s1",
      makeSpec(),
      makeDeps({ callStructured, startedAt: Date.now() - 60_000 }),
    );
    expect(out).toMatchObject({ kind: "failure", failure: "timeout" });
    expect(callStructured).not.toHaveBeenCalled();
    expect(mocks.finishGeneration).toHaveBeenCalledWith(
      db,
      "s1",
      "u1",
      "topic_recommendation",
      false,
      [],
      0,
    );
  });

  it("호출이 예산 안에 끝나지 않으면 abort 신호를 보내고 timeout 이다", async () => {
    let signal: AbortSignal | undefined;
    const callStructured = vi.fn(
      (_s: string, _u: string, o?: { abortSignal?: AbortSignal }) => {
        signal = o?.abortSignal;
        return new Promise<never>(() => {});
      },
    );
    const out = await runGeneration(
      db,
      "u1",
      "s1",
      makeSpec(),
      makeDeps({
        callStructured: callStructured as never,
        startedAt: Date.now() - 49_980,
      }),
    );
    expect(out).toMatchObject({ kind: "failure", failure: "timeout" });
    expect(signal?.aborted).toBe(true);
  });
});

describe("runGeneration 저장 실패와 예외", () => {
  it("persist 가 던지면 finish(false) 로 닫고 fatal 로 즉시 종결한다", async () => {
    const callStructured = vi.fn().mockResolvedValue(reply('{"n":1}'));
    mocks.terminateSession.mockResolvedValue({ needsReverse: true });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await runGeneration(
      db,
      "u1",
      "s1",
      makeSpec({
        persist: vi.fn().mockRejectedValue(new Error("insert 실패")),
      }),
      makeDeps({ callStructured }),
    );
    spy.mockRestore();

    expect(out).toMatchObject({
      kind: "failure",
      failure: "fatal",
      terminal: true,
      issues: [{ code: "persist_failed" }],
    });
    expect(mocks.finishGeneration).toHaveBeenCalledWith(
      db,
      "s1",
      "u1",
      "topic_recommendation",
      false,
      [expect.objectContaining({ code: "persist_failed" })],
      0,
    );
    expect(mocks.terminateSession).toHaveBeenCalledWith(
      db,
      "s1",
      "u1",
      "topic_recommendation",
      "fatal",
    );
    expect(mocks.reverseCredit).toHaveBeenCalledTimes(1);
  });

  it("예상 못 한 예외가 나도 running 을 finish(false) 로 닫고 다시 던진다", async () => {
    const callStructured = vi.fn().mockResolvedValue(reply('{"n":1}'));
    const out = runGeneration(
      db,
      "u1",
      "s1",
      makeSpec({
        validate: () => {
          throw new Error("검증기 버그");
        },
      }),
      makeDeps({ callStructured }),
    );
    await expect(out).rejects.toThrow("검증기 버그");
    expect(mocks.finishGeneration).toHaveBeenCalledWith(
      db,
      "s1",
      "u1",
      "topic_recommendation",
      false,
      [expect.objectContaining({ code: "internal" })],
      0,
    );
  });
});

describe("generationErrorOf", () => {
  const generation = generationOf(0) as never;
  it("precheck 는 그대로 돌려준다", () => {
    expect(
      generationErrorOf({
        kind: "precheck",
        status: 409,
        code: "STEP_ORDER",
        message: "m",
        extra: { a: 1 },
      }),
    ).toEqual({
      status: 409,
      code: "STEP_ORDER",
      message: "m",
      extra: { a: 1 },
    });
  });

  it("선점 오류는 409 이고 terminal 과 generation 을 싣는다", () => {
    const e = generationErrorOf({
      kind: "claim_error",
      code: "ATTEMPTS_EXHAUSTED",
      attempts: 10,
      terminal: true,
      generation,
    });
    expect(e).toMatchObject({
      status: 409,
      code: "ATTEMPTS_EXHAUSTED",
      extra: { attempts: 10, terminal: true, generation },
    });
    expect(
      generationErrorOf({
        kind: "claim_error",
        code: "GENERATION_RUNNING",
        attempts: null,
        terminal: false,
        generation,
      }).status,
    ).toBe(409);
  });

  it.each([
    ["validation", 422, "GENERATION_VALIDATION_FAILED"],
    ["upstream", 502, "MODEL_UPSTREAM_FAILED"],
    ["timeout", 504, "GENERATION_TIMEOUT"],
    ["fatal", 500, "GENERATION_FATAL"],
  ] as const)("%s 실패는 %i %s", (failure, status, code) => {
    const issues = [{ code: "x", message: "m" }];
    const e = generationErrorOf({
      kind: "failure",
      failure,
      issues,
      attempts: 3,
      terminal: false,
      generation,
    });
    expect(e).toMatchObject({
      status,
      code,
      extra: { attempts: 3, issues, terminal: false, generation },
    });
  });
});

describe("retryNotesFor", () => {
  it("잘림이면 분량 축소 문구 하나만 쓴다", () => {
    expect(
      retryNotesFor([{ code: "truncated", message: "잘림" }], true),
    ).toEqual([TRUNCATED_RETRY_NOTE]);
  });

  it("아니면 문제 목록을 재요청 문구로 바꾼다", () => {
    const notes = retryNotesFor([{ code: "bad", message: "나쁨" }], false);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("나쁨");
  });
});

describe("runGeneration 재요청 중 오류", () => {
  it("재요청 호출이 던지면 upstream 실패이고 extra_attempts 는 1 이다", async () => {
    const callStructured = vi
      .fn()
      .mockResolvedValueOnce(reply('{"bad":1}'))
      .mockRejectedValueOnce(new Error("503"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await runGeneration(
      db,
      "u1",
      "s1",
      makeSpec(),
      makeDeps({ callStructured }),
    );
    spy.mockRestore();
    expect(out).toMatchObject({ kind: "failure", failure: "upstream" });
    expect(mocks.finishGeneration).toHaveBeenCalledWith(
      db,
      "s1",
      "u1",
      "topic_recommendation",
      false,
      expect.any(Array),
      1,
    );
  });
});

describe("runGeneration 계기판 기록", () => {
  type Row = Record<string, unknown>;
  const makeTelemetryDb = () => {
    const insert = vi.fn(async (_rows: unknown) => ({ error: null }));
    return {
      db: { from: vi.fn(() => ({ insert })) } as never,
      insert,
      rows: () => (insert.mock.calls[0]?.[0] ?? []) as Row[],
    };
  };
  // 실제 callStructured 처럼 호출마다 telemetry 에 한 건 기록하는 모의 모델.
  const recording = (replies: ReturnType<typeof reply>[]) => {
    const queue = [...replies];
    return vi.fn(
      async (
        _s: string,
        _u: string,
        options: {
          telemetry?: {
            recordCall: (e: {
              kind: "generate";
              model: string;
              startedAt: number;
              latencyMs: number;
              transportAttempt: number;
              status: "ok";
            }) => void;
          };
        },
      ) => {
        options.telemetry?.recordCall({
          kind: "generate",
          model: "m",
          startedAt: 0,
          latencyMs: 1,
          transportAttempt: 1,
          status: "ok",
        });
        const next = queue.shift();
        if (!next) throw new Error("응답 소진");
        return next;
      },
    );
  };

  it("재요청 경로는 1회차 failed, 2회차 ok 로 남기고 한 번만 내보낸다", async () => {
    const t = makeTelemetryDb();
    const callStructured = recording([reply('{"bad":1}'), reply('{"n":2}')]);
    const out = await runGeneration(
      t.db,
      "u1",
      "s1",
      makeSpec(),
      makeDeps({ callStructured: callStructured as never }),
    );
    expect(out.kind).toBe("ok");
    expect(t.insert).toHaveBeenCalledTimes(1);
    expect(t.rows()).toMatchObject([
      {
        service: "inquiry",
        feature: "topic_recommendation",
        target_kind: "inquiry_session",
        profile_id: "u1",
        attempt: 1,
        retry_reason: null,
        validation: "failed",
        issue_codes: ["bad"],
      },
      { attempt: 2, retry_reason: "bad", validation: "ok" },
    ]);
  });

  it("잘림 재요청은 사유가 truncated 이고 1회차는 failed truncated 다", async () => {
    const t = makeTelemetryDb();
    const callStructured = recording([
      reply('{"n":1}', "MAX_TOKENS"),
      reply('{"n":2}'),
    ]);
    await runGeneration(
      t.db,
      "u1",
      "s1",
      makeSpec(),
      makeDeps({ callStructured: callStructured as never }),
    );
    expect(t.rows()).toMatchObject([
      { validation: "failed", issue_codes: ["truncated"], retry_reason: null },
      { retry_reason: "truncated", validation: "ok" },
    ]);
  });

  it("JSON 이 아닌 응답은 파싱 문제 코드로 표시한다", async () => {
    const t = makeTelemetryDb();
    const callStructured = recording([reply("not json"), reply('{"n":2}')]);
    await runGeneration(
      t.db,
      "u1",
      "s1",
      makeSpec(),
      makeDeps({ callStructured: callStructured as never }),
    );
    expect(t.rows()[0]).toMatchObject({
      validation: "failed",
      issue_codes: ["invalid_json"],
    });
  });

  it("저장이 던져 예외로 끝나도 한 번 내보내고 예외를 던진다", async () => {
    const t = makeTelemetryDb();
    const callStructured = recording([reply('{"n":1}')]);
    mocks.finishGeneration.mockRejectedValueOnce(new Error("x"));
    await expect(
      runGeneration(
        t.db,
        "u1",
        "s1",
        makeSpec(),
        makeDeps({ callStructured: callStructured as never }),
      ),
    ).rejects.toThrow("x");
    expect(t.insert).toHaveBeenCalledTimes(1);
  });
});
