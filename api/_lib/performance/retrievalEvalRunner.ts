// 지식 검색 품질 평가 러너. 문제집을 읽고, 질의마다 임베딩을 한 번 만들고, 조합마다 RPC 를
// 다시 불러 채점한 뒤 knowledge_eval_runs 에 저장한다. 판단과 채점은 retrievalEval.ts 의
// 순수 함수가 하고, 이 파일은 DB 와 임베딩 호출만 맡는다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiTrace } from "../aiTelemetry/trace.js";
import { embedText } from "./embeddings.js";
import type { BulkKnowledgeType } from "./knowledgeDedupe.js";
import {
  buildEvalQueryText,
  buildEvalRpc,
  type ComboResult,
  type EvalMode,
  type EvalParams,
  type EvalSearch,
  type GoldenQuery,
  type PerQueryResult,
  type RunMetrics,
  scoreCombos,
} from "./retrievalEval.js";

/** 한 번의 평가에 쓰는 활성 질의 수 상한. */
export const GOLDEN_QUERY_LIMIT = 100;

/** 질의 임베딩을 동시에 만드는 수. */
const EMBED_CONCURRENCY = 5;

const GOLDEN_COLUMNS =
  "id, knowledge_type, grade, subject, career, selected_topic, assessment_info, expected_resource_ids";

export async function loadGoldenQueries(
  db: SupabaseClient,
  knowledgeType: BulkKnowledgeType,
): Promise<GoldenQuery[]> {
  const { data, error } = await db
    .from("knowledge_golden_queries")
    .select(GOLDEN_COLUMNS)
    .eq("knowledge_type", knowledgeType)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(GOLDEN_QUERY_LIMIT);
  if (error) throw new Error(`문제집 조회 실패: ${error.message}`);
  return (data ?? []) as GoldenQuery[];
}

/** 질의마다 임베딩을 한 번 만든다. 조합 비교는 이 값을 모든 조합에 다시 쓴다. */
export async function embedGoldenQueries(
  queries: readonly GoldenQuery[],
  trace: AiTrace,
): Promise<Map<string, number[]>> {
  const embeddings = new Map<string, number[]>();
  for (let start = 0; start < queries.length; start += EMBED_CONCURRENCY) {
    const chunk = queries.slice(start, start + EMBED_CONCURRENCY);
    const vectors = await Promise.all(
      chunk.map((query) => embedText(buildEvalQueryText(query), trace)),
    );
    chunk.forEach((query, index) => {
      embeddings.set(query.id, vectors[index] as number[]);
    });
  }
  return embeddings;
}

/** 실제 RPC 로 검색해 반환 id 를 순서대로 돌려준다. */
export function rpcSearch(db: SupabaseClient): EvalSearch {
  return async (query, embedding, mode, params) => {
    const rpc = buildEvalRpc(query, embedding, mode, params);
    const { data, error } = await db.rpc(rpc.fn, rpc.args);
    if (error) throw new Error(`검색 실패: ${error.message}`);
    return ((data ?? []) as { id?: string }[])
      .map((row) => row.id)
      .filter((id): id is string => Boolean(id));
  };
}

function runRow(
  knowledgeType: BulkKnowledgeType,
  mode: EvalMode,
  result: Extract<ComboResult, { status: "done" }>,
  userId: string | null,
  note: string | null,
) {
  return {
    created_by: userId,
    knowledge_type: knowledgeType,
    mode,
    params: result.params,
    query_count: result.perQuery.length,
    metrics: result.metrics,
    per_query: result.perQuery,
    note,
  };
}

type RunnerInput = {
  db: SupabaseClient;
  knowledgeType: BulkKnowledgeType;
  userId: string | null;
  note: string | null;
  trace: AiTrace;
};

export type RunOutcome =
  | {
      ok: true;
      runId: string;
      queryCount: number;
      metrics: RunMetrics;
      perQuery: PerQueryResult[];
    }
  | { ok: false; reason: string };

const NO_QUERIES =
  "활성 질의가 없습니다. 기준 문제집에 질의를 먼저 추가하세요.";

/** 평가 실행 1회. 결과를 knowledge_eval_runs 1행으로 저장한다. */
export async function runGoldenEval(
  input: RunnerInput & { mode: EvalMode; params: EvalParams },
): Promise<RunOutcome> {
  const { db, knowledgeType, mode, params } = input;
  const queries = await loadGoldenQueries(db, knowledgeType);
  if (!queries.length) return { ok: false, reason: NO_QUERIES };

  const embeddings = await embedGoldenQueries(queries, input.trace);
  const [result] = await scoreCombos({
    queries,
    embeddings,
    mode,
    combos: [params],
    search: rpcSearch(db),
    deadlineAt: Number.POSITIVE_INFINITY,
  });
  if (result?.status !== "done") throw new Error("평가 결과가 없습니다.");

  const { data, error } = await db
    .from("knowledge_eval_runs")
    .insert(runRow(knowledgeType, mode, result, input.userId, input.note))
    .select("id")
    .single();
  if (error) throw new Error(`실행 이력 저장 실패: ${error.message}`);

  return {
    ok: true,
    runId: String(data.id),
    queryCount: queries.length,
    metrics: result.metrics,
    perQuery: result.perQuery,
  };
}

export type SweepItem =
  | {
      status: "done";
      runId: string;
      params: EvalParams;
      metrics: RunMetrics;
    }
  | { status: "skipped"; params: EvalParams };

export type SweepOutcome =
  | { ok: true; queryCount: number; items: SweepItem[] }
  | { ok: false; reason: string };

/**
 * 조합 비교. 임베딩은 질의당 1회만 만들고 조합마다 하이브리드 RPC 만 다시 부른다.
 * 저장은 끝난 조합마다 knowledge_eval_runs 1행이다(한 번의 insert). 이력 화면이 일반 실행과
 * 같은 모양으로 두 행을 비교할 수 있게 하려는 선택이다. 메모 앞에 조합 비교 표시를 붙인다.
 * 시간 예산은 startedAt 부터 budgetMs 이고, 넘기면 남은 조합은 skipped 로 돌려준다.
 */
export async function runGoldenSweep(
  input: RunnerInput & {
    combos: EvalParams[];
    startedAt: number;
    budgetMs: number;
  },
): Promise<SweepOutcome> {
  const { db, knowledgeType } = input;
  const queries = await loadGoldenQueries(db, knowledgeType);
  if (!queries.length) return { ok: false, reason: NO_QUERIES };

  const embeddings = await embedGoldenQueries(queries, input.trace);
  const results = await scoreCombos({
    queries,
    embeddings,
    mode: "hybrid",
    combos: input.combos,
    search: rpcSearch(db),
    deadlineAt: input.startedAt + input.budgetMs,
  });

  const done = results.filter(
    (r): r is Extract<ComboResult, { status: "done" }> => r.status === "done",
  );
  const total = results.length;
  const rows = done.map((result) =>
    runRow(
      knowledgeType,
      "hybrid",
      result,
      input.userId,
      [`조합 비교 ${results.indexOf(result) + 1}/${total}`, input.note]
        .filter(Boolean)
        .join(" "),
    ),
  );
  const ids: string[] = [];
  if (rows.length) {
    const { data, error } = await db
      .from("knowledge_eval_runs")
      .insert(rows)
      .select("id");
    if (error) throw new Error(`실행 이력 저장 실패: ${error.message}`);
    ids.push(...(data ?? []).map((row) => String(row.id)));
  }

  let doneIndex = 0;
  const items: SweepItem[] = results.map((result) => {
    if (result.status === "skipped") return result;
    const runId = ids[doneIndex++] ?? "";
    return {
      status: "done",
      runId,
      params: result.params,
      metrics: result.metrics,
    };
  });
  return { ok: true, queryCount: queries.length, items };
}
