// GET /api/console/students/detail?studentId=
//
// W6a 학생 상세. 이름은 실명으로 보인다(목록에서만 가린다, 결정 35). 담임은 담당 학급 학생만 읽고
// 범위 밖과 다른 기관의 학생은 404 로 숨긴다. 여는 일은 접근 로그에 남긴다(교 #36).

import { writeConsoleAuditLog } from "../../_lib/console/audit.js";
import {
  loadClassIndex,
  loadHomeroomName,
  readAll,
} from "../../_lib/console/directory.js";
import { loadServiceSummaries } from "../../_lib/console/serviceSummary.js";
import {
  loadServiceUsage,
  SERVICE_KEYS,
  type ServiceKey,
} from "../../_lib/console/serviceUsage.js";
import { loadScopedEnrollment } from "../../_lib/console/studentScope.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

interface EnrollmentRow {
  school_year: number;
  grade: string | null;
  class_id: string | null;
  number: number | null;
}

// 서비스 키와 이용 한도 테이블의 program_key 가 다른 서비스.
const PROGRAM_KEY: Record<ServiceKey, string> = {
  diagnosis: "diagnose",
  goal: "target",
  growth: "growth",
  performance: "suhaeng",
  selfeval: "selfeval",
  inquiry: "inquiry",
};

interface UsageStateRow {
  month_used: number | null;
  month_limit: number | null;
  month_remaining: number | null;
  term_used: number | null;
  term_limit: number | null;
  term_remaining: number | null;
}

const KST_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });

export default defineHandler({
  methods: ["GET"],
  auth: "console",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "학생 정보를 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/students/detail]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;

    const studentId = Array.isArray(req.query.studentId)
      ? req.query.studentId[0]
      : req.query.studentId;
    if (!studentId) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }

    const current = await loadScopedEnrollment(admin, res, actor, studentId);
    if (!current) return;
    const rows = await readAll<EnrollmentRow>(
      admin,
      "student_enrollments",
      "school_year, grade, class_id, number",
      (q) => q.eq("tenant_id", actor.tenantId).eq("student_id", studentId),
    );

    const [
      classes,
      profiles,
      used,
      usageStates,
      summaries,
      flags,
      homeroomName,
    ] = await Promise.all([
      loadClassIndex(admin, actor.tenantId),
      readAll<{
        name: string | null;
        created_at: string | null;
        last_seen_at: string | null;
      }>(admin, "profiles", "name, created_at, last_seen_at", (q) =>
        q.eq("id", studentId),
      ),
      loadServiceUsage(admin, [studentId]),
      Promise.all(
        SERVICE_KEYS.map(async (key) => {
          const { data, error } = await admin.rpc("fn_tenant_usage_state", {
            p_profile: studentId,
            p_program_key: PROGRAM_KEY[key],
          });
          if (error) throw new Error("usage state lookup failed");
          return (data as UsageStateRow[] | null)?.[0];
        }),
      ),
      loadServiceSummaries(admin, studentId),
      readAll<{ student_id: string }>(
        admin,
        "student_flags",
        "student_id",
        (q) => q.eq("tenant_id", actor.tenantId).eq("student_id", studentId),
        "student_id",
      ),
      loadHomeroomName(admin, actor.tenantId, current.class_id),
    ]);
    const profile = profiles[0];
    const slotOf = (r: Omit<EnrollmentRow, "school_year">) => {
      const cls = r.class_id ? classes.get(r.class_id) : undefined;
      return {
        grade: r.grade,
        groupName: cls?.groupName ?? null,
        className: cls?.name ?? null,
        number: r.number,
      };
    };

    await writeConsoleAuditLog(
      { ...ctx, supabaseAdmin: admin, console: actor },
      { action: "view", resourceKey: "studentDetail", targetId: studentId },
    );

    res.status(200).json({
      studentId,
      name: profile?.name ?? "",
      joinedAt: profile?.created_at
        ? KST_DATE.format(new Date(profile.created_at))
        : null,
      lastSeenAt: profile?.last_seen_at ?? null,
      flagged: flags.length > 0,
      enrollment: { ...slotOf(current), homeroomName },
      summaries,
      history: [...rows]
        .sort((a, b) => b.school_year - a.school_year)
        .map((r) => ({ schoolYear: r.school_year, ...slotOf(r) })),
      services: Object.fromEntries(
        SERVICE_KEYS.map((key) => [
          key,
          (used.get(studentId) ?? []).includes(key),
        ]),
      ),
      usage: SERVICE_KEYS.map((key, i) => {
        const state = usageStates[i];
        return {
          key,
          monthUsed: state?.month_used ?? null,
          monthLimit: state?.month_limit ?? null,
          monthRemaining: state?.month_remaining ?? null,
          termUsed: state?.term_used ?? null,
          termLimit: state?.term_limit ?? null,
          termRemaining: state?.term_remaining ?? null,
        };
      }),
    });
  },
});
