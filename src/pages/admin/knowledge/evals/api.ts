// 지식 검색 품질 평가 화면의 데이터 호출. 평가 실행과 이력은 /api/admin/knowledge-eval 을 부르고,
// 문제집 CRUD 와 기대 자료 검색은 관리자 RLS 가 열려 있어 클라이언트 Supabase 로 직접 한다.

import { escapeIlike } from "@/components/growth/survey/surveySearch";
import { supabase } from "@/lib/supabase";
import { getFreshSupabaseAccessTokenOrSignOut } from "@/pages/admin/shared/adminSession";
import type { ApiResult } from "../apiResult";
import type {
  EvalParams,
  ExpectedResource,
  GoldenRowInput,
  KnowledgeType,
  RunMetrics,
  SweepGrid,
  SweepItem,
} from "./form";

export type PerQueryResult = {
  queryId: string;
  label: string;
  expectedIds: string[];
  ranks: (number | null)[];
};

export type RunResponse = {
  runId: string;
  queryCount: number;
  params: EvalParams;
  metrics: RunMetrics;
  perQuery: PerQueryResult[];
};

export type SweepResponse = {
  queryCount: number;
  productionParams: EvalParams;
  items: SweepItem[];
};

export type EvalRun = {
  id: string;
  created_at: string;
  knowledge_type: KnowledgeType;
  mode: "vector" | "hybrid";
  params: EvalParams;
  query_count: number;
  metrics: RunMetrics;
  per_query: PerQueryResult[];
  note: string | null;
};

export type RunsResponse = {
  productionParams: Record<KnowledgeType, EvalParams>;
  items: EvalRun[];
};

export type GoldenQuery = GoldenRowInput & {
  id: string;
  is_active: boolean;
  created_at: string;
};

const ENDPOINT = "/api/admin/knowledge-eval";

/** 기대 자료 검색 결과 수 상한. */
const RESOURCE_SEARCH_LIMIT = 20;

async function call<T>(
  url: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<ApiResult<T>> {
  const accessToken = await getFreshSupabaseAccessTokenOrSignOut();
  const response = await fetch(url, {
    method: init.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    const message =
      result?.error?.message ??
      result?.detail ??
      result?.message ??
      `요청에 실패했습니다. (HTTP ${response.status})`;
    return { ok: false, message: String(message) };
  }
  return { ok: true, data: result as T };
}

export function fetchRuns(knowledgeType: KnowledgeType) {
  return call<RunsResponse>(
    `${ENDPOINT}?view=runs&knowledgeType=${knowledgeType}`,
    { method: "GET" },
  );
}

export function postRun(body: {
  knowledgeType: KnowledgeType;
  mode: "vector" | "hybrid";
  params: Partial<EvalParams>;
  note?: string;
}) {
  return call<RunResponse>(ENDPOINT, {
    method: "POST",
    body: { action: "run", ...body },
  });
}

export function postSweep(body: {
  knowledgeType: KnowledgeType;
  grid: SweepGrid;
  note?: string;
}) {
  return call<SweepResponse>(ENDPOINT, {
    method: "POST",
    body: { action: "sweep", ...body },
  });
}

function failure(label: string, error: { message: string }) {
  console.error(error);
  return { ok: false as const, message: `${label}에 실패했습니다.` };
}

export async function listGoldenQueries(
  knowledgeType: KnowledgeType,
): Promise<ApiResult<GoldenQuery[]>> {
  const { data, error } = await supabase
    .from("knowledge_golden_queries")
    .select(
      "id, knowledge_type, grade, subject, career, selected_topic, assessment_info, note, expected_resource_ids, is_active, created_at",
    )
    .eq("knowledge_type", knowledgeType)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) return failure("문제집 조회", error);
  return { ok: true, data: (data ?? []) as GoldenQuery[] };
}

export async function saveGoldenQuery(
  id: string | null,
  row: GoldenRowInput,
): Promise<ApiResult<null>> {
  const { error } = id
    ? await supabase.from("knowledge_golden_queries").update(row).eq("id", id)
    : await supabase.from("knowledge_golden_queries").insert(row);
  if (error) return failure("질의 저장", error);
  return { ok: true, data: null };
}

/** 삭제는 비활성으로 한다. 지난 실행 이력의 질의 id 가 계속 뜻을 갖게 하려는 선택이다. */
export async function setGoldenQueryActive(
  id: string,
  isActive: boolean,
): Promise<ApiResult<null>> {
  const { error } = await supabase
    .from("knowledge_golden_queries")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return failure("질의 상태 변경", error);
  return { ok: true, data: null };
}

export async function searchKnowledgeResources(
  knowledgeType: KnowledgeType,
  term: string,
): Promise<ApiResult<ExpectedResource[]>> {
  const q = term.trim();
  if (!q) return { ok: true, data: [] };
  const { data, error } = await supabase
    .from("winning_assessment_knowledge_items")
    .select("id, title")
    .eq("knowledge_type", knowledgeType)
    .ilike("title", `%${escapeIlike(q)}%`)
    .order("title")
    .limit(RESOURCE_SEARCH_LIMIT);
  if (error) return failure("자료 검색", error);
  return {
    ok: true,
    data: (data ?? []).map((row) => ({
      id: row.id,
      title: row.title ?? "",
    })),
  };
}

/** 기대 자료 id 의 제목. 표와 편집 Dialog 에서 id 대신 제목을 보여 준다. */
export async function fetchResourceTitles(
  ids: readonly string[],
): Promise<ApiResult<Record<string, string>>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return { ok: true, data: {} };
  const { data, error } = await supabase
    .from("winning_assessment_knowledge_items")
    .select("id, title")
    .in("id", unique);
  if (error) return failure("자료 제목 조회", error);
  return {
    ok: true,
    data: Object.fromEntries(
      (data ?? []).map((row) => [row.id, row.title ?? ""]),
    ),
  };
}
