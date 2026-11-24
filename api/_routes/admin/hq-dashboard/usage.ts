// GET /api/admin/hq-dashboard/usage[?includeInternal=0|1]
//
// 기관별 서비스 사용량과 한도(계획 6번 A5, 분석 grill Q6). 기관 한 곳, 서비스 하나(목표관리 제외 5개)에 한 행:
// 이번 달과 이번 학기 쓴 횟수, 한도 다 쓴 학생 수, 기관 설정 한도. 한도가 학생 단위라 기관 전체 % 는 주지 않는다.
// 수치는 fn_hq_tenant_usage 가 정본이다. 화면이 기관 현황(/tenants) 행과 tenantId 로 합친다.
// 권한: 메뉴 권한 hqDashboard view 이상(defineHandler permission). 두 사이트 공통.
// includeInternal=1 이면 QA, 본사 관리자 계정도 센다(기본 제외, 분석 grill Q3).
//   200 { asOf, items[] }  items[]: tenantId, programKey, provided, monthLimit, termLimit, monthUsed, ...
// 오류(problem): 400 VALIDATION_FAILED(includeInternal 이 0, 1 이 아님), 401, 403 FORBIDDEN, 405, 500 INTERNAL_ERROR.
// 읽기 전용 라우트라 쓰기 경계는 해당 없다.

import { fetchAllRows } from "../../../_lib/console/paging.js";
import { defineHandler } from "../../../_lib/handler.js";
import { includeInternalQuery } from "../../../_lib/hq-dashboard/overview.js";

export const config = { runtime: "nodejs" };

interface DbUsageRow {
  tenant_id: string;
  program_key: string;
  provided: boolean;
  month_limit: number | null;
  term_limit: number | null;
  month_used: number;
  month_capped_students: number;
  term_used: number;
  term_capped_students: number;
  term_resets_on: string | null;
}

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "hqDashboard" },
  query: includeInternalQuery,
  unhandledMessage: "서비스 사용량을 불러오지 못했습니다.",
  logLabel: "[admin/hq-dashboard/usage]",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    const { includeInternal } = ctx.query;
    const rows = await fetchAllRows<DbUsageRow>((from, to) =>
      ctx.supabaseAdmin
        .rpc("fn_hq_tenant_usage", { p_include_internal: includeInternal })
        .order("tenant_id")
        .order("program_key")
        .range(from, to),
    );
    res.status(200).json({
      asOf: new Date().toISOString(),
      items: rows.map((row) => ({
        tenantId: row.tenant_id,
        programKey: row.program_key,
        provided: row.provided,
        monthLimit: row.month_limit,
        termLimit: row.term_limit,
        monthUsed: row.month_used,
        monthCappedStudents: row.month_capped_students,
        termUsed: row.term_used,
        termCappedStudents: row.term_capped_students,
        termResetsOn: row.term_resets_on,
      })),
    });
  },
});
