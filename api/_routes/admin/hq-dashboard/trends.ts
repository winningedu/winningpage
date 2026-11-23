// GET /api/admin/hq-dashboard/trends?from=&to=&grain=&mau=&includeInternal=1
// Authorization: Bearer <supabase access token>
//
// 본사 대시보드 추이(분석 grill Q5 A10). 로그인 지표(logins)와 같은 기간, 묶음(grain), MAU 기준(mau)으로 묶어
// 묶음마다 새 가입 회원 수(유형별)와 결제 주문 수(paid, refunded, 결제일)를 보는 사람 시간대(X-Time-Zone) 하루로 센다(fn_hq_trend_buckets).
// includeInternal=1 이면 QA, 본사 관리자 계정도 센다(기본 제외, fn_hq_stat_included).
//   200 { ok, from, to, grain, mauMode, includeInternal, series[] }
//   series[]: start, end, signups, signupsByMemberType, paidOrders
// 권한: 로그인 + hqDashboard 보기 권한. 오류(coded): 400 INVALID_QUERY, 401, 403 FORBIDDEN, 500 INTERNAL.

import { defineHandler, requireTimeZone } from "../../../_lib/handler.js";
import {
  GRAINS,
  MAU_MODES,
  parsePeriod,
  pick,
} from "../../../_lib/hq-dashboard/period.js";
import { hasHqDashboardViewPermission } from "../../../_lib/hq-dashboard/permission.js";
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
  auth: "user",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "추이를 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[admin/hq-dashboard/trends]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const db = ctx.supabaseAdmin;
    if (!(await hasHqDashboardViewPermission(db, ctx.userId as string))) {
      sendError(res, "coded", 403, "대시보드 권한이 없습니다.", "FORBIDDEN");
      return;
    }
    const invalid = (message: string) =>
      sendError(res, "coded", 400, message, "INVALID_QUERY");

    const timeZone = requireTimeZone(ctx);
    const period = parsePeriod(req.query, timeZone);
    if (typeof period === "string") return invalid(period);
    const grain = pick(req.query.grain, GRAINS, "day");
    if (!grain) return invalid("grain 이 올바르지 않습니다.");
    const mauMode = pick(req.query.mau, MAU_MODES, "calendar");
    if (!mauMode) return invalid("mau 가 올바르지 않습니다.");
    const includeInternal = req.query.includeInternal === "1";

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
      ok: true,
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
