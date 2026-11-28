// /api/admin/hq-dashboard 아래 본사 대시보드 읽기 라우트. 관리자 앱(api/_routes/admin/app.ts)이 .route("/hq-dashboard", hqDashboard) 로 붙인다.
// 요청 검증과 응답 모양은 shared/hq-dashboard/contract.ts 를 따른다.
//
// GET /summary[?includeInternal=0|1]  합계 카드(계획 4번 A1, A2): 기관 수, 학생 수(Q9), 선생님 수, 계약 상태별 기관 수.
//   200 { asOf, tenantCount, studentCount, studentWithoutEnrollmentCount, teacherCount, contracts }
// GET /tenants[?includeInternal=0|1]  기관 현황 표(A3, A4, A6): 기관마다 계약 상태, 학생 수, 선생님 수, 마지막 활동 순간, 목표 실행률 평균.
//   기관 수가 많지 않아 전체를 한 번에 주고 검색, 필터, 정렬, 쪽 나누기와 엑셀은 화면이 한다.
//   200 { asOf, items[] }  items[]: 기관 행 + goalRateAverage, goalUserCount
// GET /usage[?includeInternal=0|1]  기관별 서비스 사용량과 한도(계획 6번 A5, Q6). 기관 한 곳, 서비스 하나(목표관리 제외 5개)에 한 행.
//   한도가 학생 단위라 기관 전체 % 는 주지 않는다. 수치는 fn_hq_tenant_usage 가 정본이고 화면이 /tenants 행과 tenantId 로 합친다.
//   200 { asOf, items[] }
// GET /logins?view=stats|log&from=&to=&grain=&mau=&scope=&includeInternal=1&page=  로그인 지표(Q1, Q7, Q13).
//   날짜는 보는 사람 시간대(X-Time-Zone 헤더 필수)의 달력 날짜(YYYY-MM-DD)이고 양 끝을 포함한다.
//   기본 기간은 이번 달 1일부터 오늘(그 시간대). 종료일은 오늘을 넘을 수 없고 기간은 최대 731일(로그인 기록 보관 2년).
//   로그인은 15분 칸(profile_login_slots)을 그 시간대의 날로 묶어 센다.
//   view=stats(기본): 200 { from, to, grain, mauMode, scope, includeInternal, firstMeasuredAt, series[], dau, mau }
//     dau: 기간 일평균. 모든 날이 실측이면 measured, 모든 날이 기록 없음이면 none, 나머지는 estimated.
//     mau: calendar 는 종료일이 속한 달 1일부터 종료일, rolling30 은 종료일 포함 30일.
//   view=log: 200 { from, to, includeInternal, page, pageSize, total, namesVisible, items[] }
//     이름은 개인정보라 members 보기 권한이 있을 때만 보낸다(없으면 null, namesVisible false).
// GET /trends?from=&to=&grain=&mau=&includeInternal=1  추이(Q5 A10). 묶음마다 새 가입 회원 수(유형별)와 결제 주문 수(fn_hq_trend_buckets).
//   200 { from, to, grain, mauMode, includeInternal, series[] }
// GET /b2c?from=&to=&includeInternal=1  위닝 B2C 요약(Q5 A11). B2C 회원은 소속 기관이 없거나 기타 소속(is_catch_all)인 회원이다.
//   회원 수는 지금 기준(유형별), 결제는 기간 안 결제일(X-Time-Zone) 기준 admin_revenue_items 합이다.
//   200 { from, to, includeInternal, members { total, byMemberType }, payments { ... } }
//
// 권한: 메뉴 권한 hqDashboard view 이상(admin() 가드 permission). 두 사이트 공통. includeInternal=1 이면 QA, 본사 관리자 계정도 센다(기본 제외, Q3).
// 오류(problem): 400 VALIDATION_FAILED(쿼리, 기간), 400 TIME_ZONE_REQUIRED(logins, trends, b2c), 401, 403 FORBIDDEN, 405, 500 INTERNAL_ERROR.
// 읽기 전용 라우트라 쓰기 경계는 해당 없다.

import {
  HQ_LOGIN_LOG_PAGE_SIZE,
  type HqB2cResponse,
  type HqSummary,
  type HqTenants,
  type HqTrendsResponse,
  type HqUsage,
  includeInternalQuery,
  type LoginLogResponse,
  type LoginStatsResponse,
  loginsQuery,
  periodQuery,
  statsQuery,
} from "../../../shared/hq-dashboard/contract.js";
import { PROBLEM_CODE } from "../../../shared/http/codes.js";
import { allInOrder } from "../../../src/lib/concurrency/allInOrder.js";
import { addDaysYmd } from "../../../src/lib/time/day.js";
import { hasSectionPermission } from "../../_lib/adminPermission.js";
import { fetchAllRows } from "../../_lib/console/paging.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed, ProblemError } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";
import {
  loadTenantGoals,
  loadTenantOverview,
  summarizeTenants,
} from "../../_lib/hq-dashboard/overview.js";
import { parsePeriod } from "../../_lib/hq-dashboard/period.js";
import { TimeZoneRequiredError } from "../../_lib/timeZone.js";

type Grain = LoginStatsResponse["grain"];
type MauMode = LoginStatsResponse["mauMode"];
type Source = LoginStatsResponse["dau"]["source"];

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

interface BucketRow {
  bucket_start: string;
  bucket_end: string;
  source: Source;
  members: number;
  by_member_type: Record<string, number>;
}

interface LogRow {
  profile_id: string;
  login_date: string;
  first_seen_at: string;
  name: string | null;
  member_type: string | null;
  tenant_name: string | null;
  total_count: number;
}

interface SummaryRow {
  member_total: number;
  by_member_type: Record<string, number>;
  paying_members: number;
  order_count: number;
  paid_amount: number;
  refunded_amount: number;
  net_amount: number;
}

interface TrendRow {
  bucket_start: string;
  bucket_end: string;
  signups: number;
  signups_by_member_type: Record<string, number>;
  paid_orders: number;
}

// 여러 날의 출처를 하나로 모은다. 모두 실측이면 실측, 모두 기록 없음이면 기록 없음, 나머지는 추정.
function combineSources(sources: Source[]): Source {
  if (sources.length > 0 && sources.every((s) => s === "measured"))
    return "measured";
  if (sources.every((s) => s === "none")) return "none";
  return "estimated";
}

function requireTimeZone(c: { var: { timeZone: string | undefined } }): string {
  if (!c.var.timeZone) throw new TimeZoneRequiredError();
  return c.var.timeZone;
}

function periodFailed(message: string): ProblemError {
  return new ProblemError(400, message, PROBLEM_CODE.VALIDATION_FAILED);
}

const summaryGuard = admin({
  permission: { key: "hqDashboard" },
  unhandledMessage: "대시보드 합계를 불러오지 못했습니다.",
  logLabel: "[admin/hq-dashboard/summary]",
});

const tenantsGuard = admin({
  permission: { key: "hqDashboard" },
  unhandledMessage: "기관 현황을 불러오지 못했습니다.",
  logLabel: "[admin/hq-dashboard/tenants]",
});

const usageGuard = admin({
  permission: { key: "hqDashboard" },
  unhandledMessage: "서비스 사용량을 불러오지 못했습니다.",
  logLabel: "[admin/hq-dashboard/usage]",
});

const loginsGuard = admin({
  permission: { key: "hqDashboard" },
  unhandledMessage: "로그인 지표를 불러오지 못했습니다.",
  logLabel: "[admin/hq-dashboard/logins]",
});

const trendsGuard = admin({
  permission: { key: "hqDashboard" },
  unhandledMessage: "추이를 불러오지 못했습니다.",
  logLabel: "[admin/hq-dashboard/trends]",
});

const b2cGuard = admin({
  permission: { key: "hqDashboard" },
  unhandledMessage: "B2C 요약을 불러오지 못했습니다.",
  logLabel: "[admin/hq-dashboard/b2c]",
});

export const hqDashboard = adminFactory
  .createApp()
  .get(
    "/summary",
    summaryGuard,
    validate("query", includeInternalQuery),
    async (c) => {
      const rows = await loadTenantOverview(
        c.var.supabaseAdmin,
        c.req.valid("query").includeInternal,
      );
      return c.json({
        asOf: new Date().toISOString(),
        ...summarizeTenants(rows),
      } satisfies HqSummary);
    },
  )
  .all("/summary", methodNotAllowed("GET"))
  .get(
    "/tenants",
    tenantsGuard,
    validate("query", includeInternalQuery),
    async (c) => {
      const { includeInternal } = c.req.valid("query");
      const [rows, goals] = await Promise.all([
        loadTenantOverview(c.var.supabaseAdmin, includeInternal),
        loadTenantGoals(c.var.supabaseAdmin, includeInternal),
      ]);
      return c.json({
        asOf: new Date().toISOString(),
        items: rows.map((row) => ({
          ...row,
          goalRateAverage: goals.get(row.tenantId)?.average ?? null,
          goalUserCount: goals.get(row.tenantId)?.userCount ?? 0,
        })),
      } satisfies HqTenants);
    },
  )
  .all("/tenants", methodNotAllowed("GET"))
  .get(
    "/usage",
    usageGuard,
    validate("query", includeInternalQuery),
    async (c) => {
      const { includeInternal } = c.req.valid("query");
      const rows = await fetchAllRows<DbUsageRow>((from, to) =>
        c.var.supabaseAdmin
          .rpc("fn_hq_tenant_usage", { p_include_internal: includeInternal })
          .order("tenant_id")
          .order("program_key")
          .range(from, to),
      );
      return c.json({
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
      } satisfies HqUsage);
    },
  )
  .all("/usage", methodNotAllowed("GET"))
  .get("/logins", loginsGuard, validate("query", loginsQuery), async (c) => {
    const db = c.var.supabaseAdmin;
    const userId = c.var.userId as string;
    const query = c.req.valid("query");
    const { view, scope, page, grain, mau: mauMode, includeInternal } = query;

    const tz = requireTimeZone(c);
    const period = parsePeriod(query, tz);
    if (typeof period === "string") throw periodFailed(period);
    const { from, to } = period;

    if (view === "log") {
      const [namesVisible, log] = await Promise.all([
        hasSectionPermission(
          db,
          userId,
          "members",
          "view",
          c.var.effectivePermissions,
        ),
        db.rpc("fn_hq_login_log", {
          p_from: from,
          p_to: to,
          p_include_internal: includeInternal,
          p_limit: HQ_LOGIN_LOG_PAGE_SIZE,
          p_offset: (page - 1) * HQ_LOGIN_LOG_PAGE_SIZE,
          p_tz: tz,
        }),
      ]);
      if (log.error)
        throw new Error(`fn_hq_login_log 실패: ${log.error.message}`);
      const rows = (log.data ?? []) as LogRow[];
      return c.json({
        from,
        to,
        includeInternal,
        page,
        pageSize: HQ_LOGIN_LOG_PAGE_SIZE,
        total: rows[0]?.total_count ?? 0,
        namesVisible,
        items: rows.map((row) => ({
          profileId: row.profile_id,
          loginDate: row.login_date,
          firstSeenAt: new Date(row.first_seen_at).toISOString(),
          name: namesVisible ? row.name : null,
          memberType: row.member_type,
          tenantName: row.tenant_name,
        })),
      } satisfies LoginLogResponse);
    }

    const buckets = async (
      p_from: string,
      p_to: string,
      p_grain: Grain,
      p_mau_mode: MauMode,
    ) => {
      const { data, error } = await db.rpc("fn_hq_login_buckets", {
        p_from,
        p_to,
        p_grain,
        p_mau_mode,
        p_include_internal: includeInternal,
        p_scope: scope,
        p_tz: tz,
      });
      if (error) throw new Error(`fn_hq_login_buckets 실패: ${error.message}`);
      return (data ?? []) as BucketRow[];
    };

    const mauFrom =
      mauMode === "calendar" ? `${to.slice(0, 8)}01` : addDaysYmd(to, -29);
    // 네 읽기는 서로의 결과를 쓰지 않는다. 함께 시작하고 오류는 앞선 읽기부터 본다.
    const seriesRead = buckets(from, to, grain, mauMode);
    const [series, days, mauRows, first] = await allInOrder(
      seriesRead,
      grain === "day" ? seriesRead : buckets(from, to, "day", mauMode),
      buckets(mauFrom, to, "month", mauMode),
      db
        .from("profile_login_slots")
        .select("slot_start")
        .order("slot_start", { ascending: true })
        .limit(1)
        .maybeSingle(),
    );
    if (first.error)
      throw new Error(`profile_login_slots 조회 실패: ${first.error.message}`);
    const firstSlot = (first.data as { slot_start: string } | null)?.slot_start;
    const mau = mauRows[mauRows.length - 1];
    const dayTotal = days.reduce((sum, row) => sum + Number(row.members), 0);

    return c.json({
      from,
      to,
      grain,
      mauMode,
      scope,
      includeInternal,
      firstMeasuredAt: firstSlot ? new Date(firstSlot).toISOString() : null,
      series: series.map((row) => ({
        start: row.bucket_start,
        end: row.bucket_end,
        source: row.source,
        members: Number(row.members),
        byMemberType: row.by_member_type,
      })),
      dau: {
        from,
        to,
        average:
          days.length === 0
            ? 0
            : Math.round((dayTotal / days.length) * 10) / 10,
        source: combineSources(days.map((row) => row.source)),
      },
      mau: {
        from: mauFrom,
        to,
        mode: mauMode,
        members: Number(mau?.members ?? 0),
        source: mau?.source ?? "none",
        byMemberType: mau?.by_member_type ?? {},
      },
    } satisfies LoginStatsResponse);
  })
  .all("/logins", methodNotAllowed("GET"))
  .get("/trends", trendsGuard, validate("query", statsQuery), async (c) => {
    const db = c.var.supabaseAdmin;
    const query = c.req.valid("query");
    const { grain, mau: mauMode, includeInternal } = query;
    const timeZone = requireTimeZone(c);
    const period = parsePeriod(query, timeZone);
    if (typeof period === "string") throw periodFailed(period);

    const { data, error } = await db.rpc("fn_hq_trend_buckets", {
      p_from: period.from,
      p_to: period.to,
      p_grain: grain,
      p_mau_mode: mauMode,
      p_include_internal: includeInternal,
      p_tz: timeZone,
    });
    if (error) throw new Error(`fn_hq_trend_buckets 실패: ${error.message}`);

    return c.json({
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
    } satisfies HqTrendsResponse);
  })
  .all("/trends", methodNotAllowed("GET"))
  .get("/b2c", b2cGuard, validate("query", periodQuery), async (c) => {
    const db = c.var.supabaseAdmin;
    const query = c.req.valid("query");
    const { includeInternal } = query;
    const timeZone = requireTimeZone(c);
    const period = parsePeriod(query, timeZone);
    if (typeof period === "string") throw periodFailed(period);

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

    return c.json({
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
    } satisfies HqB2cResponse);
  })
  .all("/b2c", methodNotAllowed("GET"));
