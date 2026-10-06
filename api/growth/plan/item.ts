// PATCH /api/growth/plan/item
// Authorization: Bearer <access_token>
//
// 실행계획 항목 상태 변경(명세 No.161, 164). 한 라우트에 세 액션을 둔다.
//
// 요청  { itemId: uuid, action: "check", done: boolean }
//       { itemId: uuid, action: "set-deadline", deadline: "YYYY-MM-DD" | null }   과목 선택 시기 항목만
//       { itemId: uuid, action: "program-done", program: "self" | "deep", refId: uuid }
// 응답  200 { ok: true, changed: true, item, progress, metrics }
//         progress 는 그 회차 전체 항목으로 다시 센 { total, done, remaining, percent },
//         metrics 는 갱신 뒤 항목으로 다시 계산한 지표(스냅샷이 깨지면 null).
//       200 { ok: true, changed: false, reason, item }   이미 같은 상태(변경 없음)
//         reason: already_done, already_pending, same_deadline, duplicate_confirm
//
// 오류 코드
//   INVALID_BODY 400, ITEM_NOT_FOUND 404(남의 항목 포함), REPORT_NOT_COMPLETED 409,
//   PROGRAM_DONE_LOCKED 409(하위 프로그램 확정 항목의 체크 해제),
//   DEADLINE_NOT_ALLOWED 409, PROGRAM_MISMATCH 409,
//   CONFLICT 409(낙관적 잠금 경쟁, 다시 불러온 뒤 재시도),
//   METHOD_NOT_ALLOWED 405, UNAUTHENTICATED 401, INTERNAL 500.
//
// 판정은 api/_lib/growth/plan/mutations 의 decideMutation 이 한다. 쓰기는 읽은 updated_at 을
// 조건으로 건 낙관적 잠금이다. program-done 은 원래 하위 프로그램이 서버 간으로 부르는 경로
// (api/_lib/growth/plan/complete)이고, 이 라우트의 같은 액션은 같은 규칙을 따른다.
// 소유자 격리: service_role 로 쓰므로 모든 쿼리에 profile_id 조건을 건다.
// 핸들러 본문은 DB 에 묶여 단위 테스트하지 않는다.

import type { VercelResponse } from "@vercel/node";
import { planMetrics } from "../../_lib/growth/plan/metrics.js";
import {
  decideMutation,
  validatePlanItemBody,
} from "../../_lib/growth/plan/mutations.js";
import {
  loadPlanItem,
  loadPlanItems,
  loadPlanReport,
  loadReportStatus,
  updatePlanItem,
} from "../../_lib/growth/plan/planDb.js";
import { progress } from "../../_lib/growth/plan/view.js";
import { defineHandler, requireUserId } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

function fail(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
) {
  sendError(res, "coded", status, message, code, { ok: false });
}

export default defineHandler({
  methods: ["PATCH"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "PATCH만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "실행계획 항목을 바꾸지 못했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "growth/plan/item",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const userId = requireUserId(ctx);
    const db = ctx.supabaseAdmin;
    const body = validatePlanItemBody(req.body);
    if (!body.ok) {
      fail(res, 400, "INVALID_BODY", body.reason);
      return;
    }
    const item = await loadPlanItem(db, userId, body.action.itemId);
    if (!item) {
      fail(res, 404, "ITEM_NOT_FOUND", "실행계획 항목을 찾을 수 없어요.");
      return;
    }
    const status = await loadReportStatus(db, userId, item.report_id);
    if (status !== "completed") {
      fail(
        res,
        409,
        "REPORT_NOT_COMPLETED",
        "완료된 리포트의 항목만 바꿀 수 있어요.",
      );
      return;
    }

    const decision = decideMutation(
      item,
      body.action,
      new Date().toISOString(),
    );
    if (decision.kind === "reject") {
      fail(res, 409, decision.code, decision.message);
      return;
    }
    if (decision.kind === "noop") {
      res
        .status(200)
        .json({ ok: true, changed: false, reason: decision.reason, item });
      return;
    }
    const updated = await updatePlanItem(
      db,
      userId,
      item.id,
      decision.patch,
      item.updated_at,
    );
    if (!updated) {
      fail(
        res,
        409,
        "CONFLICT",
        "다른 요청이 먼저 바꿨어요. 다시 불러와 주세요.",
      );
      return;
    }
    const items = await loadPlanItems(db, userId, item.report_id);
    const report = await loadPlanReport(db, userId, item.report_id);
    res.status(200).json({
      ok: true,
      changed: true,
      item: updated,
      progress: progress(items),
      metrics: report ? planMetrics(report, items) : null,
    });
  },
});

export const config = { runtime: "nodejs" };
