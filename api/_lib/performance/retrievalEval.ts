// 지식 검색 품질 평가(골든셋)의 판단 순수 함수. 핸들러는 api/admin/knowledge-eval.ts 이고,
// DB 와 임베딩을 부르는 러너는 retrievalEvalRunner.ts 다.
//
// 운영 검색 상수와 학생 요청 경로는 바꾸지 않는다. 평가 실행만 파라미터를 덮어쓴다.

import {
  buildKnowledgeKeywordQueryFor,
  buildKnowledgeQueryText,
  getBaseGradeForRpc,
  knowledgeMatchThreshold,
  RESOURCE_MAX_ITEMS,
  resolveFilterSubject,
  TOPIC_MAX_ITEMS,
} from "./knowledge.js";
import {
  type BulkKnowledgeType,
  isBulkKnowledgeType,
} from "./knowledgeDedupe.js";

/** 기대 id 별 반환 목록 안의 순위(1부터). 반환 목록에 없으면 null 이다. */
export function rankOf(
  expectedIds: readonly string[],
  returnedIds: readonly string[],
): (number | null)[] {
  return expectedIds.map((id) => {
    const index = returnedIds.indexOf(id);
    return index === -1 ? null : index + 1;
  });
}

/** 질의 하나의 채점 결과. ranks 는 기대 자료 순서대로 rankOf 결과다. */
export type QueryRanks = { ranks: readonly (number | null)[] };

function average(values: number[]): number {
  return values.length
    ? values.reduce((sum, v) => sum + v, 0) / values.length
    : 0;
}

/** 질의별 (상위 k 안의 기대 자료 수 / 기대 자료 수) 의 평균. 질의가 없으면 0 이다. */
export function recallAtK(perQuery: readonly QueryRanks[], k: number): number {
  return average(
    perQuery.map(({ ranks }) =>
      ranks.length
        ? ranks.filter((rank) => rank !== null && rank <= k).length /
          ranks.length
        : 0,
    ),
  );
}

/** 질의별 첫 적중 순위 역수의 평균(Mean Reciprocal Rank). 적중이 없는 질의는 0 이다. */
export function mrr(perQuery: readonly QueryRanks[]): number {
  return average(
    perQuery.map(({ ranks }) => {
      const hits = ranks.filter((rank): rank is number => rank !== null);
      return hits.length ? 1 / Math.min(...hits) : 0;
    }),
  );
}

/** 평가 실행 한 번의 지표. recall 의 키는 k 를 문자열로 쓴 값이다. */
export type RunMetrics = { recall: Record<string, number>; mrr: number };

export const DEFAULT_RECALL_KS = [1, 3, 5, 10] as const;

export function summarizeRun(
  perQuery: readonly QueryRanks[],
  ks: readonly number[] = DEFAULT_RECALL_KS,
): RunMetrics {
  return {
    recall: Object.fromEntries(
      ks.map((k) => [String(k), recallAtK(perQuery, k)]),
    ),
    mrr: mrr(perQuery),
  };
}

// 하이브리드 RPC 의 운영값. 학생 요청 경로는 이 세 인자를 넘기지 않아 RPC 기본값을 쓴다
// (마이그레이션 20261007053142 의 full_text_weight 1, semantic_weight 1, rrf_k 60).
// 평가 실행은 이 값을 항상 명시해서 넘긴다. 마이그레이션 기본값과 같은지는 테스트가 확인한다.
export const HYBRID_RRF_K = 60;
export const HYBRID_FULL_TEXT_WEIGHT = 1;
export const HYBRID_SEMANTIC_WEIGHT = 1;

/** 평가 실행 한 번에 RPC 로 넘기는 검색 파라미터. knowledge_eval_runs.params 에 그대로 저장한다. */
export type EvalParams = {
  matchThreshold: number;
  rrfK: number;
  fullTextWeight: number;
  semanticWeight: number;
  matchCount: number;
};

/**
 * 지식 유형별 운영 검색값. match_count 는 학생 요청 경로(knowledgeRpcFilterArgs)의
 * Math.max(maxItems * 2, 10) 과 같은 식이다.
 */
export function productionEvalParams(
  knowledgeType: BulkKnowledgeType,
): EvalParams {
  const maxItems =
    knowledgeType === "verified_resource"
      ? RESOURCE_MAX_ITEMS
      : TOPIC_MAX_ITEMS;
  return {
    matchThreshold: knowledgeMatchThreshold(knowledgeType),
    rrfK: HYBRID_RRF_K,
    fullTextWeight: HYBRID_FULL_TEXT_WEIGHT,
    semanticWeight: HYBRID_SEMANTIC_WEIGHT,
    matchCount: Math.max(maxItems * 2, 10),
  };
}

// 평가 파라미터 허용 범위. match_count 상한 20 은 두 RPC 본문의 least(match_count, 20) 과 같다.
const PARAM_RULES: Record<
  keyof EvalParams,
  { min: number; max: number; integer: boolean }
> = {
  matchThreshold: { min: 0, max: 1, integer: false },
  rrfK: { min: 1, max: 200, integer: true },
  fullTextWeight: { min: 0, max: 5, integer: false },
  semanticWeight: { min: 0, max: 5, integer: false },
  matchCount: { min: 1, max: 20, integer: true },
};

const PARAM_KEYS = Object.keys(PARAM_RULES) as (keyof EvalParams)[];

type ParamsResult =
  | { ok: true; params: EvalParams }
  | { ok: false; reason: string };

/**
 * 운영값 위에 덮어쓰기 값을 합치고 범위를 검사한다. 값이 undefined 나 null 이면 운영값을 둔다.
 * 화면이 빈 칸을 보내지 않으므로 빈 문자열도 운영값으로 본다.
 */
export function buildEvalParams(input: {
  knowledgeType: BulkKnowledgeType;
  overrides?: unknown;
}): ParamsResult {
  const params = productionEvalParams(input.knowledgeType);
  const { overrides } = input;
  if (overrides === undefined || overrides === null)
    return { ok: true, params };
  if (typeof overrides !== "object" || Array.isArray(overrides)) {
    return { ok: false, reason: "params 는 객체여야 합니다." };
  }
  const source = overrides as Record<string, unknown>;
  for (const key of PARAM_KEYS) {
    const value = source[key];
    if (value === undefined || value === null || value === "") continue;
    const rule = PARAM_RULES[key];
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < rule.min ||
      value > rule.max ||
      (rule.integer && !Number.isInteger(value))
    ) {
      const kind = rule.integer ? "정수" : "숫자";
      return {
        ok: false,
        reason: `${key} 는 ${rule.min}부터 ${rule.max} 사이 ${kind}여야 합니다.`,
      };
    }
    params[key] = value;
  }
  return { ok: true, params };
}

/** 조합 비교 한 번에 돌리는 조합 수 상한. */
export const SWEEP_MAX_COMBOS = 24;

function numberList(value: unknown): number[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  return value.every((v) => typeof v === "number") ? (value as number[]) : null;
}

function weightPairList(
  value: unknown,
): { fullText: number; semantic: number }[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const ok = value.every(
    (pair) =>
      pair &&
      typeof pair === "object" &&
      typeof pair.fullText === "number" &&
      typeof pair.semantic === "number",
  );
  return ok ? (value as { fullText: number; semantic: number }[]) : null;
}

/**
 * rrf_k 목록 x 가중치 쌍 목록 x threshold 목록의 조합. 빈 축은 운영값 하나로 채우고,
 * match_count 는 운영값을 그대로 둔다. 조합마다 buildEvalParams 와 같은 범위 검사를 한다.
 */
export function buildSweepGrid(input: {
  knowledgeType: BulkKnowledgeType;
  grid: unknown;
}): { ok: true; combos: EvalParams[] } | { ok: false; reason: string } {
  const { grid } = input;
  if (!grid || typeof grid !== "object" || Array.isArray(grid)) {
    return { ok: false, reason: "grid 는 객체여야 합니다." };
  }
  const source = grid as Record<string, unknown>;
  const rrfKs = numberList(source.rrfK);
  const thresholds = numberList(source.matchThreshold);
  const weights = weightPairList(source.weights);
  if (!rrfKs || !thresholds || !weights) {
    return {
      ok: false,
      reason:
        "grid 는 rrfK 숫자 목록, weights 가중치 쌍 목록, matchThreshold 숫자 목록입니다.",
    };
  }

  const base = productionEvalParams(input.knowledgeType);
  const rrfAxis = rrfKs.length ? rrfKs : [base.rrfK];
  const weightAxis = weights.length
    ? weights
    : [{ fullText: base.fullTextWeight, semantic: base.semanticWeight }];
  const thresholdAxis = thresholds.length ? thresholds : [base.matchThreshold];

  const total = rrfAxis.length * weightAxis.length * thresholdAxis.length;
  if (total > SWEEP_MAX_COMBOS) {
    return {
      ok: false,
      reason: `조합은 ${SWEEP_MAX_COMBOS}개까지입니다. 지금 ${total}개입니다.`,
    };
  }

  const combos: EvalParams[] = [];
  for (const rrfK of rrfAxis) {
    for (const pair of weightAxis) {
      for (const matchThreshold of thresholdAxis) {
        const result = buildEvalParams({
          knowledgeType: input.knowledgeType,
          overrides: {
            rrfK,
            fullTextWeight: pair.fullText,
            semanticWeight: pair.semantic,
            matchThreshold,
          },
        });
        if (!result.ok) return result;
        combos.push(result.params);
      }
    }
  }
  return { ok: true, combos };
}

/** 평가 검색 방식. hybrid 는 학생 요청 경로의 1차 경로이고 vector 는 폴백 경로다. */
export type EvalMode = "vector" | "hybrid";

/** 메모 길이 상한. */
const NOTE_MAX_CHARS = 500;

export type EvalRequest =
  | {
      action: "run";
      knowledgeType: BulkKnowledgeType;
      mode: EvalMode;
      params: EvalParams;
      note: string | null;
    }
  | {
      action: "sweep";
      knowledgeType: BulkKnowledgeType;
      combos: EvalParams[];
      note: string | null;
    };

/** POST /api/admin/knowledge-eval 바디 검증. 조합 비교는 RRF 를 바꾸는 실험이라 hybrid 로만 돈다. */
export function parseEvalRequest(
  raw: unknown,
): { ok: true; request: EvalRequest } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "요청 바디가 올바르지 않습니다." };
  }
  const source = raw as Record<string, unknown>;
  if (source.action !== "run" && source.action !== "sweep") {
    return { ok: false, reason: "action 은 run 또는 sweep 입니다." };
  }
  if (!isBulkKnowledgeType(source.knowledgeType)) {
    return { ok: false, reason: "knowledgeType 이 올바르지 않습니다." };
  }
  const knowledgeType = source.knowledgeType;

  if (
    source.note !== undefined &&
    source.note !== null &&
    typeof source.note !== "string"
  ) {
    return { ok: false, reason: "note 는 문자열이어야 합니다." };
  }
  const note =
    typeof source.note === "string"
      ? source.note.trim().slice(0, NOTE_MAX_CHARS) || null
      : null;

  if (source.action === "sweep") {
    const grid = buildSweepGrid({ knowledgeType, grid: source.grid });
    if (!grid.ok) return grid;
    return {
      ok: true,
      request: { action: "sweep", knowledgeType, combos: grid.combos, note },
    };
  }

  const mode = source.mode ?? "hybrid";
  if (mode !== "vector" && mode !== "hybrid") {
    return { ok: false, reason: "mode 는 vector 또는 hybrid 입니다." };
  }
  const params = buildEvalParams({ knowledgeType, overrides: source.params });
  if (!params.ok) return params;
  return {
    ok: true,
    request: {
      action: "run",
      knowledgeType,
      mode,
      params: params.params,
      note,
    },
  };
}

/** knowledge_golden_queries 행 중 평가가 읽는 필드. */
export type GoldenQuery = {
  id: string;
  knowledge_type: string;
  grade: string;
  subject: string;
  career: string | null;
  selected_topic: string | null;
  assessment_info: string | null;
  expected_resource_ids: string[];
};

function goldenSearchInput(query: GoldenQuery) {
  return {
    grade: query.grade,
    subject: query.subject,
    career: query.career ?? "",
    selectedTopic: query.selected_topic ?? "",
    assessmentInfo: query.assessment_info ?? "",
  };
}

/** 임베딩할 질의문. 학생 요청 경로의 buildKnowledgeQueryText 를 그대로 쓴다. */
export function buildEvalQueryText(query: GoldenQuery): string {
  return buildKnowledgeQueryText(goldenSearchInput(query));
}

/**
 * 골든 질의 하나를 부를 RPC 와 인자. 학년, 과목 필터와 단어 질의는 학생 요청 경로와 같은
 * 함수로 만든다. 과목 필터는 학생 요청 경로처럼 주제 검색이면 걸지 않고 자료 검색이면 건다.
 * 검색 파라미터는 운영값이 아니라 평가 파라미터를 명시해서 넘긴다.
 */
export function buildEvalRpc(
  query: GoldenQuery,
  embedding: number[],
  mode: EvalMode,
  params: EvalParams,
) {
  const input = goldenSearchInput(query);
  const filters = {
    query_embedding: embedding,
    filter_knowledge_type: query.knowledge_type,
    filter_grade: getBaseGradeForRpc(input.grade),
    filter_subject: resolveFilterSubject({
      includeOtherSubjects: query.knowledge_type === "topic_pattern",
      subject: input.subject,
    }),
    match_count: params.matchCount,
    match_threshold: params.matchThreshold,
  };

  if (mode === "vector") {
    return { fn: "match_winning_suhaeng_all_subjects" as const, args: filters };
  }
  return {
    fn: "match_winning_suhaeng_hybrid" as const,
    args: {
      ...filters,
      query_keywords: buildKnowledgeKeywordQueryFor(input),
      rrf_k: params.rrfK,
      full_text_weight: params.fullTextWeight,
      semantic_weight: params.semanticWeight,
    },
  };
}

/** 질의 하나의 채점 결과. knowledge_eval_runs.per_query 의 항목이다. */
export type PerQueryResult = QueryRanks & {
  queryId: string;
  /** 실행 시점의 질의 요약. 문제집이 나중에 바뀌어도 이력에서 알아볼 수 있게 남긴다. */
  label: string;
  expectedIds: string[];
  ranks: (number | null)[];
};

export type ComboResult =
  | {
      status: "done";
      params: EvalParams;
      metrics: RunMetrics;
      perQuery: PerQueryResult[];
    }
  | { status: "skipped"; params: EvalParams };

/** 반환 id 목록을 돌려주는 검색 함수. 러너는 RPC 를, 테스트는 가짜를 넣는다. */
export type EvalSearch = (
  query: GoldenQuery,
  embedding: number[],
  mode: EvalMode,
  params: EvalParams,
) => Promise<string[]>;

function goldenLabel(query: GoldenQuery): string {
  return [query.grade, query.subject, query.selected_topic || query.career]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * 조합마다 모든 질의를 검색해 채점한다. 질의 임베딩은 호출부가 한 번 만들어 넘긴다.
 * 조합을 시작하기 전에 시간을 보고, deadlineAt 이 지났으면 그 조합부터 끝까지 skipped 로 둔다.
 * 이미 시작한 조합은 끝까지 돈다.
 */
export async function scoreCombos({
  queries,
  embeddings,
  mode,
  combos,
  search,
  deadlineAt,
  now = Date.now,
}: {
  queries: readonly GoldenQuery[];
  embeddings: ReadonlyMap<string, number[]>;
  mode: EvalMode;
  combos: readonly EvalParams[];
  search: EvalSearch;
  deadlineAt: number;
  now?: () => number;
}): Promise<ComboResult[]> {
  const results: ComboResult[] = [];
  for (const params of combos) {
    if (now() >= deadlineAt) {
      results.push({ status: "skipped", params });
      continue;
    }
    const perQuery: PerQueryResult[] = [];
    for (const query of queries) {
      const embedding = embeddings.get(query.id);
      if (!embedding) throw new Error(`질의 ${query.id} 의 임베딩이 없습니다.`);
      const returnedIds = await search(query, embedding, mode, params);
      perQuery.push({
        queryId: query.id,
        label: goldenLabel(query),
        expectedIds: query.expected_resource_ids,
        ranks: rankOf(query.expected_resource_ids, returnedIds),
      });
    }
    results.push({
      status: "done",
      params,
      metrics: summarizeRun(perQuery),
      perQuery,
    });
  }
  return results;
}

/** 이력 조회 한 번에 돌려주는 실행 수. */
export const EVAL_RUNS_LIMIT = 50;

/** GET ?view=runs&knowledgeType= 검증. 지식 유형이 없으면 두 유형을 모두 돌려준다. */
export function parseRunsQuery(
  query: Record<string, unknown>,
):
  | { ok: true; knowledgeType: BulkKnowledgeType | null }
  | { ok: false; reason: string } {
  if (query.view !== "runs") {
    return { ok: false, reason: "view 는 runs 입니다." };
  }
  const raw = query.knowledgeType;
  if (raw === undefined || raw === "") return { ok: true, knowledgeType: null };
  if (!isBulkKnowledgeType(raw)) {
    return { ok: false, reason: "knowledgeType 이 올바르지 않습니다." };
  }
  return { ok: true, knowledgeType: raw };
}
