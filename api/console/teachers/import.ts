// POST /api/console/teachers/import  { requestId, mode: "overwrite" | "skip", rows: [{ name, phone, grade, group, className }] }
//
// 교사 엑셀 일괄 등록(W15). 클라이언트가 20행씩 나눠 보내고, 행 판정 9종은 서버가 다시 계산한다.
// 같은 requestId 로 다시 보내면 새로 만들지 않는다. 임시 비밀번호는 응답에 한 번만 싣는다.
// 권한: 학교 관리자 또는 본사 대행.

import { sendTeacherDbError } from "../../_lib/console/teacherAccounts.js";
import {
  parseImportBody,
  runTeacherImport,
} from "../../_lib/console/teacherImport.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "console",
  consoleRole: "schoolAdmin",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "선생님을 일괄 등록하지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/teachers/import]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const body = parseImportBody(req.body);
    if (!body) {
      sendError(
        res,
        "coded",
        400,
        "요청 번호, 적용 방식, 행(최대 20개)을 확인해 주세요.",
        "BAD_REQUEST",
      );
      return;
    }

    try {
      const outcome = await runTeacherImport(
        {
          supabaseAdmin: ctx.supabaseAdmin,
          userId: ctx.userId,
          user: ctx.user,
          console: actor,
        },
        body,
      );
      res.status(200).json({ ok: true, ...outcome });
    } catch (error) {
      if (sendTeacherDbError(res, error)) return;
      throw error;
    }
  },
});
