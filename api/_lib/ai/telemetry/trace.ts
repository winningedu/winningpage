// AI 호출 계기판 기록 계층. 한 요청 안의 모델 호출과 검색을 메모리에 모았다가
// 응답 직전에 한 번 DB 로 내보낸다. 기록은 부가 기능이라 어떤 실패도 요청을 막지 않는다.

import { randomUUID as nodeRandomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../../src/types/database.types.js";

export type AiService =
  | "performance"
  | "growth"
  | "inquiry"
  | "selfeval"
  | "goal";

export type AiTraceContext = {
  service: AiService;
  feature: string;
  step?: string | null;
  targetKind?: string | null;
  targetId?: string | null;
  profileId?: string | null;
  promptVersion?: string | null;
};

type Nullable<T> = T | null | undefined;

export type AiCallEntry = {
  kind: "generate" | "embed";
  model: string;
  startedAt: number;
  latencyMs: number;
  transportAttempt: number;
  status: "ok" | "error";
  errorCode?: string | null;
  errorMessage?: string | null;
  finishReason?: string | null;
  usage?: {
    promptTokens?: Nullable<number>;
    outputTokens?: Nullable<number>;
    cachedTokens?: Nullable<number>;
    thoughtsTokens?: Nullable<number>;
    totalTokens?: Nullable<number>;
  };
  inputChars?: number | null;
  outputChars?: number | null;
};

export type AiSearchEntry = {
  kind: "knowledge" | "student_history";
  knowledgeType?: string | null;
  threshold?: number | null;
  matchCountRequested?: number | null;
  rawHits?: number | null;
  packedHits?: number | null;
  topScore?: number | null;
  source?: "hybrid" | "vector" | "keyword" | "none" | null;
  degraded: boolean;
  injectedChars?: number | null;
  embedMs?: number | null;
  startedAt: number;
  latencyMs: number;
  status: "ok" | "error";
  errorMessage?: string | null;
  hitResourceIds?: string[] | null;
};

type ModelCallRow = Database["public"]["Tables"]["ai_model_calls"]["Insert"];
type RetrievalRow =
  Database["public"]["Tables"]["ai_retrieval_events"]["Insert"];

/** fork 로 만든 호출 단위 핸들이 부모 ctx 위에 덮어쓸 값. */
export type AiTraceForkMeta = {
  step?: string | null;
  callKey?: string | null;
  attempt?: number;
  retryReason?: string | null;
};

export type AiTrace = {
  readonly traceId: string;
  readonly attempt: number;
  /** 부모는 자식 것까지 모든 행, 자식은 자기가 기록한 행이다. */
  readonly calls: readonly ModelCallRow[];
  readonly searches: readonly RetrievalRow[];
  beginAttempt(reason: string | null): void;
  recordCall(entry: AiCallEntry): void;
  annotateLastCall(a: {
    validation: "ok" | "failed";
    issueCodes?: string[];
  }): void;
  recordSearch(entry: AiSearchEntry): void;
  recordCitations(resourceIds: string[]): void;
  /**
   * 동시에 도는 호출 하나를 위한 자식 핸들. 자식 행은 부모 행 목록에 함께 쌓이고,
   * 자식의 annotateLastCall 은 그 자식이 기록한 행에만 닿는다.
   */
  fork(meta: AiTraceForkMeta): AiTrace;
  flush(
    db: SupabaseClient<Database>,
    opts?: { timeoutMs?: number },
  ): Promise<{ ok: boolean; calls: number; searches: number }>;
};

export type AiTelemetryOption = { telemetry?: AiTrace };

const ERROR_MESSAGE_MAX = 300;
const DEFAULT_FLUSH_TIMEOUT_MS = 2000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clipMessage(message: string | null | undefined): string | null {
  if (message == null) return null;
  return String(message).slice(0, ERROR_MESSAGE_MAX);
}

type TraceStore = {
  traceId: string;
  ctx: AiTraceContext;
  targetId: string | null;
  calls: ModelCallRow[];
  searches: RetrievalRow[];
  flush: AiTrace["flush"];
};

type HandleScope = {
  step: string | null;
  callKey: string | null;
  attempt: number;
  retryReason: string | null;
};

export function createAiTrace(
  ctx: AiTraceContext,
  deps: { now?: () => number; randomUUID?: () => string } = {},
): AiTrace {
  const traceId = (deps.randomUUID ?? nodeRandomUUID)();
  let flushed = false;
  const calls: ModelCallRow[] = [];
  const searches: RetrievalRow[] = [];

  async function insertAll(db: SupabaseClient<Database>) {
    const failures: unknown[] = [];
    if (calls.length > 0) {
      const { error } = await db.from("ai_model_calls").insert(calls);
      if (error) failures.push(error);
    }
    if (searches.length > 0) {
      const { error } = await db.from("ai_retrieval_events").insert(searches);
      if (error) failures.push(error);
    }
    return failures;
  }

  const store: TraceStore = {
    traceId,
    ctx,
    // uuid 형식이 아닌 식별자는 uuid 컬럼에 넣지 않는다. target_kind 는 그대로 둔다.
    targetId:
      ctx.targetId && UUID_PATTERN.test(ctx.targetId) ? ctx.targetId : null,
    calls,
    searches,
    async flush(db, opts = {}) {
      const result = {
        ok: true,
        calls: calls.length,
        searches: searches.length,
      };
      if (flushed) return { ok: true, calls: 0, searches: 0 };
      flushed = true;

      const timeoutMs = opts.timeoutMs ?? DEFAULT_FLUSH_TIMEOUT_MS;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const failures = await Promise.race([
          insertAll(db),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`flush 시간 초과 ${timeoutMs}ms`)),
              timeoutMs,
            );
          }),
        ]);
        if (failures.length > 0) {
          result.ok = false;
          console.warn("[ai-telemetry] flush 실패:", failures[0]);
        }
      } catch (error) {
        result.ok = false;
        console.warn("[ai-telemetry] flush 실패:", error);
      } finally {
        if (timer) clearTimeout(timer);
      }
      return result;
    },
  };

  return makeHandle(
    store,
    { step: ctx.step ?? null, callKey: null, attempt: 0, retryReason: null },
    null,
  );
}

/**
 * own 이 null 이면 부모 핸들이다. 부모는 공유 행 전체를 보고 flush 로 내보낸다.
 * 자식은 자기가 기록한 행만 own 에 따로 들고, 검증 표시와 인용 기록도 그 안에서만 찾는다.
 */
function makeHandle(
  store: TraceStore,
  scope: HandleScope,
  own: { calls: ModelCallRow[]; searches: RetrievalRow[] } | null,
): AiTrace {
  const { ctx } = store;
  const myCalls = own ? own.calls : store.calls;
  const mySearches = own ? own.searches : store.searches;

  const base = () => ({
    trace_id: store.traceId,
    service: ctx.service,
    feature: ctx.feature,
    step: scope.step,
    target_kind: ctx.targetKind ?? null,
    target_id: store.targetId,
    profile_id: ctx.profileId ?? null,
  });

  return {
    get traceId() {
      return store.traceId;
    },
    get attempt() {
      return scope.attempt;
    },
    get calls() {
      return myCalls;
    },
    get searches() {
      return mySearches;
    },
    beginAttempt(reason) {
      scope.attempt += 1;
      scope.retryReason = reason;
    },
    recordCall(entry) {
      if (scope.attempt === 0) scope.attempt = 1;
      const usage = entry.usage ?? {};
      const row: ModelCallRow = {
        ...base(),
        call_key: scope.callKey,
        attempt: scope.attempt,
        retry_reason: scope.retryReason,
        prompt_version: ctx.promptVersion ?? null,
        kind: entry.kind,
        model: entry.model,
        started_at: new Date(entry.startedAt).toISOString(),
        latency_ms: entry.latencyMs,
        transport_attempt: entry.transportAttempt,
        status: entry.status,
        error_code: entry.errorCode ?? null,
        error_message: clipMessage(entry.errorMessage),
        finish_reason: entry.finishReason ?? null,
        prompt_tokens: usage.promptTokens ?? null,
        output_tokens: usage.outputTokens ?? null,
        cached_tokens: usage.cachedTokens ?? null,
        thoughts_tokens: usage.thoughtsTokens ?? null,
        total_tokens: usage.totalTokens ?? null,
        input_chars: entry.inputChars ?? null,
        output_chars: entry.outputChars ?? null,
        validation: null,
        issue_codes: null,
      };
      store.calls.push(row);
      if (own) own.calls.push(row);
    },
    annotateLastCall(a) {
      for (let i = myCalls.length - 1; i >= 0; i--) {
        const row = myCalls[i];
        if (row?.kind === "generate") {
          row.validation = a.validation;
          row.issue_codes = a.issueCodes ?? null;
          return;
        }
      }
    },
    recordSearch(entry) {
      const row: RetrievalRow = {
        ...base(),
        kind: entry.kind,
        knowledge_type: entry.knowledgeType ?? null,
        threshold: entry.threshold ?? null,
        match_count_requested: entry.matchCountRequested ?? null,
        raw_hits: entry.rawHits ?? null,
        packed_hits: entry.packedHits ?? null,
        top_score: entry.topScore ?? null,
        source: entry.source ?? null,
        degraded: entry.degraded,
        injected_chars: entry.injectedChars ?? null,
        embed_ms: entry.embedMs ?? null,
        started_at: new Date(entry.startedAt).toISOString(),
        latency_ms: entry.latencyMs,
        status: entry.status,
        error_message: clipMessage(entry.errorMessage),
        hit_resource_ids: entry.hitResourceIds ?? null,
        cited_resource_ids: null,
      };
      store.searches.push(row);
      if (own) own.searches.push(row);
    },
    recordCitations(resourceIds) {
      for (let i = mySearches.length - 1; i >= 0; i--) {
        const row = mySearches[i];
        if (row?.kind === "knowledge") {
          row.cited_resource_ids = [...new Set(resourceIds)];
          return;
        }
      }
    },
    fork(meta) {
      return makeHandle(
        store,
        {
          step: meta.step !== undefined ? meta.step : scope.step,
          callKey: meta.callKey ?? null,
          attempt: meta.attempt ?? 0,
          retryReason: meta.retryReason ?? null,
        },
        { calls: [], searches: [] },
      );
    },
    // 자식의 flush 는 아무것도 내보내지 않는다. 동시에 도는 다른 자식이 아직 기록 중일 때
    // 부모 flush 를 앞당기면 그 뒤 행이 버려지므로, 내보내기는 요청 끝 부모 flush 한 번만 한다.
    async flush(db, opts) {
      if (own) return { ok: true, calls: 0, searches: 0 };
      return store.flush(db, opts);
    },
  };
}
