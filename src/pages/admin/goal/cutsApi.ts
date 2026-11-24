// 목표관리 컷 화면의 HTTP 호출(/api/goal/admin/cuts/...). 응답은 zod 로 검증한다.

import { z } from "zod";
import type { GoalBackfillYearMode } from "@/lib/goal/goalCutBackfill";
import { api } from "@/lib/http/client";
import type { parseGoalUniversityCutRowsFromXlsx } from "./cutsBulkXlsx";

const count = z.number().int();

const summarySchema = z.object({
  total: count,
  active: count,
  normal: count,
  special: count,
  jungsi: count,
  missing: count,
  comboTotal: count,
  comboNoJungsi: count,
});

const cutRowsSchema = z.object({
  items: z.array(z.record(z.string(), z.unknown())),
  next: z.number().int().nullable(),
});

const jungsiMissingSchema = z.object({
  items: z.array(
    z.object({ university_name: z.string(), department_name: z.string() }),
  ),
});

const bulkResultSchema = z.object({ inserted: count, updated: count });

const payloadSchema = z.object({
  cut_type: z.enum(["normal", "special"]),
  university_key: z.string(),
  university_name: z.string(),
  department_key: z.string(),
  department_name: z.string(),
  avg_cut: z.number(),
  source: z.literal("admission_results"),
  source_year: z.number(),
});

const previewSchema = z.object({
  sourceRowCount: count,
  stats: z.object({
    universityCount: count,
    pairCount: count,
    totalRows: count,
    normalCount: count,
    specialCount: count,
    year2026Pairs: count,
    year2025Pairs: count,
    excludedStarPairs: count,
    excludedEmptyPairs: count,
    excludedNoTrackPairs: count,
    mergedCount: count,
    distribution: z.object({
      min: z.number().nullable(),
      p25: z.number().nullable(),
      median: z.number().nullable(),
      p75: z.number().nullable(),
      max: z.number().nullable(),
    }),
    samples: z.array(payloadSchema),
  }),
  analysis: z.object({
    overlapCount: count,
    manualCount: count,
    inactiveCount: count,
    notedCount: count,
    preservedCount: count,
    nameAxisCount: count,
  }),
  applyCount: count,
  orphanCount: count,
});

const applyResultSchema = z.object({ applied: count, deactivated: count });

export type CutsSummary = z.infer<typeof summarySchema>;
export type BackfillPreview = z.infer<typeof previewSchema>;
export type PreserveMode = "preserve" | "overwrite";
export type OrphanMode = "keep" | "deactivate";
export type BulkRow = ReturnType<
  typeof parseGoalUniversityCutRowsFromXlsx
>["rows"][number];

export const cutsKeys = {
  summary: (refreshToken: number, mutationSeq: number) =>
    ["admin", "goalCuts", "summary", refreshToken, mutationSeq] as const,
};

const base = "goal/admin/cuts";

export function fetchCutsSummary(signal?: AbortSignal) {
  return api
    .get(`${base}/summary`, signal ? { signal } : {})
    .json(summarySchema);
}

// next 가 null 일 때까지 id 오름차순 1,000행씩 이어 받는다. total 은 진행 표시용 참고 수치다.
export async function fetchAllCutRows(
  total: number,
  onProgress?: (progress: { done: number; total: number }) => void,
) {
  const all: Record<string, unknown>[] = [];
  let from: number | null = 0;
  while (from !== null) {
    const chunk: z.infer<typeof cutRowsSchema> = await api
      .get(`${base}/rows`, { searchParams: { from } })
      .json(cutRowsSchema);
    all.push(...chunk.items);
    onProgress?.({ done: all.length, total });
    from = chunk.next;
  }
  return all;
}

export async function fetchJungsiMissing() {
  const body = await api
    .get(`${base}/jungsi-missing`)
    .json(jungsiMissingSchema);
  return body.items;
}

export function postBulkRows(rows: BulkRow[]) {
  return api.post(`${base}/bulk`, { json: { rows } }).json(bulkResultSchema);
}

// 입결 약 43,000행을 서버에서 읽어 기본 15초 제한을 넘길 수 있다. 서버 함수 한도(60초)가 끊는다.
export function fetchBackfillPreview(params: {
  yearMode: GoalBackfillYearMode;
  preserveMode: PreserveMode;
}) {
  return api
    .get(`${base}/backfill`, { searchParams: params, timeout: false })
    .json(previewSchema);
}

export function applyBackfill(body: {
  yearMode: GoalBackfillYearMode;
  preserveMode: PreserveMode;
  orphanMode: OrphanMode;
  expectedApplyCount: number;
  expectedOrphanCount: number;
}) {
  return api
    .post(`${base}/backfill`, { json: body, timeout: false })
    .json(applyResultSchema);
}
