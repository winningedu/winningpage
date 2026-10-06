import type {
  ApiResult,
  ReportStepRequest,
  ReportStepResponse,
  ReportsList,
  StepProgress,
} from "@/lib/growth/api";
import { STEP_COUNT } from "./stepLabels";

// 리포트 생성 루프(순수 상태 머신). React 와 타이머, 네트워크를 주입받아 테스트한다.
// 화면은 useReportGeneration 으로 감싸 쓴다.
//
// 상태 전이
//   idle     --start-->  running(첫 미완 단계)
//   running  --ok------> running(nextStep) | done(nextStep null 또는 completion)
//   running  --STEP_RUNNING--> waiting(3초) --> running(같은 단계), 최대 20회 뒤 failed
//   running  --STEP_VALIDATION_FAILED / MODEL_UPSTREAM_FAILED / STEP_TIMEOUT-->
//            terminal(extra.terminal) | failed(retry 로 같은 단계 재호출)
//   running  --ATTEMPTS_EXHAUSTED / REPORT_LOCKED / STEP_FATAL--> terminal
//   running  --NO_ENTITLEMENT--> failed(errorCode 로 이용권 안내)
//   running  --STEP_ORDER--> 목록 재조회 뒤 첫 미완 단계부터 running
//   running  --STEP_SUPERSEDED--> 1초 뒤 목록 재조회, 이어서 running 또는 done
//   running  --네트워크, 타임아웃, 그 밖의 오류--> failed
//   failed   --retry--> running(같은 단계)
//   failed, idle --sync--> 목록의 open.progress 로 진행 갱신(크론이 이어갔을 수 있다)

export type GenerationPhase =
  | "idle"
  | "running"
  | "waiting"
  | "failed"
  | "terminal"
  | "done";

export type GenerationState = {
  phase: GenerationPhase;
  progress: StepProgress[];
  /** 지금 실행 중이거나 멈춘 단계(1~8). */
  currentStep: number;
  /** 현재 단계의 모델 호출 누계(상한 10). */
  attempts: number;
  issues: unknown;
  /** 마지막 실패의 서버 코드. 네트워크는 NETWORK, 타임아웃은 TIMEOUT. */
  errorCode: string | null;
  errorMessage: string | null;
  charged: boolean | null;
  completion: { issuedAt: string; planItemCount: number } | null;
};

export type GenerationEngineDeps = {
  reportId: string;
  initialProgress: StepProgress[];
  runStep: (req: ReportStepRequest) => Promise<ApiResult<ReportStepResponse>>;
  fetchOpen: () => Promise<ApiResult<ReportsList>>;
  sleep: (ms: number) => Promise<void>;
  onState: (state: GenerationState) => void;
};

export const RUNNING_RETRY_MS = 3000;
export const RUNNING_RETRY_LIMIT = 20;
export const SUPERSEDED_WAIT_MS = 1000;
export const ORDER_RETRY_LIMIT = 3;

export function firstPendingStep(progress: StepProgress[]): number | null {
  for (let step = 1; step <= STEP_COUNT; step++) {
    const found = progress.find((p) => p.step === step);
    if (found?.status !== "done") return step;
  }
  return null;
}

const MODEL_FAILURE_CODES = new Set([
  "STEP_VALIDATION_FAILED",
  "MODEL_UPSTREAM_FAILED",
  "STEP_TIMEOUT",
]);
const TERMINAL_CODES = new Set([
  "ATTEMPTS_EXHAUSTED",
  "REPORT_LOCKED",
  "STEP_FATAL",
]);

function readFailureExtra(extra: Record<string, unknown> | undefined): {
  attempts?: number;
  issues?: unknown;
  progress?: StepProgress[];
  terminal?: boolean;
} {
  if (!extra) return {};
  const out: ReturnType<typeof readFailureExtra> = {};
  if (typeof extra.attempts === "number") out.attempts = extra.attempts;
  if ("issues" in extra) out.issues = extra.issues;
  if (Array.isArray(extra.progress)) {
    out.progress = extra.progress as StepProgress[];
  }
  if (extra.terminal === true) out.terminal = true;
  return out;
}

function failureOf(result: ApiResult<ReportStepResponse>) {
  if (result.kind === "timeout") {
    return { errorCode: "TIMEOUT", errorMessage: null };
  }
  if (result.kind === "error") {
    return { errorCode: result.code, errorMessage: result.message };
  }
  return { errorCode: null, errorMessage: null };
}

export function createGenerationEngine(deps: GenerationEngineDeps) {
  const { reportId, runStep, fetchOpen, sleep, onState } = deps;
  let disposed = false;
  let busy = false;

  let state: GenerationState = {
    phase: "idle",
    progress: deps.initialProgress,
    currentStep: firstPendingStep(deps.initialProgress) ?? STEP_COUNT,
    attempts: 0,
    issues: null,
    errorCode: null,
    errorMessage: null,
    charged: null,
    completion: null,
  };

  function set(patch: Partial<GenerationState>) {
    if (disposed) return;
    state = { ...state, ...patch };
    onState(state);
  }

  /** 목록 응답의 open.progress. 조회 실패나 open 없음이면 null. */
  async function readOpenProgress(): Promise<StepProgress[] | null> {
    const result = await fetchOpen();
    if (result.kind !== "ok" || !result.data.open) return null;
    if (result.data.open.id !== reportId) return null;
    return result.data.open.progress;
  }

  async function loop(startStep: number) {
    busy = true;
    let step = startStep;
    let runningRetries = 0;
    let orderRetries = 0;
    try {
      while (!disposed) {
        set({
          phase: "running",
          currentStep: step,
          errorCode: null,
          errorMessage: null,
        });
        const result = await runStep({ reportId, step });
        if (disposed) return;

        if (result.kind === "ok") {
          const data = result.data;
          runningRetries = 0;
          set({
            progress: data.progress,
            attempts: data.attempts,
            issues: null,
            charged: data.charged ?? state.charged,
          });
          if (data.completion || data.nextStep === null) {
            set({ phase: "done", completion: data.completion ?? null });
            return;
          }
          step = data.nextStep;
          continue;
        }

        if (result.kind === "error" && result.code === "STEP_RUNNING") {
          runningRetries += 1;
          if (runningRetries > RUNNING_RETRY_LIMIT) {
            set({
              phase: "failed",
              errorCode: result.code,
              errorMessage: result.message,
            });
            return;
          }
          set({ phase: "waiting" });
          await sleep(RUNNING_RETRY_MS);
          continue;
        }

        if (
          result.kind === "error" &&
          (result.code === "STEP_ORDER" || result.code === "STEP_SUPERSEDED")
        ) {
          if (result.code === "STEP_ORDER") {
            orderRetries += 1;
            if (orderRetries > ORDER_RETRY_LIMIT) {
              set({ phase: "failed", ...failureOf(result) });
              return;
            }
          } else {
            set({ phase: "waiting" });
            await sleep(SUPERSEDED_WAIT_MS);
            if (disposed) return;
          }
          const progress = await readOpenProgress();
          if (disposed) return;
          if (!progress) {
            set({ phase: "failed", ...failureOf(result) });
            return;
          }
          set({ progress });
          const next = firstPendingStep(progress);
          if (next === null) {
            set({ phase: "done" });
            return;
          }
          step = next;
          continue;
        }

        if (result.kind === "error") {
          const extra = readFailureExtra(result.extra);
          if (extra.progress) set({ progress: extra.progress });
          if (extra.attempts !== undefined) set({ attempts: extra.attempts });
          if (MODEL_FAILURE_CODES.has(result.code)) {
            set({ issues: extra.issues ?? null });
          }
          if (
            TERMINAL_CODES.has(result.code) ||
            (MODEL_FAILURE_CODES.has(result.code) && extra.terminal === true)
          ) {
            set({ phase: "terminal", ...failureOf(result) });
            return;
          }
        }

        set({ phase: "failed", ...failureOf(result) });
        return;
      }
    } finally {
      busy = false;
    }
  }

  return {
    /** failed 에서 같은 단계를 다시 호출한다. terminal, done, 진행 중에는 아무것도 하지 않는다. */
    async retry() {
      if (busy || state.phase !== "failed") return;
      await loop(state.currentStep);
    },
    /** 페이지가 다시 보일 때 호출한다. 실행 중이 아니면 서버 진행을 읽어 맞춘다(크론이 이어갔을 수 있다). */
    async sync() {
      if (busy || state.phase === "terminal" || state.phase === "done") return;
      const progress = await readOpenProgress();
      if (disposed || busy || !progress) return;
      const next = firstPendingStep(progress);
      if (next === null) {
        set({ progress, phase: "done" });
        return;
      }
      set({ progress, currentStep: next });
    },
    async start() {
      if (busy) return;
      const step = firstPendingStep(state.progress);
      if (step === null) {
        set({ phase: "done" });
        return;
      }
      await loop(step);
    },
    dispose() {
      disposed = true;
    },
  };
}
