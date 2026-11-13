// GET /api/console/students?tab=&grade=&groupId=&classId=&q=&page=&pageSize=
//
// W6 학생 관리. 기관의 현재 학년도 재학생을 학년, 그룹, 반, 번호(번호 없음은 뒤) 순으로 나눠 준다.
// 담임은 담당 학급 학생만 실명으로, 학교 관리자와 본사 대행은 전교를 가린 이름으로 본다(서버가 가린다).
// 가입하지 않은 학생의 명단 줄은 전체 탭에 미회원가입으로 같이 나온다(실제 학생이 가입하면 가려진다).
// scopeTotal 은 필터 없이 범위 안의 학생 수라 "학생 없음"과 "조건에 맞는 학생 없음"을 가른다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { diffDaysYMD, kstYMD } from "../../../src/lib/goal/calc/index.js";
import { loadDiagnosisStatus } from "../../_lib/console/diagnosisStatus.js";
import {
  compareClassName,
  gradeRank,
  loadClassIndex,
  loadTenant,
  readAll,
} from "../../_lib/console/directory.js";
import { gradeFilterMatches } from "../../_lib/console/enrollmentInput.js";
import { rateBucket } from "../../_lib/console/goalRate.js";
import { loadGoalStatus } from "../../_lib/console/goalStatus.js";
import {
  displayNamesFor,
  nameMatchesQuery,
} from "../../_lib/console/maskName.js";
import { paginate, parsePageQuery } from "../../_lib/console/paging.js";
import { loadPerformanceStatus } from "../../_lib/console/performanceStatus.js";
import { queryValue } from "../../_lib/console/query.js";
import { hiddenPendingIds } from "../../_lib/console/rosterPending.js";
import { requireInScope, scopeQuery } from "../../_lib/console/scope.js";
import {
  loadServiceUsage,
  SERVICE_KEYS,
  type ServiceKey,
} from "../../_lib/console/serviceUsage.js";
import {
  resolveThresholds,
  specialReasonsOf,
} from "../../_lib/console/special.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

interface EnrollmentRow {
  student_id: string;
  grade: string | null;
  class_id: string | null;
  number: number | null;
  version: number;
}

/** 가입하지 않은 학생의 명단 줄(미회원가입, roster_pending_students). 실제 학생 id 가 없다. */
interface PendingRow {
  id: string;
  name: string;
  grade: string | null;
  class_id: string;
  number: number | null;
}

// tab 값: 전체, 서비스 하나를 쓴 학생, 서비스를 하나도 안 쓴 학생(none).
const TABS: readonly string[] = ["all", "none", ...SERVICE_KEYS];

const COLUMNS = "student_id, grade, class_id, number, version";
const PENDING_COLUMNS = "id, name, grade, class_id, number";

const PROFILE_CHUNK = 100;

/** 이번 주(어제까지 7일) 달성율(반올림한 %). 목표 설정일이 없는 학생은 맵에 없다. */
async function loadWeeklyRates(
  admin: SupabaseClient,
  goalStudentIds: string[],
): Promise<Map<string, number>> {
  const status = await loadGoalStatus(admin, goalStudentIds);
  return new Map(
    [...status].flatMap(([id, g]) =>
      g.weeklyRate === null ? [] : [[id, g.weeklyRate] as const],
    ),
  );
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
/** 이름, 가입일(KST 날짜), 최근 접속 시각. in 목록이 URL 한도를 넘지 않게 100명씩 읽는다. */
async function loadProfiles(
  admin: SupabaseClient,
  ids: string[],
): Promise<
  Map<
    string,
    { name: string; joinedAt: string | null; lastSeenAt: string | null }
  >
> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += PROFILE_CHUNK) {
    chunks.push(ids.slice(i, i + PROFILE_CHUNK));
  }
  const pages = await Promise.all(
    chunks.map((chunk) =>
      readAll<{
        id: string;
        name: string | null;
        created_at: string | null;
        last_seen_at: string | null;
      }>(admin, "profiles", "id, name, created_at, last_seen_at", (q) =>
        q.in("id", chunk),
      ),
    ),
  );
  return new Map(
    pages.flat().map((p) => [
      p.id,
      {
        name: p.name ?? "",
        joinedAt: p.created_at ? kstYMD(new Date(p.created_at)) : null,
        lastSeenAt: p.last_seen_at,
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
      .select(
        "special_exec_rate_pct, special_inactive_days, special_feedback_wait_days",
      )
      .eq("id", actor.tenantId)
      .maybeSingle();
    if (thresholdError) throw new Error("tenant threshold lookup failed");
    const thresholds = resolveThresholds(threshold);
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
    const nameOf = (e: EnrollmentRow) => profiles.get(e.student_id)?.name ?? "";
    const pendingAll = await readAll<PendingRow>(
      admin,
      "roster_pending_students",
      PENDING_COLUMNS,
      (query) =>
        scopeQuery(query, actor, { classColumn: "class_id" }).eq(
          "school_year",
          schoolYear,
        ),
    );
    const hidden = hiddenPendingIds(
      pendingAll.map((p) => ({
        id: p.id,
        name: p.name,
        classId: p.class_id,
        number: p.number,
      })),
      current.map((e) => ({
        name: nameOf(e),
        classId: e.class_id,
        number: e.number,
      })),
    );
    const pendingRows = pendingAll.filter((p) => !hidden.has(p.id));
    const shownNames = displayNamesFor(actor, [
      ...current.map((e) => ({
        id: e.student_id,
        group: e.class_id,
        name: nameOf(e),
      })),
      ...pendingRows.map((p) => ({
        id: p.id,
        group: p.class_id,
        name: p.name,
      })),
    ]);
    const classOf = (e: EnrollmentRow) =>
      e.class_id ? classes.get(e.class_id) : undefined;
    const classOfRow = (r: EnrollmentRow | PendingRow) =>
      r.class_id ? classes.get(r.class_id) : undefined;
    const isEnrollment = (r: EnrollmentRow | PendingRow): r is EnrollmentRow =>
      "student_id" in r;
    const keyOf = (r: EnrollmentRow | PendingRow) =>
      isEnrollment(r) ? r.student_id : r.id;
    const passes = (x: {
      grade: string | null;
      classId: string | null;
      name: string;
    }) =>
      gradeFilterMatches(
        grade,
        x.grade,
        x.classId ? classes.get(x.classId)?.grade : undefined,
      ) &&
      (!classId || x.classId === classId) &&
      (!groupId ||
        (x.classId !== null && classes.get(x.classId)?.groupId === groupId)) &&
      (!q || nameMatchesQuery(actor, x.name, q));
    const compareRows = (
      a: EnrollmentRow | PendingRow,
      b: EnrollmentRow | PendingRow,
    ) =>
      gradeRank(a.grade) - gradeRank(b.grade) ||
      (classOfRow(a)?.groupName ?? "").localeCompare(
        classOfRow(b)?.groupName ?? "",
        "ko",
      ) ||
      compareClassName(classOfRow(a)?.name ?? "", classOfRow(b)?.name ?? "") ||
      (a.number ?? 100) - (b.number ?? 100) ||
      keyOf(a).localeCompare(keyOf(b));
    const matches = current.filter((e) =>
      passes({ grade: e.grade, classId: e.class_id, name: nameOf(e) }),
    );
    matches.sort(compareRows);

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

    // 접속한 날과 오늘의 KST 달력 날짜 차이. 기록이 없으면 null(미접속으로 잡지 않는다).
    const today = kstYMD(new Date());
    const daysSince = (at: string | null | undefined) =>
      at ? diffDaysYMD(kstYMD(new Date(at)), today) : null;
    const extrasOf = async (rows: EnrollmentRow[]) => {
      const ids = rows.map((e) => e.student_id);
      await ensureServices(ids);
      const [diagnosis, rates, flagged, performance] = await Promise.all([
        loadDiagnosisStatus(admin, ids),
        loadWeeklyRates(
          admin,
          ids.filter((id) => usedOf(id).includes("goal")),
        ),
        loadFlagged(admin, actor.tenantId),
        loadPerformanceStatus(
          admin,
          ids.filter((id) => usedOf(id).includes("performance")),
        ),
      ]);
      // 가장 최근 제출이 평가를 기다리면 제출일(KST)부터 오늘까지의 달력 날짜 차이.
      const feedbackWaitingDaysOf = (id: string) => {
        const status = performance.get(id);
        return status?.feedback === "waiting" && status.lastSubmittedAt
          ? diffDaysYMD(status.lastSubmittedAt, today)
          : null;
      };
      const reasonsOf = (id: string) =>
        specialReasonsOf(
          {
            weeklyRate: rates.get(id) ?? null,
            urgency: diagnosis.get(id)?.urgency ?? null,
            lastSeenDays: daysSince(profiles.get(id)?.lastSeenAt),
            feedbackWaitingDays: feedbackWaitingDaysOf(id),
            flagged: flagged.has(id),
          },
          thresholds,
        );
      return { diagnosis, rates, reasonsOf };
    };
    let extras: Awaited<ReturnType<typeof extrasOf>>;
    if (special) {
      extras = await extrasOf(listed);
      listed = listed.filter((e) => extras.reasonsOf(e.student_id).length > 0);
    }
    // 가입하지 않은 학생은 서비스를 쓰는 학생이 아니라 전체 탭에만 나오고, 특이학생에는 들지 않는다.
    const showsPending = tab === "all" && !special;
    const pendingListed = showsPending
      ? pendingRows.filter((p) =>
          passes({ grade: p.grade, classId: p.class_id, name: p.name }),
        )
      : [];
    const paged = paginate(
      [...listed, ...pendingListed].sort(compareRows),
      pageQuery,
    );
    const pagedStudents = paged.items.filter(isEnrollment);
    if (!special) extras = await extrasOf(pagedStudents);
    await ensureServices(pagedStudents.map((e) => e.student_id));
    res.status(200).json({
      total: paged.total,
      scopeTotal: current.length + (showsPending ? pendingRows.length : 0),
      page: paged.page,
      pageSize: pageQuery.pageSize,
      orgType,
      specialExecRatePct: thresholds.execRatePct,
      specialInactiveDays: thresholds.inactiveDays,
      specialFeedbackWaitDays: thresholds.feedbackWaitDays,
      pageCount: paged.pageCount,
      items: paged.items.map((e) => {
        if (!isEnrollment(e)) {
          const pendingClass = classOfRow(e);
          return {
            pending: true,
            studentId: e.id,
            displayName: shownNames.get(e.id) ?? "",
            joinedAt: null,
            grade: e.grade,
            groupId: pendingClass?.groupId ?? null,
            groupName: pendingClass?.groupName ?? null,
            classId: e.class_id,
            className: pendingClass?.name ?? null,
            number: e.number,
            services: Object.fromEntries(
              SERVICE_KEYS.map((key) => [key, false]),
            ),
            serviceCount: 0,
            urgency: null,
            weeklyGoalRate: null,
            weeklyGoalLevel: null,
            specialReasons: [],
            canEdit: false,
            enrollmentVersion: 0,
          };
        }
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
