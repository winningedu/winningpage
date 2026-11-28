// 리포트 생성 실행기(명세 No.133, 138, 173, 201). finalize 뒤에 불리며 최종 저장은 건드리지 않는다.
// 같은 final 리비전은 한 번만 만든다(재요청은 저장본을 돌려준다). 문장이 비었거나 실패한 리포트의
// 다시 만들기는 같은 리비전 안에서 고정된 꼬리표를 그대로 쓴다.
// 동시 요청은 claimed_at 을 조건으로 한 선점(claim)으로 막고, 선점하지 못하면 모델을 부르지 않는다.

import { startEarly } from "../../../../src/lib/concurrency/startEarly.js";
import type {
  ReportPayload,
  ReportTagMap,
  ReportViewStatus,
} from "../../../../src/lib/selfeval/reportTypes.js";
import type { callStructured } from "../../ai/gemini.js";
import type { AiTrace } from "../../ai/telemetry/trace.js";
import { STEP_BUDGET_MS } from "../types.js";
import { buildReport } from "./build.js";
import { composeTexts } from "./compose.js";
import type { BuildInput } from "./inputs.js";

export type StoredReport = {
  sessionId: string;
  finalRevision: number;
  /** 만들지 못한 리포트(failed)는 null. */
  payload: ReportPayload | null;
  tagMap: ReportTagMap;
  status: ReportViewStatus;
  attempts: number;
  builtAt: string;
};

export type ReportStore = {
  read(): Promise<StoredReport | null>;
  /**
   * 만들기 권한을 잡는다. 저장본이 없으면 자리표시 행을 넣고, 있으면 built_at 이 읽은 값 그대로이고
   * 선점 시각이 비었거나 단계 예산보다 오래됐을 때만 갱신한다. 리비전이 바뀐 저장본은 자리표시로 바꾼다. 못 잡으면 false.
   */
  claim(args: {
    finalRevision: number;
    existing: StoredReport | null;
    claimedAt: string;
  }): Promise<boolean>;
  /** 선점한 claimed_at 이 그대로일 때만 결과를 쓰고 선점을 푼다. */
  finish(claimedAt: string, row: StoredReport): Promise<boolean>;
};

export type LoadedInput = {
  input: Omit<BuildInput, "tagMap">;
  finalRevision: number;
};

export type RunDeps = {
  sessionId: string;
  /** 최종본이 없으면 null. */
  load: () => Promise<LoadedInput | null>;
  store: ReportStore;
  callStructured: typeof callStructured;
  now: () => string;
  trace?: AiTrace;
};

export type RunOutcome =
  | { kind: "ok"; report: StoredReport; reused: boolean }
  | { kind: "no_final" }
  | { kind: "busy" }
  | { kind: "failed" };

const isComplete = (r: StoredReport) =>
  r.status === "ready" &&
  r.payload !== null &&
  !r.payload.composeMissing &&
  !r.payload.composePartial;

export async function runReport(deps: RunDeps): Promise<RunOutcome> {
  const { sessionId } = deps;
  // 저장된 리포트 읽기는 입력 읽기와 서로 기다릴 필요가 없다. 입력 읽기가 먼저 응답을 정하면 이 결과는 쓰지 않는다.
  const existingRead = startEarly(deps.store.read());
  let loaded: LoadedInput | null;
  try {
    loaded = await deps.load();
  } catch (e) {
    console.error("selfeval 리포트 입력 읽기 실패:", e);
    return { kind: "failed" };
  }
  if (loaded === null) return { kind: "no_final" };
  const { finalRevision } = loaded;
  const existing = await existingRead;
  const same = existing !== null && existing.finalRevision === finalRevision;
  if (same && isComplete(existing)) {
    return { kind: "ok", report: existing, reused: true };
  }

  const claimedAt = deps.now();
  if (!(await deps.store.claim({ finalRevision, existing, claimedAt }))) {
    return { kind: "busy" };
  }

  let attempts = same ? existing.attempts : 0;
  try {
    const input: BuildInput = {
      ...loaded.input,
      tagMap: same ? existing.tagMap : null,
    };
    const first = buildReport(input, null);
    const outcome = await composeTexts({
      needs: first.needs,
      attemptsSoFar: attempts,
      callStructured: deps.callStructured,
      trace: deps.trace,
      signal: AbortSignal.timeout(STEP_BUDGET_MS),
    });
    attempts += outcome.attempts;
    // 문장이 비면 코드 값만으로 그린다. 꼬리표는 첫 조립 값을 그대로 고정한다.
    const built =
      outcome.kind === "ok"
        ? buildReport({ ...input, tagMap: first.tagMap }, outcome.texts)
        : first;
    const row: StoredReport = {
      sessionId,
      finalRevision,
      payload: built.payload,
      tagMap: built.tagMap,
      status: "ready",
      attempts,
      builtAt: deps.now(),
    };
    if (!(await deps.store.finish(claimedAt, row))) return { kind: "busy" };
    return { kind: "ok", report: row, reused: false };
  } catch (e) {
    console.error("selfeval 리포트 생성 실패:", e);
    // 이미 만든 같은 리비전의 저장본은 지우지 않는다.
    const row: StoredReport =
      same && existing.payload !== null
        ? { ...existing, status: "ready", attempts, builtAt: deps.now() }
        : {
            sessionId,
            finalRevision,
            payload: null,
            tagMap: {},
            status: "failed",
            attempts,
            builtAt: deps.now(),
          };
    try {
      await deps.store.finish(claimedAt, row);
    } catch (inner) {
      console.error("selfeval 리포트 실패 기록 중 오류(무시):", inner);
    }
    return { kind: "failed" };
  }
}
