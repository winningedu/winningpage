// POST /api/console/enrollment-requests/decide  { changeId, approve, rejectReason? }
//
// 학생의 학적 변경 신청을 승인하거나 거절한다(W13, W13c).
// 승인자 판정(도착 학급 담임, 담임이 없으면 학교 관리자나 본사 대행), version 검사, 적용은
// fn_decide_enrollment_change 가 한 트랜잭션으로 처리한다. 다른 기관의 신청 id 는 404 로 숨긴다.
// 응답에는 토스트용 { studentName, to } 를 싣는다(이름은 담임만 실명). 번호 중복(409 NUMBER_TAKEN)에는
// 그 번호를 쓰는 학생(occupant)을 싣는다.

import { writeConsoleAuditLog } from "../../../_lib/console/audit.js";
import { loadSlotLabel } from "../../../_lib/console/directory.js";
import {
  loadOccupantContext,
  sendEnrollmentRpcError,
} from "../../../_lib/console/enrollmentErrors.js";
import { displayNameFor } from "../../../_lib/console/maskName.js";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

function parseBody(
  body: unknown,
): { changeId: string; approve: boolean; rejectReason: string | null } | null {
  const { changeId, approve, rejectReason } = (body ?? {}) as Record<
    string,
    unknown
  >;
  if (typeof changeId !== "string" || changeId === "") return null;
  if (typeof approve !== "boolean") return null;
  if (rejectReason != null && typeof rejectReason !== "string") return null;
  return { changeId, approve, rejectReason: rejectReason ?? null };
}

export default defineHandler({
  methods: ["POST"],
  auth: "console",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "신청을 처리하지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/enrollment-requests/decide]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const body = parseBody(req.body);
    if (!body) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }

    const { data: change, error: lookupError } = await ctx.supabaseAdmin
      .from("enrollment_changes")
      .select("id, student_id, to_grade, to_class_id, to_number")
      .eq("id", body.changeId)
      .eq("tenant_id", actor.tenantId)
      .maybeSingle();
    if (lookupError) throw new Error("enrollment change lookup failed");
    if (!change) {
      sendError(
        res,
        "coded",
        404,
        "신청을 찾을 수 없거나 이미 처리됐어요.",
        "REQUEST_NOT_FOUND",
      );
      return;
    }

    // 토스트에 쓸 학생 이름과 요청한 자리. 적용 뒤에 읽다가 실패하면 처리된 신청이 실패로 보이므로 먼저 읽는다.
    const { data: student, error: studentError } = await ctx.supabaseAdmin
      .from("profiles")
      .select("name")
      .eq("id", change.student_id)
      .maybeSingle();
    if (studentError) throw new Error("student lookup failed");
    const to = await loadSlotLabel(ctx.supabaseAdmin, actor.tenantId, {
      grade: change.to_grade,
      classId: change.to_class_id,
      number: change.to_number,
    });

    const { data: status, error } = await ctx.supabaseAdmin.rpc(
      "fn_decide_enrollment_change",
      {
        p_change_id: body.changeId,
        p_approve: body.approve,
        p_reject_reason: body.rejectReason,
        p_actor: ctx.userId,
      },
    );
    if (error) {
      const occupant =
        error.code === "WC077"
          ? await loadOccupantContext(
              ctx.supabaseAdmin,
              actor,
              change.to_class_id,
              change.to_number,
            )
          : undefined;
      if (sendEnrollmentRpcError(res, error, occupant)) return;
      throw new Error("fn_decide_enrollment_change failed");
    }
    if (typeof status !== "string") {
      throw new Error("fn_decide_enrollment_change returned no status");
    }

    await writeConsoleAuditLog(
      { ...ctx, console: actor },
      {
        action: "update",
        resourceKey: "enrollmentRequest",
        targetId: body.changeId,
        reason: body.rejectReason ?? undefined,
        meta: { decision: status, studentId: change.student_id },
      },
    );

    res.status(200).json({
      ok: true,
      status,
      studentName: displayNameFor(actor, student?.name ?? ""),
      to,
    });
  },
});
