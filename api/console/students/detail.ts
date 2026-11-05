// GET /api/console/students/detail?studentId=
//
// W6a 학생 상세. 이름은 실명으로 보인다(목록에서만 가린다, 결정 35). 담임은 담당 학급 학생만 읽고
// 범위 밖과 다른 기관의 학생은 404 로 숨긴다. 여는 일은 접근 로그에 남긴다(교 #36).

import { writeConsoleAuditLog } from "../../_lib/console/audit.js";
import {
  loadClassIndex,
  loadTenant,
  readAll,
} from "../../_lib/console/directory.js";
import { isInScope } from "../../_lib/console/scope.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

interface EnrollmentRow {
  school_year: number;
  grade: string | null;
  class_id: string | null;
  number: number | null;
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

    const { schoolYear } = await loadTenant(admin, actor.tenantId);
    const rows = await readAll<EnrollmentRow>(
      admin,
      "student_enrollments",
      "school_year, grade, class_id, number",
      (q) => q.eq("tenant_id", actor.tenantId).eq("student_id", studentId),
    );
    const current = rows.find((r) => r.school_year === schoolYear);
    if (
      !current ||
      !isInScope(actor, { tenantId: actor.tenantId, classId: current.class_id })
    ) {
      sendError(res, "coded", 404, "대상을 찾을 수 없습니다.", "NOT_FOUND");
      return;
    }

    const [classes, profiles] = await Promise.all([
      loadClassIndex(admin, actor.tenantId),
      readAll<{ name: string | null; created_at: string | null }>(
        admin,
        "profiles",
        "name, created_at",
        (q) => q.eq("id", studentId),
      ),
    ]);
    const profile = profiles[0];
    const slotOf = (r: EnrollmentRow) => {
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
      enrollment: slotOf(current),
      history: [...rows]
        .sort((a, b) => b.school_year - a.school_year)
        .map((r) => ({ schoolYear: r.school_year, ...slotOf(r) })),
    });
  },
});
