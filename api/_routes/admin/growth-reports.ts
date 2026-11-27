// /api/admin/growth-reports 아래 성장설계 회차 운영 조회 라우트. 관리자 앱(api/_routes/admin/app.ts)이 .route("/growth-reports", growthReports) 로 붙인다.
// 요청 검증과 응답 모양은 shared/growth-report/contract.ts 를 따른다. 권한: 메뉴 growthReports 의 view.
//
// GET /?status=&q=&page=&pageSize=: 상태 필터, 학생 이름 또는 이메일 검색, 최근 활동순, 서버 페이지네이션.
//   검색은 profiles 를 먼저 찾아 profile_id 로 거른다(2단계 조회). 이름과 이메일은 페이지에 담긴 회차의 프로필만 붙인다.
//   200 { items, total, page, pageSize }, 값 규칙 위반은 400 INVALID_QUERY.
// GET /:id: 회차 한 건. 목록 항목과 같은 모양이다. 없으면 404 NOT_FOUND.
// 판단과 변환은 api/_lib/growth/ops/list.ts, 프로필 이름 붙이기는 reportItems.ts.

import {
  GROWTH_REPORT_ERROR,
  type GrowthReport,
  type GrowthReportsPage,
  reportIdParams,
  reportListQuery,
} from "../../../shared/growth-report/contract.js";
import type { ReportListRow } from "../../_lib/growth/ops/list.js";
import { escapeIlike, parseListQuery } from "../../_lib/growth/ops/list.js";
import {
  REPORT_COLUMNS,
  toReportItems,
} from "../../_lib/growth/ops/reportItems.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import {
  methodNotAllowed,
  notFound,
  ProblemError,
} from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";

// 검색어에 맞는 프로필 id 상한. 넘으면 검색어를 좁혀 달라는 뜻이라 초과분은 버린다.
const MAX_SEARCH_PROFILES = 500;

const listGuard = admin({
  permission: { key: "growthReports" },
  unhandledMessage: "성장설계 회차 조회에 실패했습니다.",
  logLabel: "admin/growth-reports",
});
const byIdGuard = admin({
  permission: { key: "growthReports" },
  unhandledMessage: "성장설계 회차 조회에 실패했습니다.",
  logLabel: "admin/growth-reports/id",
});

export const growthReports = adminFactory
  .createApp()
  .get("/", listGuard, validate("query", reportListQuery), async (c) => {
    const parsed = parseListQuery(c.req.valid("query"));
    if (!parsed.ok) {
      throw new ProblemError(
        400,
        parsed.reason,
        GROWTH_REPORT_ERROR.INVALID_QUERY,
      );
    }
    const { status, q, page, pageSize } = parsed.query;
    const db = c.var.supabaseAdmin;

    let profileIds: string[] | null = null;
    if (q) {
      const pattern = `%${escapeIlike(q)}%`;
      const { data, error } = await db
        .from("profiles")
        .select("id")
        .or(`name.ilike.${pattern},email.ilike.${pattern}`)
        .limit(MAX_SEARCH_PROFILES);
      if (error) throw new Error(`profiles 검색 실패: ${error.message}`);
      profileIds = (data ?? []).map((r: { id: string }) => r.id);
      if (profileIds.length === 0) {
        return c.json({
          items: [],
          total: 0,
          page,
          pageSize,
        } satisfies GrowthReportsPage);
      }
    }

    let query = db
      .from("growth_reports")
      .select(REPORT_COLUMNS, { count: "exact" });
    if (status) query = query.eq("status", status);
    if (profileIds) query = query.in("profile_id", profileIds);

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query
      .order("last_activity_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`growth_reports 조회 실패: ${error.message}`);

    return c.json({
      items: await toReportItems(db, (data ?? []) as ReportListRow[]),
      total: count ?? 0,
      page,
      pageSize,
    } satisfies GrowthReportsPage);
  })
  .all("/", methodNotAllowed("GET"))
  .get("/:id", byIdGuard, validate("param", reportIdParams), async (c) => {
    const db = c.var.supabaseAdmin;
    const { data, error } = await db
      .from("growth_reports")
      .select(REPORT_COLUMNS)
      .eq("id", c.req.valid("param").id)
      .maybeSingle();
    if (error) throw new Error(`growth_reports 조회 실패: ${error.message}`);
    if (!data) throw notFound("회차");
    const [item] = await toReportItems(db, [data as ReportListRow]);
    return c.json(item satisfies GrowthReport | undefined);
  })
  .all("/:id", methodNotAllowed("GET"));
