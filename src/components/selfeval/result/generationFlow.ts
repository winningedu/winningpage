import type { ApiResult } from "@/lib/selfeval/api";

// 모델을 부르는 한 단계(분석 run, 생성, 검증)의 실행 루프(순수 상태 머신).
// 성장설계 generationEngine 의 단일 단계 판이다. React 와 타이머를 주입받아 테스트한다.
//
//   idle    --start-->  running
//   running --ok------> done
//   running --STEP_RUNNING--> waiting(3초) --> running, 최대 20회 뒤 failed
//   running --ATTEMPTS_EXHAUSTED, extra.terminal--> terminal(세션 종결, 재시도 없음)
//   running --QUOTA_EXHAUSTED, NO_ENTITLEMENT, REGENERATE_EXHAUSTED--> blocked(안내만)
//   running --모델 실패, STEP_ORDER, 타임아웃, 네트워크, 그 밖--> failed
//   failed  --retry--> running

export type FlowPhase =
  | "idle"
  | "running"
  | "waiting"
  | "failed"
  | "terminal"
  | "blocked"
  | "done";

export type FlowState<T> = {
  phase: FlowPhase;
  data: T | null;
  /** 이 단계의 모델 호출 누계(서버가 알려 준 값, 상한 10). */
  attempts: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  /** 검증 실패에서 차감을 되돌렸는지. 서버가 알려 줄 때만 값이 있다. */
  reversed: boolean | null;
  /** STEP_ORDER 가 알려 준 세션의 현재 단계. */
  orderStep: number | null;
};

export type StepFlowDeps<T> = {
  run: () => Promise<ApiResult<T>>;
  sleep: (ms: number) => Promise<void>;
  onState: (state: FlowState<T>) => void;
};

export const RUNNING_RETRY_MS = 3000;
export const RUNNING_RETRY_LIMIT = 20;

const BLOCKED_CODES = new Set([
  "QUOTA_EXHAUSTED",
  "NO_ENTITLEMENT",
  "REGENERATE_EXHAUSTED",
]);

export function initialFlowState<T>(): FlowState<T> {
  return {
    phase: "idle",
    data: null,
    attempts: null,
    errorCode: null,
    errorMessage: null,
    reversed: null,
    orderStep: null,
  };
}

export function createStepFlow<T>({ run, sleep, onState }: StepFlowDeps<T>) {
  let disposed = false;
  let busy = false;
  let state = initialFlowState<T>();

  function set(patch: Partial<FlowState<T>>) {
    if (disposed) return;
    state = { ...state, ...patch };
    onState(state);
  }

  async function loop() {
    busy = true;
    let waits = 0;
    try {
      while (!disposed) {
        set({
          phase: "running",
          errorCode: null,
          errorMessage: null,
          reversed: null,
          orderStep: null,
        });
        const result = await run();
        if (disposed) return;

        if (result.kind === "ok") {
          set({ phase: "done", data: result.data });
          return;
        }
        if (result.kind === "timeout") {
          set({ phase: "failed", errorCode: "TIMEOUT", errorMessage: null });
          return;
        }

        const extra = result.extra ?? {};
        const attempts =
          typeof extra.attempts === "number" ? extra.attempts : state.attempts;
        const failure = {
          attempts,
          errorCode: result.code,
          errorMessage: result.message,
        };

        if (result.code === "STEP_RUNNING") {
          waits += 1;
          if (waits > RUNNING_RETRY_LIMIT) {
            set({ phase: "failed", ...failure });
            return;
          }
          set({ phase: "waiting" });
          await sleep(RUNNING_RETRY_MS);
          continue;
        }
        if (result.code === "ATTEMPTS_EXHAUSTED" || extra.terminal === true) {
          set({ phase: "terminal", ...failure });
          return;
        }
        if (BLOCKED_CODES.has(result.code)) {
          set({ phase: "blocked", ...failure });
          return;
        }
        set({
          phase: "failed",
          ...failure,
          reversed: typeof extra.reversed === "boolean" ? extra.reversed : null,
          orderStep:
            result.code === "STEP_ORDER" &&
            typeof extra.currentStep === "number"
              ? extra.currentStep
              : null,
        });
        return;
      }
    } finally {
      busy = false;
    }
  }

  return {
    async start() {
      if (busy || disposed) return;
      await loop();
    },
    /** failed 에서만 같은 호출을 다시 보낸다. terminal, blocked, 진행 중에는 아무것도 하지 않는다. */
    async retry() {
      if (busy || state.phase !== "failed") return;
      await loop();
    },
    dispose() {
      disposed = true;
    },
  };
}
