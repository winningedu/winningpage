// GET /api/admin/hq-dashboard/tenants[?includeInternal=0|1]
//
// 기관 현황 표(계획 4번 A3, A4, A6): 기관마다 계약 상태, 학생 수(Q9), 선생님 수, 마지막 활동 순간, 목표 실행률 평균.
// 기관 수가 많지 않아 전체를 한 번에 주고 검색, 필터, 정렬, 쪽 나누기와 엑셀은 화면이 한다.
// 권한: 메뉴 권한 hqDashboard view 이상(defineHandler permission). 두 사이트 공통.
// includeInternal=1 이면 QA, 본사 관리자 계정도 센다(기본 제외, 분석 grill Q3).
//   200 { asOf, items[] }  items[]: 기관 행 + goalRateAverage, goalUserCount
// 오류(problem): 400 VALIDATION_FAILED(includeInternal 이 0, 1 이 아님), 401, 403 FORBIDDEN, 405, 500 INTERNAL_ERROR.
// 읽기 전용 라우트라 쓰기 경계는 해당 없다.

import { defineHandler } from "../../../_lib/handler.js";
import {
  includeInternalQuery,
  loadTenantGoals,
  loadTenantOverview,
} from "../../../_lib/hq-dashboard/overview.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "hqDashboard" },
  query: includeInternalQuery,
  unhandledMessage: "기관 현황을 불러오지 못했습니다.",
  logLabel: "[admin/hq-dashboard/tenants]",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    const { includeInternal } = ctx.query;
    const [rows, goals] = await Promise.all([
      loadTenantOverview(ctx.supabaseAdmin, includeInternal),
      loadTenantGoals(ctx.supabaseAdmin, includeInternal),
    ]);
    res.status(200).json({
      asOf: new Date().toISOString(),
      items: rows.map((row) => ({
        ...row,
        goalRateAverage: goals.get(row.tenantId)?.average ?? null,
        goalUserCount: goals.get(row.tenantId)?.userCount ?? 0,
      })),
    });
  },
});
