// GET /api/admin/hq-dashboard/logins?view=stats|log&from=&to=&grain=&mau=&includeInternal=1&page=
// Authorization: Bearer <supabase access token>
//
// 본사 대시보드 로그인 지표(분석 grill Q1, Q7, Q13). 날짜는 보는 사람 시간대(X-Time-Zone 헤더 필수)의 달력 날짜(YYYY-MM-DD)이고 양 끝을 포함한다.
// 기본 기간은 이번 달 1일부터 오늘(그 시간대). 종료일은 오늘을 넘을 수 없고 기간은 최대 731일(로그인 기록 보관 2년).
// 헤더가 없으면 400 TIME_ZONE_REQUIRED. 로그인은 15분 칸(profile_login_slots)을 그 시간대의 날로 묶어 센다.
// includeInternal=1 이면 QA, 본사 관리자 계정도 센다(기본 제외, fn_hq_stat_included).
//
// view=stats(기본) 쿼리 grain(day 기본, week, month), mau(calendar 기본, rolling30), scope(all 기본, b2c: 기관 없음, 기타 소속 회원만)
//   200 { ok, from, to, grain, mauMode, scope, includeInternal, firstMeasuredAt, series[], dau, mau }
//   firstMeasuredAt: 가장 이른 로그인 기록 순간(ISO Z), 없으면 null. 화면이 보는 사람 시간대의 날짜로 바꿔 보인다.
//   series[]: start, end, source(measured, estimated, none), members, byMemberType
//   dau: 기간 일평균. 모든 날이 실측이면 measured, 모든 날이 기록 없음이면 none, 나머지는 estimated.
//   mau: calendar 는 종료일이 속한 달 1일부터 종료일, rolling30 은 종료일 포함 30일.
// view=log 쿼리 page(1 부터)
//   200 { ok, from, to, includeInternal, page, pageSize, total, namesVisible, items[] }
//   items[]: profileId, loginDate(보는 사람 시간대의 날), firstSeenAt(그날 처음 기록된 순간, ISO Z), name, memberType, tenantName
//   이름은 개인정보라 members 보기 권한이 있을 때만 보낸다(없으면 null, namesVisible false).
// 권한: 로그인 + hqDashboard 보기 권한. 오류(coded): 400 INVALID_QUERY, 401, 403 FORBIDDEN, 500 INTERNAL.

import { addDaysYmd } from "../../../../src/lib/time/day.js";
import { hasAdminViewPermission } from "../../../_lib/console/proxy.js";
import { defineHandler, requireTimeZone } from "../../../_lib/handler.js";
import {
  GRAINS,
  type Grain,
  MAU_MODES,
  type MauMode,
  parsePeriod,
  pick,
} from "../../../_lib/hq-dashboard/period.js";
import { hasHqDashboardViewPermission } from "../../../_lib/hq-dashboard/permission.js";
import { sendError } from "../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

const LOG_PAGE_SIZE = 50;
const SCOPES = ["all", "b2c"] as const;

type Source = "measured" | "estimated" | "none";

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

// 여러 날의 출처를 하나로 모은다. 모두 실측이면 실측, 모두 기록 없음이면 기록 없음, 나머지는 추정.
function combineSources(sources: Source[]): Source {
  if (sources.length > 0 && sources.every((s) => s === "measured"))
    return "measured";
  if (sources.every((s) => s === "none")) return "none";
  return "estimated";
}

export default defineHandler({
  methods: ["GET"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "로그인 지표를 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[admin/hq-dashboard/logins]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const db = ctx.supabaseAdmin;
    const userId = ctx.userId as string;
    if (!(await hasHqDashboardViewPermission(db, userId))) {
      sendError(res, "coded", 403, "대시보드 권한이 없습니다.", "FORBIDDEN");
      return;
    }
    const invalid = (message: string) =>
      sendError(res, "coded", 400, message, "INVALID_QUERY");

    const tz = requireTimeZone(ctx);
    const period = parsePeriod(req.query, tz);
    if (typeof period === "string") return invalid(period);
    const { from, to } = period;

    const view = pick(req.query.view, ["stats", "log"] as const, "stats");
    if (!view) return invalid("view 가 올바르지 않습니다.");
    const includeInternal = req.query.includeInternal === "1";

    if (view === "log") {
      const page = req.query.page === undefined ? 1 : Number(req.query.page);
      if (!Number.isInteger(page) || page < 1)
        return invalid("쪽 번호가 올바르지 않습니다.");
      const [namesVisible, log] = await Promise.all([
        hasAdminViewPermission(db, userId, "members"),
        db.rpc("fn_hq_login_log", {
          p_from: from,
          p_to: to,
          p_include_internal: includeInternal,
          p_limit: LOG_PAGE_SIZE,
          p_offset: (page - 1) * LOG_PAGE_SIZE,
          p_tz: tz,
        }),
      ]);
      if (log.error)
        throw new Error(`fn_hq_login_log 실패: ${log.error.message}`);
      const rows = (log.data ?? []) as LogRow[];
      res.status(200).json({
        ok: true,
        from,
        to,
        includeInternal,
        page,
        pageSize: LOG_PAGE_SIZE,
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
      });
      return;
    }

    const grain = pick(req.query.grain, GRAINS, "day");
    if (!grain) return invalid("grain 이 올바르지 않습니다.");
    const mauMode = pick(req.query.mau, MAU_MODES, "calendar");
    if (!mauMode) return invalid("mau 가 올바르지 않습니다.");
    const scope = pick(req.query.scope, SCOPES, "all");
    if (!scope) return invalid("scope 가 올바르지 않습니다.");

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

    const series = await buckets(from, to, grain, mauMode);
    const days =
      grain === "day" ? series : await buckets(from, to, "day", mauMode);
    const mauFrom =
      mauMode === "calendar" ? `${to.slice(0, 8)}01` : addDaysYmd(to, -29);
    const [mauRows, first] = await Promise.all([
      buckets(mauFrom, to, "month", mauMode),
      db
        .from("profile_login_slots")
        .select("slot_start")
        .order("slot_start", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    if (first.error)
      throw new Error(`profile_login_slots 조회 실패: ${first.error.message}`);
    const firstSlot = (first.data as { slot_start: string } | null)?.slot_start;
    const mau = mauRows[mauRows.length - 1];
    const dayTotal = days.reduce((sum, row) => sum + Number(row.members), 0);

    res.status(200).json({
      ok: true,
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
    });
  },
});
