// GET /api/admin/hq-dashboard/b2c?from=&to=&includeInternal=1
// Authorization: Bearer <supabase access token>
//
// 위닝 B2C 요약(분석 grill Q5 A11). B2C 회원은 소속 기관이 없거나 기타 소속(is_catch_all)인 회원이다.
// 회원 수는 지금 기준(유형별), 결제는 기간 안 결제일(보는 사람 시간대 X-Time-Zone) 기준 admin_revenue_items 합이다(매출 및 결제 화면과 같은 원천).
// B2C DAU, MAU 는 logins?scope=b2c 가 준다. includeInternal=1 이면 QA, 본사 관리자 계정도 센다.
//   200 { from, to, includeInternal, members { total, byMemberType },
//         payments { payingMembers, orderCount, paidAmount, refundedAmount, netAmount } }
// 권한: 메뉴 권한 hqDashboard view 이상(defineHandler permission).
// 오류(problem): 400 VALIDATION_FAILED(기간), 400 TIME_ZONE_REQUIRED, 401, 403 FORBIDDEN, 405, 500 INTERNAL_ERROR.
// 읽기 전용 라우트라 쓰기 경계는 해당 없다.

import { defineHandler, requireTimeZone } from "../../../_lib/handler.js";
import { parsePeriod, periodQuery } from "../../../_lib/hq-dashboard/period.js";
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
  auth: "admin",
  errorShape: "problem",
  permission: { key: "hqDashboard" },
  query: periodQuery,
  unhandledMessage: "B2C 요약을 불러오지 못했습니다.",
  logLabel: "[admin/hq-dashboard/b2c]",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    const db = ctx.supabaseAdmin;
    const { includeInternal } = ctx.query;
    const timeZone = requireTimeZone(ctx);
    const period = parsePeriod(ctx.query, timeZone);
    if (typeof period === "string") {
      sendError(res, "problem", 400, period, "VALIDATION_FAILED");
      return;
    }

    const { data, error } = await db.rpc("fn_hq_b2c_summary", {
      p_from: period.from,
      p_to: period.to,
      p_include_internal: includeInternal,
      p_tz: timeZone,
    });
    const row = ((data ?? []) as SummaryRow[])[0];
    if (error || !row)
      throw new Error(
        `fn_hq_b2c_summary 실패: ${error?.message ?? "결과 없음"}`,
      );

    res.status(200).json({
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
