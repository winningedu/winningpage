// POST /api/console/assign-pool/confirm
//   { studentId, expectedVersion }
//
// W12 미배정 목록의 "확인 필요" 학생(스스로 적은 반이 명단과 맞지 않은 가입 학생)을 확인한다. 학생은 그 반에 그대로 있고
// 목록에서만 빠진다. 권한은 풀 배치와 같다: 학교 관리자와 본사 대행은 기관 전체, 담임은 담당 반 학생만(범위 밖은 404),
// 읽기 전용 대행은 공통 처리부가 막는다. version 검사, 이력(enrollment_changes kind confirm)은 fn_enrollment_confirm 이
// 한 트랜잭션으로 한다. 이미 확인된 학생은 바꾸지 않고 200 changed false 로 끝난다(멱등, 감사 로그도 남기지 않는다).
// 응답: 200 { version, changed }. 오류는 problem+json 의 code: 400 BAD_REQUEST, 404 NOT_FOUND(WC081),
// 409 VERSION_CONFLICT(WC078), 403 READ_ONLY_PROXY.

import { writeConsoleAuditLog } from "../../../_lib/console/audit.js";
import { sendEnrollmentRpcError } from "../../../_lib/console/enrollmentErrors.js";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "console",
  errorShape: "problem",
  unhandledMessage: "학적을 확인하지 못했습니다.",
  logLabel: "[console/assign-pool/confirm]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const { studentId, expectedVersion } = (req.body ?? {}) as Record<
      string,
      unknown
    >;
    if (
      typeof studentId !== "string" ||
      studentId === "" ||
      !Number.isInteger(expectedVersion)
    ) {
      sendError(res, "problem", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }

    const { data, error } = await ctx.supabaseAdmin.rpc(
      "fn_enrollment_confirm",
      {
        p_student: studentId,
        p_expected_version: expectedVersion as number,
        p_actor: ctx.userId,
        p_tenant: actor.tenantId,
        p_allowed_class_ids: actor.kind === "homeroom" ? actor.classIds : null,
      },
    );
    if (error) {
      if (sendEnrollmentRpcError(res, error, undefined, "problem")) return;
      throw new Error("fn_enrollment_confirm failed");
    }
    const row = (
      data as
        | { enrollment_id: string; version: number; changed: boolean }[]
        | null
    )?.[0];
    if (!row) throw new Error("fn_enrollment_confirm returned no row");

    if (row.changed) {
      await writeConsoleAuditLog(
        { ...ctx, supabaseAdmin: ctx.supabaseAdmin, console: actor },
        {
          action: "update",
          resourceKey: "studentEnrollment",
          targetId: studentId,
          meta: { kind: "confirm", version: row.version },
        },
      );
    }

    res.status(200).json({ version: row.version, changed: row.changed });
  },
});
