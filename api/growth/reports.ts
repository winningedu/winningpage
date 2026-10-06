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
//      lastTerminal 은 종결 사유가 있는 archived 중 가장 최근 1건
//      { reportId, reason, at, step } 또는 null 이다(90일 만료 archived 와 구분).
//      목록은 큰 jsonb(sections, signals 등)를 읽지 않는다.
//   ② 상세 `GET /api/growth/reports?reportId=<uuid>[&view=parent]`
//      200 { ok, report:{ id, status, track, issuedAt, currentStep, progress[],
//            range:{ semesters, description }|null, omitted:{ ids, reasons }|null,
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
// 학부모 열람(childId):
//   A. `GET ?childId=<학생 uuid>` 학부모 토큰. 연결(approved)된 자녀가 아니면 403 NOT_LINKED.
//      200 { ok, items(완료 회차만), open:null, archivedCount:0, lastTerminal:null,
//            child:{ id, name|null } }
//   B. `GET ?reportId=<uuid>&childId=<학생 uuid>&view=parent` 연결 검증 뒤 자녀의 완료 회차
//      상세를 parent 모양으로 준다. 미완이면 404 REPORT_NOT_FOUND(존재를 알리지 않는다).
//   childId 없이 view=parent 를 본인이 부르는 기존 동작은 그대로다.
//
// 소유자 격리: service_role 로 읽으므로 모든 쿼리에 .eq("profile_id", userId)를 건다.
// childId 가 있으면 필터 대상이 호출자가 아니라 연결 검증을 통과한 자녀 id 다.
//
// 핸들러 본문은 DB 에 묶여 단위 테스트하지 않는다. 조립 규칙은
// api/_lib/growth/report/view.ts 의 순수 함수로 검증한다.

import type { VercelResponse } from "@vercel/node";
import { type Db, must } from "../_lib/growth/intake/collectDb.js";
import {
  assertParentOfChild,
  NotLinkedError,
} from "../_lib/growth/report/parentAccess.js";
import {
  detailBody,
  lastTerminalOf,
  listItem,
  openSummary,
  type PlanCounts,
  parseReportsQuery,
  planCounts,
  type StoredListRow,
  type StoredPlanItemRow,
  type StoredReportRow,
} from "../_lib/growth/report/view.js";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";

const LIST_COLUMNS =
  "id, status, track, narrative_theme, issued_at, last_activity_at, step_state, current_step";

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

async function childSummary(db: Db, childId: string) {
  const row = must(
    await db.from("profiles").select("name").eq("id", childId).maybeSingle(),
    "profiles 조회 실패",
  ) as { name: string | null } | null;
  return { id: childId, name: row?.name ?? null };
}

async function handleList(
  res: VercelResponse,
  db: Db,
  userId: string,
  child?: { id: string },
) {
  const rows = must(
    await db
      .from("growth_reports")
      .select(LIST_COLUMNS)
      .eq("profile_id", userId)
      .order("last_activity_at", { ascending: false }),
    "growth_reports 조회 실패",
  ) as StoredListRow[];

  const completed = rows.filter((r) => r.status === "completed");
  const open = child
    ? null
    : (rows.find((r) => r.status === "draft" || r.status === "in_progress") ??
      null);

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
    ...(child !== undefined && { child: await childSummary(db, child.id) }),
    items: completed.map((r) => {
      const plans = countsByReport.get(r.id);
      const counts: PlanCounts | null = plans ? planCounts(plans) : null;
      return listItem(r, counts);
    }),
    open: open ? openSummary(open) : null,
    archivedCount: child
      ? 0
      : rows.filter((r) => r.status === "archived").length,
    lastTerminal: child ? null : lastTerminalOf(rows),
  });
}

async function handleDetail(
  res: VercelResponse,
  db: Db,
  userId: string,
  reportId: string,
  parent: boolean,
  hideUnfinished = false,
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
  if (row.status !== "completed" && hideUnfinished) {
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
    const db = ctx.supabaseAdmin;
    // 학부모가 자녀를 지정하면 연결을 확인하고 이후 모든 조회를 자녀 id 로 한다.
    let ownerId = userId;
    const asParent = query.childId !== undefined;
    if (query.childId !== undefined) {
      try {
        await assertParentOfChild(db, userId, query.childId);
      } catch (e) {
        if (e instanceof NotLinkedError) {
          fail(res, 403, "NOT_LINKED", "연결된 자녀가 아니에요.");
          return;
        }
        throw e;
      }
      ownerId = query.childId;
    }
    if (query.reportId === undefined) {
      await handleList(
        res,
        db,
        ownerId,
        asParent ? { id: ownerId } : undefined,
      );
      return;
    }
    await handleDetail(
      res,
      db,
      ownerId,
      query.reportId,
      asParent || query.view === "parent",
      asParent,
    );
  },
});

export const config = { runtime: "nodejs" };
