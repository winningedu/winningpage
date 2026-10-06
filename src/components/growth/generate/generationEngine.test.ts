import { describe, expect, test, vi } from "vitest";
import type {
  ApiResult,
  ReportStepResponse,
  ReportsList,
  StepProgress,
} from "@/lib/growth/api";
import {
  createGenerationEngine,
  type GenerationState,
} from "./generationEngine";

const REPORT_ID = "r1";

function progressOf(done: number): StepProgress[] {
  return Array.from({ length: 8 }, (_, i) => ({
    step: i + 1,
    label: `단계${i + 1}`,
    status: i < done ? "done" : "pending",
    attempts: i < done ? 1 : 0,
  }));
}

function okStep(
  step: number,
  extra: Partial<ReportStepResponse> = {},
): ApiResult<ReportStepResponse> {
  return {
    kind: "ok",
    data: {
      ok: true,
      reportId: REPORT_ID,
      step,
      result: "ok",
      attempts: 1,
      nextStep: step < 8 ? step + 1 : null,
      progress: progressOf(step),
      ...extra,
    },
  };
}

function errStep(
  code: string,
  extra?: Record<string, unknown>,
  status = 409,
): ApiResult<ReportStepResponse> {
  return {
    kind: "error",
    status,
    code,
    message: code,
    ...(extra ? { extra } : {}),
  };
}

function openList(done: number): ApiResult<ReportsList> {
  return {
    kind: "ok",
    data: {
      ok: true,
      items: [],
      archivedCount: 0,
      lastTerminal: null,
      open: {
        id: REPORT_ID,
        status: "in_progress",
        currentStep: done,
        track: null,
        progress: progressOf(done),
        nextStep: done < 8 ? done + 1 : null,
        terminal: null,
        lastActivityAt: "2026-10-06T00:00:00Z",
      },
    },
  };
}

function setup(
  script: ApiResult<ReportStepResponse>[],
  opts: { initialDone?: number; open?: ApiResult<ReportsList>[] } = {},
) {
  const calls: number[] = [];
  const queue = [...script];
  const runStep = vi.fn(
    async ({ step }: { reportId: string; step: number }) => {
      calls.push(step);
      const next = queue.shift();
      if (!next) throw new Error(`스크립트 소진: step ${step}`);
      return next;
    },
  );
  const openQueue = [...(opts.open ?? [])];
  const fetchOpen = vi.fn(async () => {
    const next = openQueue.shift();
    if (!next) throw new Error("open 스크립트 소진");
    return next;
  });
  const sleeps: number[] = [];
  const sleep = vi.fn(async (ms: number) => {
    sleeps.push(ms);
  });
  const states: GenerationState[] = [];
  const engine = createGenerationEngine({
    reportId: REPORT_ID,
    initialProgress: progressOf(opts.initialDone ?? 0),
    runStep,
    fetchOpen,
    sleep,
    onState: (s) => states.push(s),
  });
  return { engine, calls, sleeps, states, runStep, fetchOpen };
}

describe("generationEngine", () => {
  test("1단계부터 8단계까지 순차 호출하고 completion 을 받으면 done 이 된다", async () => {
    const script = Array.from({ length: 8 }, (_, i) =>
      i === 7
        ? okStep(8, { completion: { issuedAt: "t", planItemCount: 5 } })
        : okStep(i + 1, i === 0 ? { charged: true } : {}),
    );
    const { engine, calls, states } = setup(script);

    await engine.start();

    expect(calls).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const last = states.at(-1);
    expect(last?.phase).toBe("done");
    expect(last?.charged).toBe(true);
    expect(last?.completion).toEqual({ issuedAt: "t", planItemCount: 5 });
    expect(
      states.some((s) => s.phase === "running" && s.currentStep === 3),
    ).toBe(true);
  });

  test("끝난 단계는 건너뛰고 ok 가 아닌 첫 단계부터 시작한다", async () => {
    const { engine, calls } = setup(
      [okStep(4), okStep(5, { nextStep: null })],
      {
        initialDone: 3,
      },
    );

    await engine.start();

    expect(calls).toEqual([4, 5]);
  });

  test("STEP_RUNNING 은 3초 뒤 같은 단계를 다시 부르고 waiting 을 거친다", async () => {
    const { engine, calls, sleeps, states } = setup([
      errStep("STEP_RUNNING"),
      errStep("STEP_RUNNING"),
      okStep(1, { nextStep: null }),
    ]);

    await engine.start();

    expect(calls).toEqual([1, 1, 1]);
    expect(sleeps).toEqual([3000, 3000]);
    expect(states.some((s) => s.phase === "waiting")).toBe(true);
    expect(states.at(-1)?.phase).toBe("done");
  });

  test("STEP_RUNNING 이 21번째면 failed 로 멈춘다", async () => {
    const script = Array.from({ length: 21 }, () => errStep("STEP_RUNNING"));
    const { engine, calls, states } = setup(script);

    await engine.start();

    expect(calls).toHaveLength(21);
    expect(states.at(-1)?.phase).toBe("failed");
    expect(states.at(-1)?.errorCode).toBe("STEP_RUNNING");
  });

  test("검증 실패는 attempts 와 issues 를 남기고 failed 로 멈추며 retry 로 같은 단계를 다시 부른다", async () => {
    const { engine, calls, states } = setup([
      okStep(1),
      errStep(
        "STEP_VALIDATION_FAILED",
        { attempts: 3, issues: ["근거 활동 누락"], progress: progressOf(1) },
        422,
      ),
      okStep(2, { nextStep: null }),
    ]);

    await engine.start();

    const failed = states.at(-1);
    expect(failed?.phase).toBe("failed");
    expect(failed?.currentStep).toBe(2);
    expect(failed?.attempts).toBe(3);
    expect(failed?.issues).toEqual(["근거 활동 누락"]);
    expect(calls).toEqual([1, 2]);

    await engine.retry();

    expect(calls).toEqual([1, 2, 2]);
    expect(states.at(-1)?.phase).toBe("done");
    expect(states.at(-1)?.issues).toBeNull();
  });

  test.each([
    ["STEP_VALIDATION_FAILED", 422],
    ["MODEL_UPSTREAM_FAILED", 502],
    ["STEP_TIMEOUT", 504],
  ])(
    "%s 에 terminal 이 실리면 terminal 이고 retry 해도 호출하지 않는다",
    async (code, status) => {
      const { engine, calls, states } = setup([
        errStep(code, { attempts: 10, terminal: true }, status),
      ]);

      await engine.start();
      await engine.retry();

      expect(states.at(-1)?.phase).toBe("terminal");
      expect(states.at(-1)?.attempts).toBe(10);
      expect(calls).toEqual([1]);
    },
  );

  test.each(["ATTEMPTS_EXHAUSTED", "STEP_FATAL"])(
    "%s 는 terminal 이다",
    async (code) => {
      const { engine, states } = setup([errStep(code)]);
      await engine.start();
      expect(states.at(-1)?.phase).toBe("terminal");
      expect(states.at(-1)?.errorCode).toBe(code);
    },
  );

  test("REPORT_LOCKED 인데 목록에 이 회차가 완료로 있으면 done 으로 본다", async () => {
    const done: ApiResult<ReportsList> = {
      kind: "ok",
      data: {
        ok: true,
        open: null,
        archivedCount: 0,
        lastTerminal: null,
        items: [
          {
            id: REPORT_ID,
            status: "completed",
            track: null,
            issuedAt: "2026-10-06T00:00:00Z",
            theme: null,
            lastActivityAt: "2026-10-06T00:00:00Z",
            plan: null,
          },
        ],
      },
    };
    const { engine, states, fetchOpen } = setup([errStep("REPORT_LOCKED")], {
      open: [done],
    });
    await engine.start();
    expect(fetchOpen).toHaveBeenCalledTimes(1);
    expect(states.at(-1)?.phase).toBe("done");
  });

  test("REPORT_LOCKED 이고 목록에 완료 회차가 없거나 조회가 실패하면 terminal 이다", async () => {
    const empty: ApiResult<ReportsList> = {
      kind: "ok",
      data: {
        ok: true,
        open: null,
        archivedCount: 0,
        lastTerminal: null,
        items: [],
      },
    };
    for (const lookup of [empty, { kind: "timeout" } as const]) {
      const { engine, states } = setup([errStep("REPORT_LOCKED")], {
        open: [lookup],
      });
      await engine.start();
      expect(states.at(-1)?.phase).toBe("terminal");
      expect(states.at(-1)?.errorCode).toBe("REPORT_LOCKED");
    }
  });

  test("NO_ENTITLEMENT, 네트워크 오류, 타임아웃은 failed 이고 코드를 남긴다", async () => {
    for (const [result, code] of [
      [errStep("NO_ENTITLEMENT", undefined, 403), "NO_ENTITLEMENT"],
      [errStep("NETWORK", undefined, 0), "NETWORK"],
      [{ kind: "timeout" } as const, "TIMEOUT"],
    ] as const) {
      const { engine, states } = setup([result]);
      await engine.start();
      expect(states.at(-1)?.phase).toBe("failed");
      expect(states.at(-1)?.errorCode).toBe(code);
    }
  });

  test("STEP_ORDER 는 목록을 다시 읽어 첫 미완 단계부터 이어간다", async () => {
    const { engine, calls, fetchOpen, states } = setup(
      [errStep("STEP_ORDER"), okStep(4, { nextStep: null })],
      { open: [openList(3)] },
    );

    await engine.start();

    expect(fetchOpen).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([1, 4]);
    expect(states.at(-1)?.phase).toBe("done");
  });

  test("STEP_SUPERSEDED 는 1초 뒤 목록을 다시 읽고 이어간다", async () => {
    const { engine, calls, sleeps } = setup(
      [errStep("STEP_SUPERSEDED"), okStep(2, { nextStep: null })],
      { open: [openList(1)] },
    );

    await engine.start();

    expect(sleeps).toEqual([1000]);
    expect(calls).toEqual([1, 2]);
  });

  test("STEP_SUPERSEDED 뒤 목록이 모두 끝났으면 호출 없이 done 이다", async () => {
    const { engine, calls, states } = setup([errStep("STEP_SUPERSEDED")], {
      open: [openList(8)],
    });

    await engine.start();

    expect(calls).toEqual([1]);
    expect(states.at(-1)?.phase).toBe("done");
  });

  test("목록 재조회가 실패하면 failed 로 멈춘다", async () => {
    const { engine, states } = setup([errStep("STEP_ORDER")], {
      open: [
        errStep("NETWORK", undefined, 0) as unknown as ApiResult<ReportsList>,
      ],
    });

    await engine.start();

    expect(states.at(-1)?.phase).toBe("failed");
  });

  test("sync 는 failed 에서 open.progress 로 진행을 갱신하되 다시 시작하지 않는다", async () => {
    const { engine, calls, states } = setup(
      [errStep("MODEL_UPSTREAM_FAILED", { attempts: 2 }, 502)],
      { open: [openList(2)] },
    );
    await engine.start();

    await engine.sync();

    const last = states.at(-1);
    expect(last?.phase).toBe("failed");
    expect(last?.currentStep).toBe(3);
    expect(last?.progress.filter((p) => p.status === "done")).toHaveLength(2);
    expect(calls).toEqual([1]);
  });

  test("sync 는 크론이 8단계까지 끝냈으면 done 으로 바꾼다", async () => {
    const { engine, states } = setup(
      [errStep("STEP_TIMEOUT", undefined, 504)],
      {
        open: [openList(8)],
      },
    );
    await engine.start();

    await engine.sync();

    expect(states.at(-1)?.phase).toBe("done");
  });

  test("sync 는 running 이나 terminal 에서는 조회하지 않는다", async () => {
    const { engine, fetchOpen } = setup([errStep("ATTEMPTS_EXHAUSTED")]);
    await engine.start();

    await engine.sync();

    expect(fetchOpen).not.toHaveBeenCalled();
  });

  test("dispose 뒤에는 상태를 더 내보내지 않는다", async () => {
    const { engine, states, calls } = setup([okStep(1), okStep(2)]);
    const run = engine.start();
    engine.dispose();
    await run;

    expect(calls).toEqual([1]);
    expect(states.filter((s) => s.currentStep === 2)).toHaveLength(0);
  });
});
