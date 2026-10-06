// GET /api/growth/reports
// Authorization: Bearer <access_token>
//
// 성장설계 저장 리포트 조회 엔드포인트. 목록과 상세를 한 GET 라우트로 묶는다
// (performance/reports.ts 와 같은 관례). 쿼리 파라미터로 모드를 가른다.
//
//   ① 목록 `GET /api/growth/reports`
//      200 { ok, items[{ id, status, track, issuedAt, theme, lastActivityAt,
//            plan:{ total, done }|null }], open|null, archivedCount }
//      items 는 완료(completed) 회차만, last_activity_at 내림차순이다.
//      open 은 미완(draft, in_progress) 회차 요약 1건이다(생성 화면 재진입용).
//      { id, status, currentStep, track, progress[], nextStep, terminal|null, lastActivityAt }
//      보관(archived) 회차는 archivedCount 로 수만 알려 준다.
//   ② 상세 `GET /api/growth/reports?reportId=<uuid>[&view=parent]`
//      200 { ok, report:{ id, status, track, issuedAt, currentStep, progress[],
//            narrative|null, overview[], consistency, axes, sections[],
//            excludedSectionIds[], planItems[], lastActivityAt } }
//      view=parent 면 성적 민감 섹션(1-12, 1-13, 1-14, 3-10)을 빼고 그 id 를
//      excludedSectionIds 로 알려 준다. 한눈에 카드도 남은 섹션만으로 만든다.
//
//   400 INVALID_QUERY
//   404 REPORT_NOT_FOUND   (없는 회차와 남의 회차를 같은 응답으로 묶는다)
//   409 REPORT_NOT_COMPLETED { open }  (완료 전이면 생성 화면으로 보낼 요약을 준다)
//   405 METHOD_NOT_ALLOWED / 500 INTERNAL
//
// 소유자 격리: service_role 로 읽으므로 모든 쿼리에 .eq("profile_id", userId)를 건다.
// 학부모 권한: view=parent 는 이번 단계에서 본인(학생)이 호출해도 같은 필터를 적용한다.
// 학부모 계정의 연결 학생 확인은 P8 에서 이 라우트에 붙인다.
//
// 핸들러 본문은 DB 에 묶여 단위 테스트하지 않는다. 조립 규칙은
// api/_lib/growth/report/view.ts 의 순수 함수로 검증한다.

import type { VercelResponse } from "@vercel/node";
import { type Db, must } from "../_lib/growth/intake/collectDb.js";
import {
  detailBody,
  listItem,
  openSummary,
  type PlanCounts,
  parseReportsQuery,
  planCounts,
  type StoredPlanItemRow,
  type StoredReportRow,
} from "../_lib/growth/report/view.js";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";

const REPORT_COLUMNS =
  "id, status, current_step, track, narrative_theme, grade_subthemes, stage, axis_scores, consistency, sections, signals, issued_at, activity_ids, step_state, last_activity_at, created_at";

const PLAN_COLUMNS =
  "id, program, title, description, priority, axis, category, period, period_label, deadline, status, done_source_program, done_at, carried_from_report_id, sort_order";

function fail(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  sendError(res, "coded", status, message, code, { ok: false, ...extra });
}

async function handleList(res: VercelResponse, db: Db, userId: string) {
  const rows = must(
    await db
      .from("growth_reports")
      .select(REPORT_COLUMNS)
      .eq("profile_id", userId)
      .order("last_activity_at", { ascending: false }),
    "growth_reports 조회 실패",
  ) as StoredReportRow[];

  const completed = rows.filter((r) => r.status === "completed");
  const open =
    rows.find((r) => r.status === "draft" || r.status === "in_progress") ??
    null;

  const countsByReport = new Map<string, { status: string }[]>();
  if (completed.length > 0) {
    const plans = must(
      await db
        .from("growth_plan_items")
        .select("report_id, status")
        .eq("profile_id", userId)
        .in(
          "report_id",
          completed.map((r) => r.id),
        ),
      "growth_plan_items 조회 실패",
    ) as { report_id: string; status: string }[];
    for (const p of plans) {
      const list = countsByReport.get(p.report_id) ?? [];
      list.push(p);
      countsByReport.set(p.report_id, list);
    }
  }

  res.status(200).json({
    ok: true,
    items: completed.map((r) => {
      const plans = countsByReport.get(r.id);
      const counts: PlanCounts | null = plans ? planCounts(plans) : null;
      return listItem(r, counts);
    }),
    open: open ? openSummary(open) : null,
    archivedCount: rows.filter((r) => r.status === "archived").length,
  });
}

async function handleDetail(
  res: VercelResponse,
  db: Db,
  userId: string,
  reportId: string,
  parent: boolean,
) {
  const row = must(
    await db
      .from("growth_reports")
      .select(REPORT_COLUMNS)
      .eq("id", reportId)
      .eq("profile_id", userId)
      .maybeSingle(),
    "growth_reports 조회 실패",
  ) as StoredReportRow | null;
  if (!row) {
    fail(res, 404, "REPORT_NOT_FOUND", "리포트를 찾을 수 없어요.");
    return;
  }
  if (row.status !== "completed") {
    fail(
      res,
      409,
      "REPORT_NOT_COMPLETED",
      "아직 완성되지 않은 리포트예요.",
      row.status === "draft" || row.status === "in_progress"
        ? { open: openSummary(row) }
        : {},
    );
    return;
  }

  const activityIds = row.activity_ids ?? [];
  const [planItems, activityRows] = await Promise.all([
    db
      .from("growth_plan_items")
      .select(PLAN_COLUMNS)
      .eq("report_id", row.id)
      .eq("profile_id", userId)
      .order("sort_order", { ascending: true }),
    activityIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : db
          .from("activity_records")
          .select("id, grade_label, semester")
          .eq("profile_id", userId)
          .in("id", activityIds),
  ]);
  const plans = must(
    planItems,
    "growth_plan_items 조회 실패",
  ) as StoredPlanItemRow[];
  const activities = (
    must(activityRows, "activity_records 조회 실패") as {
      grade_label: string | null;
      semester: number | null;
    }[]
  ).map((a) => ({ gradeLabel: a.grade_label, semester: a.semester }));

  res
    .status(200)
    .json({ ok: true, report: detailBody(row, plans, activities, { parent }) });
}

export default defineHandler({
  methods: ["GET"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "GET만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "성장설계 리포트를 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "growth/reports",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const userId = requireUserId(ctx);
    const query = parseReportsQuery(req.query ?? {});
    if (!query.ok) {
      fail(res, 400, "INVALID_QUERY", query.reason);
      return;
    }
    if (query.reportId === undefined) {
      await handleList(res, ctx.supabaseAdmin, userId);
      return;
    }
    await handleDetail(
      res,
      ctx.supabaseAdmin,
      userId,
      query.reportId,
      query.view === "parent",
    );
  },
});

export const config = { runtime: "nodejs" };
