// GET /api/admin/revenue/pending 매출 화면의 환불 대기 건수. 관리자 앱(api/_routes/admin/app.ts)이 .route("/revenue", revenuePending) 로 붙인다.
// 매출 목록(루트 경로)은 api/_routes/admin/revenue.ts 가 맡는다. 응답 모양은 shared/revenue/pending.ts 를 따른다.
// approvalWaiting 은 승인 전, processWaiting 은 승인됐지만 실제 환불이 끝나지 않은 건이다
// (status 'completed' 가 실제 환불 완료라 그 전 단계를 센다). 권한: 메뉴 revenue view.

import type { RevenuePending } from "../../../shared/revenue/pending.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";

const guard = admin({
  permission: { key: "revenue" },
  unhandledMessage: "환불 대기 건수를 불러오지 못했어요.",
  logLabel: "[admin/revenue/pending]",
});

export const revenuePending = adminFactory
  .createApp()
  .get("/pending", guard, async (c) => {
    const db = c.var.supabaseAdmin;
    const [approval, process] = await Promise.all([
      db
        .from("refund_requests")
        .select("id", { count: "exact", head: true })
        .eq("approval_status", "requested"),
      db
        .from("refund_requests")
        .select("id", { count: "exact", head: true })
        .eq("approval_status", "approved")
        .in("status", ["requested", "processing"]),
    ]);
    if (approval.error || process.error) {
      throw new Error("refund pending count failed");
    }
    return c.json({
      approvalWaiting: approval.count ?? 0,
      processWaiting: process.count ?? 0,
    } satisfies RevenuePending);
  })
  .all("/pending", methodNotAllowed("GET"));
