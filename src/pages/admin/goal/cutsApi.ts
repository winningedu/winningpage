// 목표관리 컷 화면의 HTTP 호출(/api/goal/admin/cuts/...). 응답은 zod 로 검증한다.

import { api } from "@/lib/http/client";
import {
  type BackfillApplyBody,
  type BackfillPreviewQuery,
  backfillApplyResponse,
  backfillPreviewResponse,
  cutsBulkResponse,
  cutsRowsResponse,
  cutsSummaryResponse,
  jungsiMissingResponse,
} from "../../../../shared/goal/admin-cuts.js";
import type { parseGoalUniversityCutRowsFromXlsx } from "./cutsBulkXlsx";

export type {
  BackfillPreview,
  CutsSummary,
  OrphanMode,
  PreserveMode,
} from "../../../../shared/goal/admin-cuts.js";
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
    .json(cutsSummaryResponse);
}

// next 가 null 일 때까지 id 오름차순 1,000행씩 이어 받는다. total 은 진행 표시용 참고 수치다.
export async function fetchAllCutRows(
  total: number,
  onProgress?: (progress: { done: number; total: number }) => void,
) {
  const all: Record<string, unknown>[] = [];
  let from: number | null = 0;
  while (from !== null) {
    const chunk = await api
      .get(`${base}/rows`, { searchParams: { from } })
      .json(cutsRowsResponse);
    all.push(...chunk.items);
    onProgress?.({ done: all.length, total });
    from = chunk.next;
  }
  return all;
}

export async function fetchJungsiMissing() {
  const body = await api
    .get(`${base}/jungsi-missing`)
    .json(jungsiMissingResponse);
  return body.items;
}

export function postBulkRows(rows: BulkRow[]) {
  return api.post(`${base}/bulk`, { json: { rows } }).json(cutsBulkResponse);
}

// 입결 약 43,000행을 서버에서 읽어 기본 15초 제한을 넘길 수 있다. 서버 함수 한도(60초)가 끊는다.
export function fetchBackfillPreview(params: BackfillPreviewQuery) {
  return api
    .get(`${base}/backfill`, { searchParams: params, timeout: false })
    .json(backfillPreviewResponse);
}

export function applyBackfill(body: BackfillApplyBody) {
  return api
    .post(`${base}/backfill`, { json: body, timeout: false })
    .json(backfillApplyResponse);
}
