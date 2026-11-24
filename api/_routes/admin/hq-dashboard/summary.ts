// GET /api/admin/hq-dashboard/summary[?includeInternal=0|1]
//
// 대시보드 합계 카드(계획 4번 A1, A2): 기관 수, 학생 수(Q9), 선생님 수, 계약 상태별 기관 수.
// 권한: 메뉴 권한 hqDashboard view 이상(defineHandler permission). 두 사이트 공통.
// includeInternal=1 이면 QA, 본사 관리자 계정도 센다(기본 제외, 분석 grill Q3).
//   200 { asOf, tenantCount, studentCount, studentWithoutEnrollmentCount, teacherCount, contracts }
// 오류(problem): 400 VALIDATION_FAILED(includeInternal 이 0, 1 이 아님), 401, 403 FORBIDDEN, 405, 500 INTERNAL_ERROR.
// 읽기 전용 라우트라 쓰기 경계는 해당 없다.

import { defineHandler } from "../../../_lib/handler.js";
import {
  includeInternalQuery,
  loadTenantOverview,
  summarizeTenants,
} from "../../../_lib/hq-dashboard/overview.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "hqDashboard" },
  query: includeInternalQuery,
  unhandledMessage: "대시보드 합계를 불러오지 못했습니다.",
  logLabel: "[admin/hq-dashboard/summary]",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    const rows = await loadTenantOverview(
      ctx.supabaseAdmin,
      ctx.query.includeInternal,
    );
    res.status(200).json({
      asOf: new Date().toISOString(),
      ...summarizeTenants(rows),
    });
  },
});
