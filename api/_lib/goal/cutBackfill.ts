// goal_university_cuts 백필 서버 쪽. 소스 조회, 기존 행 대조, 반영 대상 확정, 반영을 맡는다.
// 순수 집계(computeGoalCutBackfill)는 src/lib/goal/goalCutBackfill.ts 를 그대로 쓴다. scripts/run-goal-cuts-backfill.mjs 도
// 같은 소스 조회와 집계를 쓴다(로직을 두 곳에 복제하지 않는다).

import type { SupabaseClient } from "@supabase/supabase-js";
import { allInOrder } from "../../../src/lib/concurrency/allInOrder.js";
import {
  computeGoalCutBackfill,
  GOAL_BACKFILL_SCREENING_CATEGORIES,
  type GoalBackfillSourceRow,
  type GoalBackfillYearMode,
  type GoalCutBackfillPayload,
  type GoalCutBackfillStats,
  type GoalJungsiBackfillSourceRow,
  goalCutConflictKey,
} from "../../../src/lib/goal/goalCutBackfill.js";
import { GOAL_CUTS_READ_CHUNK, GOAL_CUTS_TABLE, readChunks } from "./cuts.js";

const SOURCE_TABLE = "admission_results";
// upsert, update 배치 크기. 백필 최대 산출이 13,000행대라 27회 요청이 된다.
export const GOAL_CUTS_BACKFILL_CHUNK = 500;
const CONFLICT_COLUMNS = "cut_type,university_key,department_key";

export type PreserveMode = "preserve" | "overwrite";

function buildSourceQuery(
  client: SupabaseClient,
  yearMode: GoalBackfillYearMode,
  options: { head?: boolean } = {},
) {
  let query = options.head
    ? client
        .from(SOURCE_TABLE)
        .select("university_name", { count: "exact", head: true })
    : client
        .from(SOURCE_TABLE)
        .select(
          "university_name, department_name, main_track, grade_70, result_year",
        );
  query = query
    .eq("is_active", true)
    // percentile 은 0행이라 쓸 수 없다. grade_70 이 유일한 소스이고,
    // [1, 9] 밖 값은 goal_university_cuts 의 CHECK 를 위반한다.
    .gte("grade_70", 1)
    .lte("grade_70", 9)
    .in("screening_category", GOAL_BACKFILL_SCREENING_CATEGORIES);
  if (yearMode === "only2026") query = query.eq("result_year", 2026);
  else if (yearMode === "only2025") query = query.eq("result_year", 2025);
  else query = query.in("result_year", [2025, 2026]);
  return query;
}

export async function fetchBackfillSourceRows(
  client: SupabaseClient,
  yearMode: GoalBackfillYearMode,
  onProgress?: (progress: { done: number; total: number }) => void,
): Promise<GoalBackfillSourceRow[]> {
  const { count, error: countError } = await buildSourceQuery(
    client,
    yearMode,
    { head: true },
  );
  if (countError) throw new Error("backfill source count failed");
  const total = count ?? 0;
  return readChunks(
    total,
    async (from) => {
      const { data, error } = await buildSourceQuery(client, yearMode)
        // 정렬 없이 .range() 만 반복하면 페이지 경계에서 행이 중복, 누락된다.
        .order("id", { ascending: true })
        .range(from, from + GOAL_CUTS_READ_CHUNK - 1);
      if (error) throw new Error("backfill source read failed");
      // head 조회와 본조회를 한 함수로 만들어 반환 타입이 유니온이다. 이 호출은 항상 본조회 shape 다.
      return (data ?? []) as GoalBackfillSourceRow[];
    },
    (done) => onProgress?.({ done, total }),
  );
}

function buildJungsiSourceQuery(
  client: SupabaseClient,
  options: { head?: boolean } = {},
) {
  const query = options.head
    ? client
        .from(SOURCE_TABLE)
        .select("university_name", { count: "exact", head: true })
    : client
        .from(SOURCE_TABLE)
        .select("university_name, department_name, percentile, result_year");
  return (
    query
      .eq("is_active", true)
      // goal_university_cuts_avg_cut_check(jungsi 면 avg_cut 0..100)와 같은 범위로 방어한다.
      // gte, lte 비교는 NULL 을 자동으로 걸러낸다(percentile is null 행 제외).
      .gte("percentile", 0)
      .lte("percentile", 100)
  );
}

// 정시 백필은 1회 실행 스크립트만 쓴다(어드민 화면에는 없다).
export async function fetchJungsiBackfillSourceRows(
  client: SupabaseClient,
  onProgress?: (progress: { done: number; total: number }) => void,
): Promise<GoalJungsiBackfillSourceRow[]> {
  const { count, error: countError } = await buildJungsiSourceQuery(client, {
    head: true,
  });
  if (countError) throw new Error("jungsi source count failed");
  const total = count ?? 0;
  return readChunks(
    total,
    async (from) => {
      const { data, error } = await buildJungsiSourceQuery(client)
        .order("id", { ascending: true })
        .range(from, from + GOAL_CUTS_READ_CHUNK - 1);
      if (error) throw new Error("jungsi source read failed");
      return (data ?? []) as GoalJungsiBackfillSourceRow[];
    },
    (done) => onProgress?.({ done, total }),
  );
}

export interface GoalCutExistingRow {
  id: number;
  cut_type: string;
  university_key: string;
  university_name: string;
  department_key: string;
  department_name: string;
  source: string;
  is_active: boolean;
  note?: string | null;
}

// id 오름차순으로 청크 반복해 전량을 읽는다(order 없이 range 만 반복하면 경계에서 행이 겹치거나 빠진다).
async function fetchExistingCuts(
  client: SupabaseClient,
): Promise<GoalCutExistingRow[]> {
  const { count, error: countError } = await client
    .from(GOAL_CUTS_TABLE)
    .select("id", { count: "exact", head: true });
  if (countError) throw new Error("backfill existing count failed");
  return readChunks(count ?? 0, async (from) => {
    const { data, error } = await client
      .from(GOAL_CUTS_TABLE)
      .select(
        "id, cut_type, university_key, university_name, department_key, department_name, source, is_active, note",
      )
      .order("id", { ascending: true })
      .range(from, from + GOAL_CUTS_READ_CHUNK - 1);
    if (error) throw new Error("backfill existing read failed");
    return (data ?? []) as GoalCutExistingRow[];
  });
}

// 산출 payload 를 기존 행과 대조한다. 순수 함수다.
//
// 반환:
//   overlapCount   기존 행과 자연키가 겹치는 산출 행 수
//   manualCount / inactiveCount / notedCount  보존 술어별 건수(중복 가능)
//   preservedKeys  보존 대상 conflictKey 집합(= 산출에서 제외할 대상)
//   orphanIds      이번 산출에 없는 기존 유도 행(source=admission_results,
//                  is_active=true)의 id. source='manual' 은 절대 대상이 아니다.
//   nameAxisKeys   goal_university_cuts_name_key(partial UNIQUE, where is_active)와
//                  충돌해 청크 전체를 23505 로 죽일 산출 행. key 축에서는 안 걸리는데
//                  name 축에서만 걸리는 경우다(기존 행의 key 와 name 이 다를 때).
export function analyzeGoalCutBackfillAgainstExisting(
  payloads: GoalCutBackfillPayload[],
  existingRows: GoalCutExistingRow[],
) {
  const existingByConflictKey = new Map<string, GoalCutExistingRow>();
  const activeConflictKeyByNameKey = new Map<string, string>();
  for (const row of existingRows) {
    const conflictKey = goalCutConflictKey(
      row.cut_type,
      row.university_key,
      row.department_key,
    );
    existingByConflictKey.set(conflictKey, row);
    if (row.is_active) {
      const nameKey = goalCutConflictKey(
        row.cut_type,
        row.university_name,
        row.department_name,
      );
      if (!activeConflictKeyByNameKey.has(nameKey)) {
        activeConflictKeyByNameKey.set(nameKey, conflictKey);
      }
    }
  }

  let overlapCount = 0;
  let manualCount = 0;
  let inactiveCount = 0;
  let notedCount = 0;
  const preservedKeys = new Set<string>();
  const nameAxisKeys = new Set<string>();
  const producedKeys = new Set<string>();

  for (const p of payloads) {
    const conflictKey = goalCutConflictKey(
      p.cut_type,
      p.university_key,
      p.department_key,
    );
    producedKeys.add(conflictKey);

    const existing = existingByConflictKey.get(conflictKey);
    if (existing) {
      overlapCount += 1;
      let preserved = false;
      if (existing.source === "manual") {
        manualCount += 1;
        preserved = true;
      }
      if (existing.is_active === false) {
        inactiveCount += 1;
        preserved = true;
      }
      if (String(existing.note ?? "").trim() !== "") {
        notedCount += 1;
        preserved = true;
      }
      if (preserved) preservedKeys.add(conflictKey);
    }

    // key := name 이므로 payload 의 nameKey 는 conflictKey 와 같은 문자열이다.
    // 기존 활성 행이 같은 name 축을 다른 key 축으로 점유하고 있으면 23505 다.
    const holder = activeConflictKeyByNameKey.get(conflictKey);
    if (holder && holder !== conflictKey) nameAxisKeys.add(conflictKey);
  }

  const orphanIds = existingRows
    .filter(
      (row) =>
        row.source === "admission_results" &&
        row.is_active === true &&
        !producedKeys.has(
          goalCutConflictKey(
            row.cut_type,
            row.university_key,
            row.department_key,
          ),
        ),
    )
    .map((row) => row.id);

  return {
    overlapCount,
    manualCount,
    inactiveCount,
    notedCount,
    preservedKeys,
    nameAxisKeys,
    orphanIds,
  };
}

export interface BackfillPlan {
  stats: GoalCutBackfillStats;
  sourceRowCount: number;
  analysis: {
    overlapCount: number;
    manualCount: number;
    inactiveCount: number;
    notedCount: number;
    preservedCount: number;
    nameAxisCount: number;
  };
  applyPayloads: GoalCutBackfillPayload[];
  orphanIds: number[];
}

// 미리보기와 반영이 같은 함수를 쓴다. 반영은 이 계획을 다시 계산해 쓰므로 "확인한 N행"과 "반영하는 N행"이 어긋나지 않는다.
export async function planBackfill(
  client: SupabaseClient,
  options: { yearMode: GoalBackfillYearMode; preserveMode: PreserveMode },
): Promise<BackfillPlan> {
  // 기존 컷 읽기는 원천 행과 서로 기다릴 필요가 없다. 둘 다 읽은 뒤에 계산한다.
  const [sourceRows, existingRows] = await allInOrder(
    fetchBackfillSourceRows(client, options.yearMode),
    fetchExistingCuts(client),
  );
  const { payloads, stats } = computeGoalCutBackfill(
    sourceRows,
    options.yearMode,
  );
  const analysis = analyzeGoalCutBackfillAgainstExisting(
    payloads,
    existingRows,
  );
  const applyPayloads = payloads.filter((p) => {
    const key = goalCutConflictKey(
      p.cut_type,
      p.university_key,
      p.department_key,
    );
    if (analysis.nameAxisKeys.has(key)) return false;
    if (
      options.preserveMode === "preserve" &&
      analysis.preservedKeys.has(key)
    ) {
      return false;
    }
    return true;
  });
  return {
    stats,
    sourceRowCount: sourceRows.length,
    analysis: {
      overlapCount: analysis.overlapCount,
      manualCount: analysis.manualCount,
      inactiveCount: analysis.inactiveCount,
      notedCount: analysis.notedCount,
      preservedCount: analysis.preservedKeys.size,
      nameAxisCount: analysis.nameAxisKeys.size,
    },
    applyPayloads,
    orphanIds: analysis.orphanIds,
  };
}

export class BackfillApplyError extends Error {
  readonly applied: number;
  readonly step: "upsert" | "deactivate";
  readonly range: string;
  readonly dbError: unknown;
  constructor(
    step: "upsert" | "deactivate",
    applied: number,
    range: string,
    dbError: unknown,
  ) {
    super(`backfill ${step} chunk failed`);
    this.name = "BackfillApplyError";
    this.step = step;
    this.applied = applied;
    this.range = range;
    this.dbError = dbError;
  }
}

// 500행 청크로 upsert 한 뒤 고아 유도 행의 노출을 끈다. 삭제하지 않는다(되돌릴 수 있어야 한다).
// 청크는 트랜잭션이 아니다: 중간에 실패하면 앞 청크는 남고, applied 에 이미 반영된 행 수를 담아 던진다.
export async function applyBackfill(
  client: SupabaseClient,
  plan: Pick<BackfillPlan, "applyPayloads" | "orphanIds">,
  deactivateOrphans: boolean,
): Promise<{ applied: number; deactivated: number }> {
  let applied = 0;
  const rows = plan.applyPayloads;
  for (let i = 0; i < rows.length; i += GOAL_CUTS_BACKFILL_CHUNK) {
    const chunk = rows.slice(i, i + GOAL_CUTS_BACKFILL_CHUNK);
    // onConflict 는 goal_university_cuts_key(3컬럼 UNIQUE btree)를 가리킨다. payload 에 is_active 와 note 를
    // 싣지 않아 기존 행의 노출과 메모가 그대로 남는다.
    const { error } = await client
      .from(GOAL_CUTS_TABLE)
      .upsert(chunk, { onConflict: CONFLICT_COLUMNS });
    if (error) {
      throw new BackfillApplyError(
        "upsert",
        applied,
        `${i + 1}~${i + chunk.length}`,
        error,
      );
    }
    applied += chunk.length;
  }
  let deactivated = 0;
  if (deactivateOrphans) {
    const ids = plan.orphanIds;
    for (let i = 0; i < ids.length; i += GOAL_CUTS_BACKFILL_CHUNK) {
      const chunk = ids.slice(i, i + GOAL_CUTS_BACKFILL_CHUNK);
      const { error } = await client
        .from(GOAL_CUTS_TABLE)
        .update({ is_active: false })
        .in("id", chunk);
      if (error) {
        throw new BackfillApplyError(
          "deactivate",
          applied + deactivated,
          `${i + 1}~${i + chunk.length}`,
          error,
        );
      }
      deactivated += chunk.length;
    }
  }
  return { applied, deactivated };
}
