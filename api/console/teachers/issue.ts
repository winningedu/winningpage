// POST /api/console/teachers/issue
//   { teacherId }                        계정이 없는 담임에게 계정 발급
//   { role: "school_admin", name, phone } 학교 관리자 발급(같은 사람이면 승격)
//
// W16b. 임시 비밀번호는 응답에 한 번만 싣고 저장하거나 로그에 남기지 않는다.
// 권한: 학교 관리자 또는 본사 대행.

import {
  issueAccountForExistingTeacher,
  parseRegisterBody,
  registerResponseBody,
  registerTeacherWithAccount,
  sendTeacherDbError,
} from "../../_lib/console/teacherAccounts.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "console",
  consoleRole: "schoolAdmin",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "계정을 발급하지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/teachers/issue]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const auditCtx = {
      supabaseAdmin: ctx.supabaseAdmin,
      userId: ctx.userId,
      user: ctx.user,
      console: actor,
    };
    const raw = (req.body ?? {}) as Record<string, unknown>;

    if (raw.role === "school_admin") {
      const body = parseRegisterBody(raw);
      if (!body) {
        sendError(
          res,
          "coded",
          400,
          "이름과 전화번호를 확인해 주세요.",
          "BAD_REQUEST",
        );
        return;
      }
      try {
        const result = await registerTeacherWithAccount(auditCtx, {
          tenantId: actor.tenantId,
          role: "school_admin",
          name: body.name,
          phone: body.phone,
          classes: [],
        });
        res.status(200).json(registerResponseBody(result));
      } catch (error) {
        if (sendTeacherDbError(res, error)) return;
        throw error;
      }
      return;
    }

    if (
      typeof raw.teacherId !== "string" ||
      raw.teacherId === "" ||
      raw.role !== undefined
    ) {
      sendError(res, "coded", 400, "발급 대상을 확인해 주세요.", "BAD_REQUEST");
      return;
    }
    const result = await issueAccountForExistingTeacher(
      auditCtx,
      raw.teacherId,
    );
    if (result.status === "not_found") {
      sendError(res, "coded", 404, "대상을 찾을 수 없습니다.", "NOT_FOUND");
      return;
    }
    if (result.status === "account_exists") {
      sendError(res, "coded", 409, "이미 계정이 있습니다.", "ACCOUNT_EXISTS");
      return;
    }
    res.status(200).json({
      ok: true,
      teacherId: raw.teacherId,
      loginId: result.loginId,
      tempPassword: result.issued.tempPassword,
    });
  },
});
