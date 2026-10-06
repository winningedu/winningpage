// PATCH /api/growth/plan/item
// Authorization: Bearer <access_token>
//
// 실행계획 항목 상태 변경(명세 No.161, 164). 한 라우트에 두 액션을 둔다.
//
// 요청  { itemId: uuid, action: "check", done: boolean }
//       { itemId: uuid, action: "set-deadline", deadline: "YYYY-MM-DD" | null }   과목 선택 시기 항목만
// 응답  200 { ok: true, changed: true, item, progress, nextDeadline, metrics }
//         item 은 조회 응답과 같은 PlanItemView(마감 상태 포함),
//         progress 는 그 회차 전체 항목으로 다시 센 { total, done, remaining, percent },
//         nextDeadline 은 갱신 뒤 미완료 항목 중 가장 이른 마감(없으면 null),
//         metrics 는 갱신 뒤 항목으로 다시 계산한 지표(스냅샷이 깨지면 null).
//       200 { ok: true, changed: false, reason, item }   이미 같은 상태(변경 없음), item 은 PlanItemView
//         reason: already_done, already_pending, same_deadline
//
// 오류 코드
//   INVALID_BODY 400(program-done 같은 허용되지 않는 액션 포함), ITEM_NOT_FOUND 404(남의 항목 포함),
//   REPORT_NOT_COMPLETED 409, REPORT_NOT_LATEST 409(최신 완료 회차의 항목이 아님),
//   PROGRAM_DONE_LOCKED 409(하위 프로그램 확정 항목의 체크 해제),
//   DEADLINE_NOT_ALLOWED 409,
//   CONFLICT 409(낙관적 잠금 경쟁, 다시 불러온 뒤 재시도),
//   METHOD_NOT_ALLOWED 405, UNAUTHENTICATED 401, INTERNAL 500.
//
// 판정은 api/_lib/growth/plan/mutations 의 decideMutation 이 한다. 쓰기는 읽은 updated_at 을
// 조건으로 건 낙관적 잠금이다. 하위 프로그램 확정(program-done)은 이 라우트로 받지 않고
// 서버 간 함수 api/_lib/growth/plan/complete 만 쓴다.
// 최신 완료 회차의 항목만 바꿀 수 있다. 다음 회차는 미완료 항목을 복사해 이월하므로, 지난 회차의
// 항목을 바꾸면 이월 복사본과 상태가 둘로 갈라진다(이중 상태 방지).
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
  updatePlanItem,
} from "../../_lib/growth/plan/planDb.js";
import {
  nextDeadline,
  progress,
  todayKstIso,
  toItemView,
} from "../../_lib/growth/plan/view.js";
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
    const report = await loadPlanReport(db, userId, item.report_id);
    if (!report) {
      fail(
        res,
        409,
        "REPORT_NOT_COMPLETED",
        "완료된 리포트의 항목만 바꿀 수 있어요.",
      );
      return;
    }
    const latest = await loadPlanReport(db, userId, null);
    if (!latest || latest.id !== item.report_id) {
      fail(
        res,
        409,
        "REPORT_NOT_LATEST",
        "최신 리포트의 실행계획만 바꿀 수 있어요",
      );
      return;
    }
    const nowMs = Date.now();
    const todayIso = todayKstIso(nowMs);

    const decision = decideMutation(
      item,
      body.action,
      new Date(nowMs).toISOString(),
    );
    if (decision.kind === "reject") {
      fail(res, 409, decision.code, decision.message);
      return;
    }
    if (decision.kind === "noop") {
      res.status(200).json({
        ok: true,
        changed: false,
        reason: decision.reason,
        item: toItemView(item, todayIso),
      });
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
    res.status(200).json({
      ok: true,
      changed: true,
      item: toItemView(updated, todayIso),
      progress: progress(items),
      nextDeadline: nextDeadline(items, todayIso),
      metrics: planMetrics(report, items),
    });
  },
});

export const config = { runtime: "nodejs" };
