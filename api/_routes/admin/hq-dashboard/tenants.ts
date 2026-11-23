// GET /api/admin/hq-dashboard/tenants
//
// 기관 현황 표(계획 4번 A3, A4, A6): 기관마다 계약 상태, 학생 수(Q9), 선생님 수, 마지막 활동일, 목표 실행률 평균.
// 기관 수가 많지 않아 전체를 한 번에 주고 검색, 필터, 정렬, 쪽 나누기와 엑셀은 화면이 한다.
// 권한: 로그인 + HQ 권한 hqDashboard view 이상. 두 사이트 공통.
// includeInternal=1 이면 QA, 본사 관리자 계정도 센다(기본 제외, 분석 grill Q3).

import { kstYMD } from "../../../../src/lib/goal/calc/index.js";
import { defineHandler } from "../../../_lib/handler.js";
import {
  loadTenantGoals,
  loadTenantOverview,
  parseIncludeInternal,
} from "../../../_lib/hq-dashboard/overview.js";
import { hasHqDashboardViewPermission } from "../../../_lib/hq-dashboard/permission.js";
import { sendError } from "../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "기관 현황을 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[admin/hq-dashboard/tenants]",
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
    const [rows, goals] = await Promise.all([
      loadTenantOverview(ctx.supabaseAdmin, includeInternal),
      loadTenantGoals(ctx.supabaseAdmin, includeInternal),
    ]);
    res.status(200).json({
      ok: true,
      asOf: kstYMD(),
      tenants: rows.map((row) => ({
        ...row,
        goalRateAverage: goals.get(row.tenantId)?.average ?? null,
        goalUserCount: goals.get(row.tenantId)?.userCount ?? 0,
      })),
    });
  },
});
