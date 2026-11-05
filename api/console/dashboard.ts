// GET /api/console/dashboard?grade=&groupId=&classId=
//
// W5 대시보드 집계(교 #20, #22, #30~#32). 범위 안 학생의 서비스 이용, 목표시간 달성율 3단계, 서비스별 인원.
// 범위는 올해 학급에 배정된 재학생이다. 담임은 담당 학급만, 학교 관리자와 본사 대행은 기관 전체이고
// grade, groupId, classId 로 좁힌다. 담당 밖 classId 는 404 로 숨긴다. 학생 이름은 내보내지 않는다.
// 주간 목표시간 달성율(교 #5): 이번 주 월요일부터 오늘까지, 목표가 있는 날과 일요일의 학습시간 합 / 목표가 있는 날의 이상 목표 합.

import {
  addDaysYMD,
  getMondayYMD,
  kstYMD,
} from "../../src/lib/goal/calc/index.js";
import { loadTenant, readAll } from "../_lib/console/directory.js";
import { isEnrollmentGrade } from "../_lib/console/enrollmentInput.js";
import { scopeQuery } from "../_lib/console/scope.js";
import {
  loadServiceUsage,
  SERVICE_KEYS,
} from "../_lib/console/serviceUsage.js";
import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

const ID_CHUNK = 100;
const LOW_BELOW = 40;
const HIGH_FROM = 70;

interface DailyRow {
  profile_id: string;
  record_date: string;
  study_hours: number;
  target_ideal_hours: number;
}

function queryValue(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

/** 학생 한 명의 주간 달성율(%). 목표가 있는 날이 없으면 0. */
function weeklyRate(rows: DailyRow[]): number {
  let study = 0;
  let target = 0;
  for (const r of rows) {
    const isSunday = new Date(`${r.record_date}T00:00:00Z`).getUTCDay() === 0;
    if (r.target_ideal_hours > 0 || isSunday) study += r.study_hours;
    if (r.target_ideal_hours > 0) target += r.target_ideal_hours;
  }
  return target > 0 ? (study / target) * 100 : 0;
}

export default defineHandler({
  methods: ["GET"],
  auth: "console",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "대시보드를 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/dashboard]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;

    const grade = queryValue(req.query.grade);
    const groupId = queryValue(req.query.groupId);
    const classId = queryValue(req.query.classId);
    if (grade !== undefined && !isEnrollmentGrade(grade)) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }

    const { schoolYear } = await loadTenant(admin, actor.tenantId);
    const classes = await readAll<{
      id: string;
      grade: string;
      group_id: string | null;
    }>(admin, "classes", "id, grade, group_id", (q) =>
      scopeQuery(q, actor, { classColumn: "id" }).eq("school_year", schoolYear),
    );
    if (classId !== undefined && !classes.some((c) => c.id === classId)) {
      sendError(res, "coded", 404, "대상을 찾을 수 없습니다.", "NOT_FOUND");
      return;
    }
    const classIds = new Set(
      classes
        .filter(
          (c) =>
            (classId === undefined || c.id === classId) &&
            (grade === undefined || c.grade === grade) &&
            (groupId === undefined || c.group_id === groupId),
        )
        .map((c) => c.id),
    );

    const enrollments = await readAll<{
      student_id: string;
      class_id: string | null;
    }>(admin, "student_enrollments", "student_id, class_id", (q) =>
      q
        .eq("tenant_id", actor.tenantId)
        .eq("school_year", schoolYear)
        .eq("status", "active"),
    );
    const studentIds = enrollments
      .filter((e) => e.class_id !== null && classIds.has(e.class_id))
      .map((e) => e.student_id);

    const usage = await loadServiceUsage(admin, studentIds);
    const counts = new Map(SERVICE_KEYS.map((k) => [k, 0]));
    let usingCount = 0;
    const goalStudents: string[] = [];
    for (const [id, keys] of usage) {
      if (keys.length > 0) usingCount += 1;
      if (keys.includes("goal")) goalStudents.push(id);
      for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
    }

    const today = kstYMD();
    const monday = getMondayYMD(today);
    const dates: string[] = [];
    for (let d = monday; d <= today; d = addDaysYMD(d, 1)) dates.push(d);
    const dailyByStudent = new Map<string, DailyRow[]>();
    for (let i = 0; i < goalStudents.length; i += ID_CHUNK) {
      const chunk = goalStudents.slice(i, i + ID_CHUNK);
      const rows = await readAll<DailyRow>(
        admin,
        "goal_daily_records",
        "profile_id, record_date, study_hours, target_ideal_hours",
        (q) => q.in("profile_id", chunk).in("record_date", dates),
      );
      for (const r of rows) {
        dailyByStudent.set(r.profile_id, [
          ...(dailyByStudent.get(r.profile_id) ?? []),
          r,
        ]);
      }
    }
    const rates = goalStudents.map((id) =>
      weeklyRate(dailyByStudent.get(id) ?? []),
    );
    const buckets = { low: 0, mid: 0, high: 0 };
    for (const rate of rates) {
      const rounded = Math.round(rate);
      if (rounded < LOW_BELOW) buckets.low += 1;
      else if (rounded < HIGH_FROM) buckets.mid += 1;
      else buckets.high += 1;
    }

    res.status(200).json({
      asOf: today,
      usage: { usingCount, totalCount: studentIds.length },
      goal: {
        userCount: goalStudents.length,
        average:
          rates.length > 0
            ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length)
            : null,
        buckets,
      },
      services: SERVICE_KEYS.map((key) => ({
        key,
        count: counts.get(key) ?? 0,
      })),
    });
  },
});
