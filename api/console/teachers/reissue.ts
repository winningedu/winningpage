// POST /api/console/teachers/reissue  { teacherId }
//
// 임시 비밀번호 재발급(사 #148, 결정 16). 비밀번호 설정 전인 계정에만 허용하고, 알림톡 발송을 연결한 뒤에는
// 마지막 발송이 실패한 계정에만 허용한다.
// 새 해시를 저장하고 Auth 비밀번호를 바꿔 옛 임시 비밀번호를 무효로 한다. 평문은 응답에 한 번만 싣는다.
// 권한: 학교 관리자 또는 본사 대행.

import {
  reissueTeacherAccount,
  sendTeacherError,
} from "../../_lib/console/teacherManage.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

const REISSUE_REFUSALS = {
  not_found: [404, "대상을 찾을 수 없습니다.", "NOT_FOUND"],
  no_account: [
    409,
    "계정이 아직 없습니다. 계정을 먼저 발급해 주세요.",
    "NO_ACCOUNT",
  ],
  password_set: [
    409,
    "이미 비밀번호를 설정한 계정은 임시 비밀번호를 다시 발급할 수 없습니다.",
    "PASSWORD_ALREADY_SET",
  ],
  send_not_failed: [
    409,
    "마지막 발송이 실패한 경우에만 다시 발급할 수 있습니다.",
    "SEND_NOT_FAILED",
  ],
} as const;

export default defineHandler({
  methods: ["POST"],
  auth: "console",
  consoleRole: "schoolAdmin",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "임시 비밀번호를 다시 발급하지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/teachers/reissue]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const { teacherId } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof teacherId !== "string" || teacherId === "") {
      sendError(res, "coded", 400, "대상을 확인해 주세요.", "BAD_REQUEST");
      return;
    }
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");

    try {
      const result = await reissueTeacherAccount(
        {
          supabaseAdmin: ctx.supabaseAdmin,
          userId: ctx.userId,
          user: ctx.user,
          console: actor,
        },
        teacherId,
      );
      if (result.status !== "reissued") {
        const [status, message, code] = REISSUE_REFUSALS[result.status];
        sendError(res, "coded", status, message, code);
        return;
      }
      res.status(200).json({ ok: true, tempPassword: result.tempPassword });
    } catch (error) {
      if (sendTeacherError(res, error)) return;
      throw error;
    }
  },
});
