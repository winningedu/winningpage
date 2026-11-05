// PATCH /api/console/students/enrollment
//   { studentId, expectedVersion, grade, classId, number, reason?, applyYear? }
//
// 학적(학년, 학급, 번호) 수정. 담임은 담당 학급 학생만(W6b), 학교 관리자와 본사 대행은 기관 전체(W12, W13b).
// 범위 밖 학생은 404 로 숨긴다. 학급이 비어 있는 학생(풀)은 담임 범위가 아니라 관리자만 배정한다.
// 이력과 version 검사는 fn_enrollment_update 가 한 트랜잭션으로 처리한다.

import { writeConsoleAuditLog } from "../../_lib/console/audit.js";
import { sendEnrollmentRpcError } from "../../_lib/console/enrollmentErrors.js";
import { requireInScope, scopeQuery } from "../../_lib/console/scope.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

const GRADES = ["중1", "중2", "중3", "고1", "고2", "고3"] as const;
const REASONS = [
  "promotion",
  "class_change",
  "number_change",
  "transfer",
  "correction",
] as const;

interface EnrollmentEdit {
  studentId: string;
  expectedVersion: number;
  grade: string | null;
  classId: string | null;
  number: number | null;
  reason: string | null;
  applyYear: number | null;
}

// postgrest 빌더 타입을 그대로 scopeQuery 제네릭에 넣으면 타입 깊이 한계를 넘는다. 쓰는 메서드만 좁힌다.
interface EnrollmentQuery {
  eq(column: string, value: string): EnrollmentQuery;
  in(column: string, values: string[]): EnrollmentQuery;
  maybeSingle(): PromiseLike<{
    data: Record<string, unknown> | null;
    error: unknown;
  }>;
}

function parseBody(body: unknown): EnrollmentEdit | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const {
    studentId,
    expectedVersion,
    grade,
    classId,
    number,
    reason,
    applyYear,
  } = b;
  if (typeof studentId !== "string" || studentId === "") return null;
  if (!Number.isInteger(expectedVersion)) return null;
  // 비우려면 null 을 명시해야 한다. 키를 빠뜨려 값이 지워지는 일을 막는다.
  if (grade === undefined || classId === undefined || number === undefined) {
    return null;
  }
  if (grade !== null && !GRADES.some((g) => g === grade)) return null;
  if (classId !== null && (typeof classId !== "string" || classId === ""))
    return null;
  if (
    number !== null &&
    !(
      Number.isInteger(number) &&
      (number as number) >= 1 &&
      (number as number) <= 99
    )
  ) {
    return null;
  }
  if (reason != null && !REASONS.some((r) => r === reason)) return null;
  if (applyYear != null && !Number.isInteger(applyYear)) return null;
  return {
    studentId,
    expectedVersion: expectedVersion as number,
    grade: grade as string | null,
    classId: classId as string | null,
    number: number as number | null,
    reason: (reason as string | null | undefined) ?? null,
    applyYear: (applyYear as number | null | undefined) ?? null,
  };
}

export default defineHandler({
  methods: ["PATCH"],
  auth: "console",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "학적을 수정하지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/students/enrollment]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const edit = parseBody(req.body);
    if (!edit) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }

    let year = edit.applyYear;
    if (year === null) {
      const { data: tenant, error: tenantError } = await ctx.supabaseAdmin
        .from("tenants")
        .select("school_year")
        .eq("id", actor.tenantId)
        .maybeSingle();
      if (tenantError || !tenant) throw new Error("tenant lookup failed");
      year = tenant.school_year as number;
    }

    const { data: current, error: lookupError } = await scopeQuery(
      ctx.supabaseAdmin
        .from("student_enrollments")
        .select("tenant_id, class_id, grade, number")
        .eq("student_id", edit.studentId)
        .eq("school_year", String(year)) as unknown as EnrollmentQuery,
      actor,
      { classColumn: "class_id" },
    ).maybeSingle();
    if (lookupError) throw new Error("enrollment lookup failed");
    if (
      !requireInScope(res, "coded", actor, {
        tenantId: (current?.tenant_id as string | undefined) ?? null,
        classId: (current?.class_id as string | null | undefined) ?? null,
      })
    ) {
      return;
    }

    const kind =
      actor.kind === "homeroom"
        ? "homeroom_edit"
        : current?.class_id
          ? "admin_direct"
          : "pool_assign";

    const { data, error } = await ctx.supabaseAdmin.rpc(
      "fn_enrollment_update",
      {
        p_student: edit.studentId,
        p_expected_version: edit.expectedVersion,
        p_to_grade: edit.grade,
        p_to_class_id: edit.classId,
        p_to_number: edit.number,
        p_kind: kind,
        p_reason: edit.reason,
        p_apply_year: edit.applyYear,
        p_actor: ctx.userId,
        p_tenant: actor.tenantId,
        p_allowed_class_ids: actor.kind === "homeroom" ? actor.classIds : null,
      },
    );
    if (error) {
      if (sendEnrollmentRpcError(res, error)) return;
      throw new Error("fn_enrollment_update failed");
    }
    const row = (
      data as { enrollment_id: string; version: number }[] | null
    )?.[0];
    if (!row) throw new Error("fn_enrollment_update returned no row");

    await writeConsoleAuditLog(
      { ...ctx, supabaseAdmin: ctx.supabaseAdmin, console: actor },
      {
        action: "update",
        resourceKey: "studentEnrollment",
        targetId: edit.studentId,
        reason: edit.reason ?? undefined,
        meta: {
          kind,
          schoolYear: year,
          from: {
            grade: current?.grade,
            classId: current?.class_id,
            number: current?.number,
          },
          to: { grade: edit.grade, classId: edit.classId, number: edit.number },
          version: row.version,
        },
      },
    );

    res.status(200).json({
      ok: true,
      enrollmentId: row.enrollment_id,
      version: row.version,
    });
  },
});
