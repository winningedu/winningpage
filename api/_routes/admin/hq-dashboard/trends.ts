// GET /api/admin/hq-dashboard/trends?from=&to=&grain=&mau=&includeInternal=1
// Authorization: Bearer <supabase access token>
//
// 본사 대시보드 추이(분석 grill Q5 A10). 로그인 지표(logins)와 같은 기간, 묶음(grain), MAU 기준(mau)으로 묶어
// 묶음마다 새 가입 회원 수(유형별)와 결제 주문 수(paid, refunded, 결제일)를 보는 사람 시간대(X-Time-Zone) 하루로 센다(fn_hq_trend_buckets).
// includeInternal=1 이면 QA, 본사 관리자 계정도 센다(기본 제외, fn_hq_stat_included).
//   200 { from, to, grain, mauMode, includeInternal, series[] }
//   series[]: start, end, signups, signupsByMemberType, paidOrders
// 권한: 메뉴 권한 hqDashboard view 이상(defineHandler permission).
// 오류(problem): 400 VALIDATION_FAILED(기간, grain, mau), 400 TIME_ZONE_REQUIRED, 401, 403 FORBIDDEN, 405, 500 INTERNAL_ERROR.
// 읽기 전용 라우트라 쓰기 경계는 해당 없다.

import { defineHandler, requireTimeZone } from "../../../_lib/handler.js";
import { parsePeriod, statsQuery } from "../../../_lib/hq-dashboard/period.js";
import { sendError } from "../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

interface TrendRow {
  bucket_start: string;
  bucket_end: string;
  signups: number;
  signups_by_member_type: Record<string, number>;
  paid_orders: number;
}

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "hqDashboard" },
  query: statsQuery,
  unhandledMessage: "추이를 불러오지 못했습니다.",
  logLabel: "[admin/hq-dashboard/trends]",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    const db = ctx.supabaseAdmin;
    const { grain, mau: mauMode, includeInternal } = ctx.query;
    const timeZone = requireTimeZone(ctx);
    const period = parsePeriod(ctx.query, timeZone);
    if (typeof period === "string") {
      sendError(res, "problem", 400, period, "VALIDATION_FAILED");
      return;
    }

    const { data, error } = await db.rpc("fn_hq_trend_buckets", {
      p_from: period.from,
      p_to: period.to,
      p_grain: grain,
      p_mau_mode: mauMode,
      p_include_internal: includeInternal,
      p_tz: timeZone,
    });
    if (error) throw new Error(`fn_hq_trend_buckets 실패: ${error.message}`);

    res.status(200).json({
      from: period.from,
      to: period.to,
      grain,
      mauMode,
      includeInternal,
      series: ((data ?? []) as TrendRow[]).map((row) => ({
        start: row.bucket_start,
        end: row.bucket_end,
        signups: Number(row.signups),
        signupsByMemberType: row.signups_by_member_type,
        paidOrders: Number(row.paid_orders),
      })),
    });
  },
});
