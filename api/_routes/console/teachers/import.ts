// POST /api/console/teachers/import  { requestId, chunkIndex, mode: "overwrite" | "skip", rows: [{ name, phone, grade, group, className }] }
//
// 교사 엑셀 일괄 등록(W15). 클라이언트가 20행씩 나눠 보내고, 행 판정 9종은 서버가 다시 계산한다.
// 같은 (requestId, chunkIndex) 로 다시 보내면 새로 만들지 않고, 내용이 다르면 400 IDEMPOTENCY_KEY_MISMATCH 다. 임시 비밀번호는 응답에 한 번만 싣는다.
// 권한: 학교 관리자 또는 본사 대행.

import { sendTeacherDbError } from "../../../_lib/console/teacherAccounts.js";
import {
  parseImportBody,
  runTeacherImport,
} from "../../../_lib/console/teacherImport.js";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";

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
        "요청 번호, 순번, 적용 방식, 행(최대 20개)을 확인해 주세요.",
        "BAD_REQUEST",
      );
      return;
    }

    try {
      const result = await runTeacherImport(
        {
          supabaseAdmin: ctx.supabaseAdmin,
          userId: ctx.userId,
          user: ctx.user,
          console: actor,
        },
        body,
      );
      if (result.status === "request_id_in_use") {
        sendError(
          res,
          "coded",
          409,
          "이미 다른 곳에서 쓴 요청 번호입니다. 새로 시도해 주세요.",
          "REQUEST_ID_IN_USE",
        );
        return;
      }
      if (result.status === "key_mismatch") {
        sendError(
          res,
          "coded",
          400,
          "같은 요청 번호와 순번에 다른 내용을 보냈습니다. 새로 시도해 주세요.",
          "IDEMPOTENCY_KEY_MISMATCH",
        );
        return;
      }
      if (result.status === "in_progress") {
        sendError(
          res,
          "coded",
          409,
          "같은 묶음을 처리하고 있습니다. 잠시 뒤 다시 시도해 주세요.",
          "IN_PROGRESS",
        );
        return;
      }
      res.status(200).json({ ok: true, ...result.outcome });
    } catch (error) {
      if (sendTeacherDbError(res, error)) return;
      throw error;
    }
  },
});
