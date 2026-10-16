import { describe, expect, test, vi } from "vitest";
import type { ApiResult } from "@/lib/selfeval/api";
import {
  createStepFlow,
  type FlowState,
  RUNNING_RETRY_LIMIT,
  RUNNING_RETRY_MS,
} from "./generationFlow";

const ok = <T>(data: T): ApiResult<T> => ({ kind: "ok", data });
const err = (
  code: string,
  extra?: Record<string, unknown>,
  status = 409,
): ApiResult<never> => ({
  kind: "error",
  status,
  code,
  message: `m-${code}`,
  ...(extra ? { extra } : {}),
});

function setup(results: ApiResult<string>[]) {
  const states: FlowState<string>[] = [];
  const queue = [...results];
  const run = vi.fn(async () => queue.shift() as ApiResult<string>);
  const sleep = vi.fn(async () => {});
  const flow = createStepFlow<string>({
    run,
    sleep,
    onState: (s) => states.push(s),
  });
  return {
    flow,
    run,
    sleep,
    states,
    last: () => states.at(-1) as FlowState<string>,
  };
}

describe("createStepFlow", () => {
  test("성공하면 running 을 거쳐 done 과 응답 데이터를 남긴다", async () => {
    const t = setup([ok("본문")]);
    await t.flow.start();
    expect(t.states[0]?.phase).toBe("running");
    expect(t.last()).toMatchObject({ phase: "done", data: "본문" });
  });

  test("STEP_RUNNING 은 3초 기다린 뒤 같은 호출을 다시 보낸다", async () => {
    const t = setup([err("STEP_RUNNING"), ok("본문")]);
    await t.flow.start();
    expect(t.sleep).toHaveBeenCalledWith(RUNNING_RETRY_MS);
    expect(t.run).toHaveBeenCalledTimes(2);
    expect(t.states.some((s) => s.phase === "waiting")).toBe(true);
    expect(t.last().phase).toBe("done");
  });

  test("STEP_RUNNING 이 상한을 넘으면 failed 로 멈춘다", async () => {
    const t = setup(
      Array.from({ length: RUNNING_RETRY_LIMIT + 1 }, () =>
        err("STEP_RUNNING"),
      ),
    );
    await t.flow.start();
    expect(t.run).toHaveBeenCalledTimes(RUNNING_RETRY_LIMIT + 1);
    expect(t.last()).toMatchObject({
      phase: "failed",
      errorCode: "STEP_RUNNING",
    });
  });

  test("모델 실패는 failed 로 멈추고 시도 횟수와 되돌림 여부를 싣는다", async () => {
    const t = setup([
      err("STEP_VALIDATION_FAILED", { attempts: 3, reversed: true }, 422),
    ]);
    await t.flow.start();
    expect(t.last()).toMatchObject({
      phase: "failed",
      attempts: 3,
      reversed: true,
      errorCode: "STEP_VALIDATION_FAILED",
      errorMessage: "m-STEP_VALIDATION_FAILED",
    });
  });

  test("retry 는 failed 에서만 같은 호출을 다시 보낸다", async () => {
    const t = setup([
      err("MODEL_UPSTREAM_FAILED", { attempts: 1 }, 502),
      ok("본문"),
    ]);
    await t.flow.start();
    await t.flow.retry();
    expect(t.last()).toMatchObject({ phase: "done", data: "본문" });
    await t.flow.retry();
    expect(t.run).toHaveBeenCalledTimes(2);
  });

  test("ATTEMPTS_EXHAUSTED 나 terminal 실패는 terminal 로 끝난다", async () => {
    const a = setup([err("ATTEMPTS_EXHAUSTED", { terminal: true })]);
    await a.flow.start();
    expect(a.last().phase).toBe("terminal");
    const b = setup([
      err("STEP_TIMEOUT", { attempts: 10, terminal: true }, 504),
    ]);
    await b.flow.start();
    expect(b.last().phase).toBe("terminal");
    await b.flow.retry();
    expect(b.run).toHaveBeenCalledTimes(1);
  });

  test("이용권과 횟수 한도는 blocked 로 코드를 남긴다", async () => {
    for (const code of [
      "QUOTA_EXHAUSTED",
      "NO_ENTITLEMENT",
      "REGENERATE_EXHAUSTED",
    ]) {
      const t = setup([err(code, undefined, 403)]);
      await t.flow.start();
      expect(t.last()).toMatchObject({ phase: "blocked", errorCode: code });
    }
  });

  test("STEP_ORDER 는 서버가 알려 준 단계를 남기고 failed 로 멈춘다", async () => {
    const t = setup([err("STEP_ORDER", { currentStep: 3 })]);
    await t.flow.start();
    expect(t.last()).toMatchObject({ phase: "failed", orderStep: 3 });
  });

  test("타임아웃과 네트워크 오류는 failed 이고 코드를 구분한다", async () => {
    const a = setup([{ kind: "timeout" }]);
    await a.flow.start();
    expect(a.last()).toMatchObject({ phase: "failed", errorCode: "TIMEOUT" });
    const b = setup([err("NETWORK", undefined, 0)]);
    await b.flow.start();
    expect(b.last()).toMatchObject({ phase: "failed", errorCode: "NETWORK" });
  });

  test("dispose 뒤에는 상태를 더 올리지 않는다", async () => {
    const t = setup([ok("본문")]);
    t.flow.dispose();
    await t.flow.start();
    expect(t.states).toHaveLength(0);
  });
});
