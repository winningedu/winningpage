// POST /api/console/teachers/register  { name, phone, classes: [{ grade, name, groupId? }] }
//
// 담임 선생님 한 명 등록(W14b). 같은 사람(기관, 이름, 전화번호)이면 학급만 더한다.
// 새 계정을 만들면 임시 비밀번호를 응답에 한 번만 싣는다(안내 파일용). 저장하거나 로그에 남기지 않는다.
// 권한: 학교 관리자 또는 본사 대행.

import {
  parseRegisterBody,
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
  unhandledMessage: "선생님을 등록하지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/teachers/register]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const body = parseRegisterBody(req.body);
    if (!body) {
      sendError(
        res,
        "coded",
        400,
        "이름, 전화번호, 학급을 확인해 주세요.",
        "BAD_REQUEST",
      );
      return;
    }
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");

    let result: Awaited<ReturnType<typeof registerTeacherWithAccount>>;
    try {
      result = await registerTeacherWithAccount(
        {
          supabaseAdmin: ctx.supabaseAdmin,
          userId: ctx.userId,
          user: ctx.user,
          console: actor,
        },
        { tenantId: actor.tenantId, role: "homeroom", ...body },
      );
    } catch (error) {
      if (sendTeacherDbError(res, error)) return;
      throw error;
    }

    res.status(200).json({
      ok: true,
      teacherId: result.teacherId,
      loginId: result.loginId,
      verdict: result.verdict,
      ...(result.issued ? { tempPassword: result.issued.tempPassword } : {}),
    });
  },
});
