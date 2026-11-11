// POST /api/console/teachers/import-preview  { rows: [{ name, phone, grade, group, className }] }
//
// 교사 엑셀 미리보기(W15, 교 #123). 행 판정 9종만 계산해 돌려주고 아무것도 쓰지 않는다(감사 로그도 없다).
// 파일 안 학급 중복이 청크를 넘어 보이도록 파일 전체를 한 번에 판정한다. 적용(import)은 같은 규칙으로 다시 계산한다.
// 권한: 학교 관리자 또는 본사 대행.
import {
  parseImportRows,
  previewTeacherImport,
} from "../../../_lib/console/teacherImport.js";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

/** 전화번호와 이름으로 기존 교사를 찾는 in 목록이 URL 한도를 넘지 않게 한 번에 보는 행 수를 막는다. */
export const MAX_PREVIEW_ROWS = 200;

export default defineHandler({
  methods: ["POST"],
  auth: "console",
  consoleRole: "schoolAdmin",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "미리보기를 만들지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/teachers/import-preview]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const rows = parseImportRows(
      ((req.body ?? {}) as { rows?: unknown }).rows,
      MAX_PREVIEW_ROWS,
    );
    if (!rows) {
      sendError(
        res,
        "coded",
        400,
        `행(최대 ${MAX_PREVIEW_ROWS}개)을 확인해 주세요.`,
        "BAD_REQUEST",
      );
      return;
    }
    res.status(200).json({
      rows: await previewTeacherImport(ctx.supabaseAdmin, actor.tenantId, rows),
    });
  },
});
