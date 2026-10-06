// api/growth/plan 계열이 쓰는 얇은 DB 계층. 판단 로직은 mutations, view, metrics 에 있다.
// service_role 로 읽고 쓰므로 모든 쿼리에 profile_id 조건을 건다.

import { type Db, must } from "../intake/collectDb.js";
import type { PlanItemRow, PlanReportRow } from "./types.js";

const REPORT_COLUMNS =
  "id, profile_id, status, track, narrative_theme, grade_subthemes, stage, consistency, axis_scores, sections, issued_at";

const ITEM_COLUMNS =
  "id, report_id, profile_id, program, title, description, priority, axis, category, period, period_label, deadline, status, done_source_program, done_ref_id, done_at, carried_from_report_id, sort_order, updated_at";

/** 완료 회차 1건. reportId 가 없으면 issued_at 이 가장 늦은 완료 회차. 없으면 null. */
export async function loadPlanReport(
  db: Db,
  userId: string,
  reportId: string | null,
): Promise<PlanReportRow | null> {
  const base = db
    .from("growth_reports")
    .select(REPORT_COLUMNS)
    .eq("profile_id", userId)
    .eq("status", "completed");
  const data =
    reportId !== null
      ? must(
          await base.eq("id", reportId).maybeSingle(),
          "growth_reports 조회 실패",
        )
      : must(
          await base
            .order("issued_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          "growth_reports 조회 실패",
        );
  return (data as PlanReportRow | null) ?? null;
}

export async function loadPlanItems(
  db: Db,
  userId: string,
  reportId: string,
): Promise<PlanItemRow[]> {
  return must(
    await db
      .from("growth_plan_items")
      .select(ITEM_COLUMNS)
      .eq("report_id", reportId)
      .eq("profile_id", userId)
      .order("sort_order", { ascending: true }),
    "growth_plan_items 조회 실패",
  ) as PlanItemRow[];
}

export async function loadPlanItem(
  db: Db,
  userId: string,
  itemId: string,
): Promise<PlanItemRow | null> {
  const data = must(
    await db
      .from("growth_plan_items")
      .select(ITEM_COLUMNS)
      .eq("id", itemId)
      .eq("profile_id", userId)
      .maybeSingle(),
    "growth_plan_items 조회 실패",
  );
  return (data as PlanItemRow | null) ?? null;
}

/** 본인 소유이고 해당 프로그램이 만든 활동 기록인지. */
export async function loadActivityRef(
  db: Db,
  userId: string,
  refId: string,
  program: string,
): Promise<boolean> {
  const data = must(
    await db
      .from("activity_records")
      .select("id")
      .eq("id", refId)
      .eq("profile_id", userId)
      .eq("source_program", program)
      .maybeSingle(),
    "activity_records 조회 실패",
  );
  return data !== null;
}

/** 낙관적 잠금 갱신. updated_at 이 읽은 값과 같을 때만 쓴다. 0행이면 null(경쟁). */
export async function updatePlanItem(
  db: Db,
  userId: string,
  itemId: string,
  patch: Partial<PlanItemRow>,
  expectedUpdatedAt: string,
): Promise<PlanItemRow | null> {
  const rows = must(
    await db
      .from("growth_plan_items")
      .update(patch)
      .eq("id", itemId)
      .eq("profile_id", userId)
      .eq("updated_at", expectedUpdatedAt)
      .select(ITEM_COLUMNS),
    "growth_plan_items 갱신 실패",
  ) as PlanItemRow[];
  return rows[0] ?? null;
}
