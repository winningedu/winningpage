// GET /api/console/students?tab=&grade=&groupId=&classId=&q=&page=&pageSize=
//
// W6 학생 관리. 기관의 현재 학년도 재학생을 학년, 그룹, 반, 번호(번호 없음은 뒤) 순으로 나눠 준다.
// 담임은 담당 학급 학생만 실명으로, 학교 관리자와 본사 대행은 전교를 가린 이름으로 본다(서버가 가린다).
// scopeTotal 은 필터 없이 범위 안의 학생 수라 "학생 없음"과 "조건에 맞는 학생 없음"을 가른다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { kstYMD } from "../../src/lib/goal/calc/index.js";
import { loadDiagnosisStatus } from "../_lib/console/diagnosisStatus.js";
import {
  compareClassName,
  gradeRank,
  loadClassIndex,
  loadTenant,
  readAll,
} from "../_lib/console/directory.js";
import {
  type GoalRecord,
  type GoalSchedule,
  goalWeeks,
  rateBucket,
  weekWindows,
} from "../_lib/console/goalRate.js";
import { displayNamesFor } from "../_lib/console/maskName.js";
import { paginate, parsePageQuery } from "../_lib/console/paging.js";
import { requireInScope, scopeQuery } from "../_lib/console/scope.js";
import {
  loadServiceUsage,
  SERVICE_KEYS,
  type ServiceKey,
} from "../_lib/console/serviceUsage.js";
import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

interface EnrollmentRow {
  student_id: string;
  grade: string | null;
  class_id: string | null;
  number: number | null;
  version: number;
}

// tab 값: 전체, 서비스 하나를 쓴 학생, 서비스를 하나도 안 쓴 학생(none).
const TABS: readonly string[] = ["all", "none", ...SERVICE_KEYS];

function queryValue(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === undefined || value === "" ? undefined : value;
}

const COLUMNS = "student_id, grade, class_id, number, version";

const PROFILE_CHUNK = 100;

/** 이번 주(어제까지 7일) 달성율(반올림한 %). 목표 설정일이 없는 학생은 맵에 없다. */
async function loadWeeklyRates(
  admin: SupabaseClient,
  goalStudentIds: string[],
): Promise<Map<string, number>> {
  const today = kstYMD();
  const dates = weekWindows(today).thisWeek;
  const rates = new Map<string, number>();
  for (let i = 0; i < goalStudentIds.length; i += PROFILE_CHUNK) {
    const chunk = goalStudentIds.slice(i, i + PROFILE_CHUNK);
    const [records, students] = await Promise.all([
      readAll<GoalRecord & { profile_id: string }>(
        admin,
        "goal_daily_records",
        "profile_id, record_date, study_hours, target_ideal_hours, target_min_hours",
        (q) => q.in("profile_id", chunk).in("record_date", dates),
      ),
      readAll<{ profile_id: string; study_schedule: GoalSchedule | null }>(
        admin,
        "goal_students",
        "profile_id, study_schedule",
        (q) => q.in("profile_id", chunk),
        "profile_id",
      ),
    ]);
    for (const student of students) {
      const { thisWeek } = goalWeeks(
        today,
        records.filter((r) => r.profile_id === student.profile_id),
        student.study_schedule,
      );
      if (thisWeek.achievementPct !== null) {
        rates.set(student.profile_id, Math.round(thisWeek.achievementPct));
      }
    }
  }
  return rates;
}

const weeklyGoalLevel = (rate: number | undefined) =>
  rate === undefined ? null : rateBucket(rate);

/** 특이학생으로 지정된 학생 id(기관 전체). */
async function loadFlagged(
  admin: SupabaseClient,
  tenantId: string,
): Promise<Set<string>> {
  const rows = await readAll<{ student_id: string }>(
    admin,
    "student_flags",
    "student_id",
    (q) => q.eq("tenant_id", tenantId),
    "student_id",
  );
  return new Set(rows.map((r) => r.student_id));
}
const KST_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });

const kstDate = (iso: string) => KST_DATE.format(new Date(iso));

/** 이름과 가입일(KST 날짜). in 목록이 URL 한도를 넘지 않게 100명씩 읽는다. */
async function loadProfiles(
  admin: SupabaseClient,
  ids: string[],
): Promise<Map<string, { name: string; joinedAt: string | null }>> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += PROFILE_CHUNK) {
    chunks.push(ids.slice(i, i + PROFILE_CHUNK));
  }
  const pages = await Promise.all(
    chunks.map((chunk) =>
      readAll<{ id: string; name: string | null; created_at: string | null }>(
        admin,
        "profiles",
        "id, name, created_at",
        (q) => q.in("id", chunk),
      ),
    ),
  );
  return new Map(
    pages.flat().map((p) => [
      p.id,
      {
        name: p.name ?? "",
        joinedAt: p.created_at ? kstDate(p.created_at) : null,
      },
    ]),
  );
}

export default defineHandler({
  methods: ["GET"],
  auth: "console",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "학생 목록을 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/students]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;

    const pageQuery = parsePageQuery(req.query);
    if (!pageQuery) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }

    const tab = queryValue(req.query.tab) ?? "all";
    if (!TABS.includes(tab)) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }
    const special = queryValue(req.query.special) === "1";
    const grade = queryValue(req.query.grade);
    const groupId = queryValue(req.query.groupId);
    const classId = queryValue(req.query.classId);
    const q = queryValue(req.query.q)?.trim().toLowerCase();
    // 담임이 담당 밖 학급을 지정하면 그 학급이 있는지 알려 주지 않는다.
    if (
      classId &&
      !requireInScope(res, "coded", actor, {
        tenantId: actor.tenantId,
        classId,
      })
    ) {
      return;
    }

    const { schoolYear, orgType } = await loadTenant(admin, actor.tenantId);
    const { data: threshold, error: thresholdError } = await admin
      .from("tenants")
      .select("special_exec_rate_pct")
      .eq("id", actor.tenantId)
      .maybeSingle();
    if (thresholdError) throw new Error("tenant threshold lookup failed");
    const execRatePct =
      (threshold?.special_exec_rate_pct as number | null | undefined) ?? null;
    const [current, classes] = await Promise.all([
      readAll<EnrollmentRow>(admin, "student_enrollments", COLUMNS, (query) =>
        scopeQuery(query, actor, { classColumn: "class_id" })
          .eq("school_year", schoolYear)
          .eq("status", "active"),
      ),
      loadClassIndex(admin, actor.tenantId),
    ]);
    const profiles = await loadProfiles(
      admin,
      current.map((e) => e.student_id),
    );
    const shownNames = displayNamesFor(
      actor,
      current.map((e) => ({
        id: e.student_id,
        group: e.class_id,
        name: profiles.get(e.student_id)?.name ?? "",
      })),
    );
    const classOf = (e: EnrollmentRow) =>
      e.class_id ? classes.get(e.class_id) : undefined;
    const matches = current
      .filter((e) => !grade || e.grade === grade)
      .filter((e) => !classId || e.class_id === classId)
      .filter(
        (e) =>
          !groupId ||
          (e.class_id !== null && classes.get(e.class_id)?.groupId === groupId),
      )
      .filter(
        (e) =>
          !q ||
          (profiles.get(e.student_id)?.name ?? "").toLowerCase().includes(q),
      );
    matches.sort(
      (a, b) =>
        gradeRank(a.grade) - gradeRank(b.grade) ||
        (classOf(a)?.groupName ?? "").localeCompare(
          classOf(b)?.groupName ?? "",
          "ko",
        ) ||
        compareClassName(classOf(a)?.name ?? "", classOf(b)?.name ?? "") ||
        (a.number ?? 100) - (b.number ?? 100) ||
        a.student_id.localeCompare(b.student_id),
    );

    // 서비스 탭과 특이학생 거르기는 쪽을 나누기 전에 해야 하므로 그때는 모든 후보를 읽고,
    // 아니면 보이는 쪽만 읽는다.
    const services = new Map<string, ServiceKey[]>();
    const usedOf = (id: string) => services.get(id) ?? [];
    const ensureServices = async (ids: string[]) => {
      const missing = ids.filter((id) => !services.has(id));
      if (missing.length === 0) return;
      for (const [id, used] of await loadServiceUsage(admin, missing)) {
        services.set(id, used);
      }
    };
    let listed = matches;
    if (tab !== "all") {
      await ensureServices(matches.map((e) => e.student_id));
      listed = matches.filter((e) => {
        const used = usedOf(e.student_id);
        return tab === "none"
          ? used.length === 0
          : used.includes(tab as ServiceKey);
      });
    }

    const extrasOf = async (rows: EnrollmentRow[]) => {
      const ids = rows.map((e) => e.student_id);
      await ensureServices(ids);
      const [diagnosis, rates, flagged] = await Promise.all([
        loadDiagnosisStatus(admin, ids),
        loadWeeklyRates(
          admin,
          ids.filter((id) => usedOf(id).includes("goal")),
        ),
        loadFlagged(admin, actor.tenantId),
      ]);
      const reasonsOf = (id: string): string[] => {
        const rate = rates.get(id);
        const level = diagnosis.get(id)?.urgency;
        return [
          ...(execRatePct !== null && rate !== undefined && rate < execRatePct
            ? ["low_rate"]
            : []),
          ...(level === "high" || level === "very_high" ? ["urgency"] : []),
          ...(flagged.has(id) ? ["manual"] : []),
        ];
      };
      return { diagnosis, rates, reasonsOf };
    };
    let extras: Awaited<ReturnType<typeof extrasOf>>;
    if (special) {
      extras = await extrasOf(listed);
      listed = listed.filter((e) => extras.reasonsOf(e.student_id).length > 0);
    }
    const paged = paginate(listed, pageQuery);
    if (!special) extras = await extrasOf(paged.items);
    await ensureServices(paged.items.map((e) => e.student_id));
    res.status(200).json({
      total: paged.total,
      scopeTotal: current.length,
      page: paged.page,
      pageSize: pageQuery.pageSize,
      orgType,
      specialExecRatePct: execRatePct,
      pageCount: paged.pageCount,
      items: paged.items.map((e) => {
        const cls = classOf(e);
        const used = usedOf(e.student_id);
        return {
          studentId: e.student_id,
          displayName: shownNames.get(e.student_id) ?? "",
          joinedAt: profiles.get(e.student_id)?.joinedAt ?? null,
          grade: e.grade,
          groupId: cls?.groupId ?? null,
          groupName: cls?.groupName ?? null,
          classId: e.class_id,
          className: cls?.name ?? null,
          number: e.number,
          services: Object.fromEntries(
            SERVICE_KEYS.map((key) => [key, used.includes(key)]),
          ),
          serviceCount: used.length,
          urgency: extras.diagnosis.get(e.student_id)?.urgency ?? null,
          weeklyGoalRate: extras.rates.get(e.student_id) ?? null,
          weeklyGoalLevel: weeklyGoalLevel(extras.rates.get(e.student_id)),
          specialReasons: extras.reasonsOf(e.student_id),
          canEdit: actor.kind === "homeroom",
          enrollmentVersion: e.version,
        };
      }),
    });
  },
});
