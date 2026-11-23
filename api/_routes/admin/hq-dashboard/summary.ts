// GET /api/admin/hq-dashboard/summary
//
// 대시보드 합계 카드(계획 4번 A1, A2): 기관 수, 학생 수(Q9), 선생님 수, 계약 상태별 기관 수.
// 권한: 로그인 + HQ 권한 hqDashboard view 이상. 두 사이트 공통.
// includeInternal=1 이면 QA, 본사 관리자 계정도 센다(기본 제외, 분석 grill Q3).

import { defineHandler } from "../../../_lib/handler.js";
import {
  loadTenantOverview,
  parseIncludeInternal,
  summarizeTenants,
} from "../../../_lib/hq-dashboard/overview.js";
import { hasHqDashboardViewPermission } from "../../../_lib/hq-dashboard/permission.js";
import { sendError } from "../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "대시보드 합계를 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[admin/hq-dashboard/summary]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    if (
      !(await hasHqDashboardViewPermission(
        ctx.supabaseAdmin,
        ctx.userId as string,
      ))
    ) {
      sendError(res, "coded", 403, "대시보드 권한이 없습니다.", "FORBIDDEN");
      return;
    }
    const includeInternal = parseIncludeInternal(req.query.includeInternal);
    if (includeInternal === null) {
      sendError(res, "coded", 400, "포함 여부를 확인해 주세요.", "BAD_REQUEST");
      return;
    }
    const rows = await loadTenantOverview(ctx.supabaseAdmin, includeInternal);
    res.status(200).json({
      ok: true,
      asOf: new Date().toISOString(),
      ...summarizeTenants(rows),
    });
  },
});
