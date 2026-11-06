// GET /api/enrollment/me
//
// 학생 본인의 올해 학적(학년, 그룹, 반, 번호)과 열린 변경 신청을 돌려준다(사 #109, #110, #40).
// 학생은 student_enrollments 를 읽을 수 있지만 학급 이름(classes)은 읽을 수 없어 서버가 이름까지 풀어 준다.
// 학생 id 는 토큰에서만 정한다.

import {
  type ClassInfo,
  loadClassIndex,
  loadTenant,
} from "../_lib/console/directory.js";
import { defineHandler, requireUserId } from "../_lib/handler.js";

export const config = { runtime: "nodejs" };

function classParts(classes: Map<string, ClassInfo>, classId: string | null) {
  const cls = classId ? classes.get(classId) : undefined;
  return { groupName: cls?.groupName ?? null, className: cls?.name ?? null };
}

export default defineHandler({
  methods: ["GET"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "학적을 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[enrollment/me]",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    const studentId = requireUserId(ctx);
    const admin = ctx.supabaseAdmin;

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("tenant_id")
      .eq("id", studentId)
      .maybeSingle();
    if (profileError) throw new Error("profile lookup failed");
    const tenantId = profile?.tenant_id as string | null | undefined;
    if (!tenantId) {
      res
        .status(200)
        .json({ ok: true, orgType: null, enrollment: null, pending: null });
      return;
    }

    const tenant = await loadTenant(admin, tenantId);
    const [classes, enrollmentRead, pendingRead] = await Promise.all([
      loadClassIndex(admin, tenantId),
      admin
        .from("student_enrollments")
        .select("school_year, grade, class_id, number")
        .eq("student_id", studentId)
        .eq("tenant_id", tenantId)
        .eq("school_year", tenant.schoolYear)
        .eq("status", "active")
        .maybeSingle(),
      admin
        .from("enrollment_changes")
        .select("to_grade, to_class_id, to_number, created_at")
        .eq("student_id", studentId)
        .eq("tenant_id", tenantId)
        .eq("school_year", tenant.schoolYear)
        .eq("status", "pending")
        .maybeSingle(),
    ]);
    if (enrollmentRead.error || pendingRead.error) {
      throw new Error("enrollment lookup failed");
    }
    const row = enrollmentRead.data;
    const pending = pendingRead.data;

    res.status(200).json({
      ok: true,
      orgType: tenant.orgType,
      enrollment: row
        ? {
            schoolYear: row.school_year,
            grade: row.grade,
            ...classParts(classes, row.class_id),
            number: row.number,
          }
        : null,
      pending: pending
        ? {
            grade: pending.to_grade,
            ...classParts(classes, pending.to_class_id),
            number: pending.to_number,
            createdAt: pending.created_at,
          }
        : null,
    });
  },
});
