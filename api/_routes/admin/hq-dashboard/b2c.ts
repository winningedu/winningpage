// GET /api/admin/hq-dashboard/b2c?from=&to=&includeInternal=1
// Authorization: Bearer <supabase access token>
//
// 위닝 B2C 요약(분석 grill Q5 A11). B2C 회원은 소속 기관이 없거나 기타 소속(is_catch_all)인 회원이다.
// 회원 수는 지금 기준(유형별), 결제는 기간 안 결제일(KST) 기준 admin_revenue_items 합이다(매출 및 결제 화면과 같은 원천).
// B2C DAU, MAU 는 logins?scope=b2c 가 준다. includeInternal=1 이면 QA, 본사 관리자 계정도 센다.
//   200 { ok, from, to, includeInternal, members { total, byMemberType },
//         payments { payingMembers, orderCount, paidAmount, refundedAmount, netAmount } }
// 권한: 로그인 + hqDashboard 보기 권한. 오류(coded): 400 INVALID_QUERY, 401, 403 FORBIDDEN, 500 INTERNAL.

import { defineHandler } from "../../../_lib/handler.js";
import { parsePeriod } from "../../../_lib/hq-dashboard/period.js";
import { hasHqDashboardViewPermission } from "../../../_lib/hq-dashboard/permission.js";
import { sendError } from "../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

interface SummaryRow {
  member_total: number;
  by_member_type: Record<string, number>;
  paying_members: number;
  order_count: number;
  paid_amount: number;
  refunded_amount: number;
  net_amount: number;
}

export default defineHandler({
  methods: ["GET"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "B2C 요약을 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[admin/hq-dashboard/b2c]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const db = ctx.supabaseAdmin;
    if (!(await hasHqDashboardViewPermission(db, ctx.userId as string))) {
      sendError(res, "coded", 403, "대시보드 권한이 없습니다.", "FORBIDDEN");
      return;
    }
    const period = parsePeriod(req.query);
    if (typeof period === "string") {
      sendError(res, "coded", 400, period, "INVALID_QUERY");
      return;
    }
    const includeInternal = req.query.includeInternal === "1";

    const { data, error } = await db.rpc("fn_hq_b2c_summary", {
      p_from: period.from,
      p_to: period.to,
      p_include_internal: includeInternal,
    });
    const row = ((data ?? []) as SummaryRow[])[0];
    if (error || !row)
      throw new Error(
        `fn_hq_b2c_summary 실패: ${error?.message ?? "결과 없음"}`,
      );

    res.status(200).json({
      ok: true,
      from: period.from,
      to: period.to,
      includeInternal,
      members: {
        total: Number(row.member_total),
        byMemberType: row.by_member_type,
      },
      payments: {
        payingMembers: Number(row.paying_members),
        orderCount: Number(row.order_count),
        paidAmount: Number(row.paid_amount),
        refundedAmount: Number(row.refunded_amount),
        netAmount: Number(row.net_amount),
      },
    });
  },
});
