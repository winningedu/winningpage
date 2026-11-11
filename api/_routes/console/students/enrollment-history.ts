// GET /api/console/students/enrollment-history?studentId=
//
// W13a 학년도별 이력 창. 한 학생의 학년도별 학년, 그룹, 반, 번호와 연결된 서비스를 준다.
// 이름은 창 제목에 실명으로 쓴다(결정 35, 목록에서만 가린다). 담임은 자기 학급 학생만 읽고
// 범위 밖과 다른 기관의 학생은 404 로 숨긴다. 코칭은 학교 관리자와 담당 학급 학생에게만 열린다.

import {
  loadClassIndex,
  loadProfileNames,
  loadTenant,
  readAll,
} from "../../../_lib/console/directory.js";
import { isInScope } from "../../../_lib/console/scope.js";
import { loadServiceUsage } from "../../../_lib/console/serviceUsage.js";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

interface EnrollmentRow {
  school_year: number;
  grade: string | null;
  class_id: string | null;
  number: number | null;
}

export default defineHandler({
  methods: ["GET"],
  auth: "console",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "학년도별 이력을 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/students/enrollment-history]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;

    const rawId = Array.isArray(req.query.studentId)
      ? req.query.studentId[0]
      : req.query.studentId;
    if (!rawId) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }
    const studentId = rawId;

    const rows = await readAll<EnrollmentRow>(
      admin,
      "student_enrollments",
      "school_year, grade, class_id, number",
      (q) => q.eq("tenant_id", actor.tenantId).eq("student_id", studentId),
    );
    const visible = rows.some((r) =>
      isInScope(actor, { tenantId: actor.tenantId, classId: r.class_id }),
    );
    if (!visible) {
      sendError(res, "coded", 404, "대상을 찾을 수 없습니다.", "NOT_FOUND");
      return;
    }

    const { schoolYear } = await loadTenant(admin, actor.tenantId);
    const [classes, names, services] = await Promise.all([
      loadClassIndex(admin, actor.tenantId),
      loadProfileNames(admin, [studentId]),
      loadServiceUsage(admin, [studentId]),
    ]);
    const currentClassId = rows.find(
      (r) => r.school_year === schoolYear,
    )?.class_id;

    res.status(200).json({
      studentId,
      name: names.get(studentId) ?? "",
      linkedServices: services.get(studentId) ?? [],
      years: [...rows]
        .sort((a, b) => b.school_year - a.school_year)
        .map((r) => {
          const cls = r.class_id ? classes.get(r.class_id) : undefined;
          return {
            schoolYear: r.school_year,
            grade: r.grade,
            groupName: cls?.groupName ?? null,
            className: cls?.name ?? null,
            number: r.number,
            current: r.school_year === schoolYear,
          };
        }),
      canOpenCoaching:
        actor.kind !== "homeroom" ||
        (!!currentClassId && actor.classIds.includes(currentClassId)),
    });
  },
});
