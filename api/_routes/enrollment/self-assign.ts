// POST /api/enrollment/self-assign  { grade, groupName?, className, number? }
//
// 학급이 비어 있는 학생이 스스로 학급과 번호를 정한다(사 #109).
// fn_enrollment_join 은 service_role 전용이다. 학생 id 는 토큰에서, 기관은 학생 프로필에서 서버가 정해
// 넘기고 본문의 id 는 쓰지 않는다. 이미 학급이 있으면 DB 가 막는다(WC079).

import { loadTenant } from "../../_lib/console/directory.js";
import { sendEnrollmentRpcError } from "../../_lib/console/enrollmentErrors.js";
import {
  isEnrollmentGrade,
  isEnrollmentNumber,
} from "../../_lib/console/enrollmentInput.js";
import { defineHandler, requireUserId } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";
import { isSchoolmentorSite } from "../../_lib/site.js";

export const config = { runtime: "nodejs" };

interface SelfAssign {
  grade: string;
  groupName: string | null;
  className: string;
  number: number | null;
}

function parseBody(body: unknown): SelfAssign | null {
  const { grade, groupName, className, number } = (body ?? {}) as Record<
    string,
    unknown
  >;
  if (!isEnrollmentGrade(grade)) return null;
  if (typeof className !== "string" || className.trim() === "") return null;
  if (groupName != null && typeof groupName !== "string") return null;
  if (number != null && !isEnrollmentNumber(number)) return null;
  return {
    grade: grade as string,
    groupName: (groupName as string | null | undefined) ?? null,
    className,
    number: (number as number | null | undefined) ?? null,
  };
}

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "학급을 정하지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[enrollment/self-assign]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const studentId = requireUserId(ctx);
    const body = parseBody(req.body);
    if (!body) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }

    const { data: profile, error: profileError } = await ctx.supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("id", studentId)
      .maybeSingle();
    if (profileError) throw new Error("profile lookup failed");
    if (!profile?.tenant_id) {
      sendError(res, "coded", 404, "소속 기관을 찾을 수 없어요.", "NOT_FOUND");
      return;
    }

    // 스쿨멘토에서 기타 소속은 학급을 직접 정하지 않는다(결정 77, 98.9). 화면만 숨기지 않고 서버도 막는다. 위닝은 그대로다.
    if (
      isSchoolmentorSite() &&
      (await loadTenant(ctx.supabaseAdmin, profile.tenant_id as string))
        .isCatchAll
    ) {
      sendError(
        res,
        "coded",
        403,
        "기타 소속은 학급을 직접 정할 수 없어요.",
        "FORBIDDEN",
      );
      return;
    }

    const { data, error } = await ctx.supabaseAdmin.rpc("fn_enrollment_join", {
      p_student: studentId,
      p_tenant: profile.tenant_id as string,
      p_grade: body.grade,
      p_group_name: body.groupName as string,
      p_class_name: body.className,
      p_number: body.number as number,
    });
    if (error) {
      if (sendEnrollmentRpcError(res, error)) return;
      throw new Error("fn_enrollment_join failed");
    }
    const row = (
      data as
        | { enrollment_id: string; class_id: string | null; version: number }[]
        | null
    )?.[0];
    if (!row) throw new Error("fn_enrollment_join returned no row");

    res.status(200).json({
      ok: true,
      enrollmentId: row.enrollment_id,
      classId: row.class_id,
      version: row.version,
    });
  },
});
