// POST /api/console/groups  { name }
//
// 그룹 만들기(W11). 학교 관리자와 본사 대행만, 기관은 행위자에서 정한다.
// 같은 이름(대소문자 무시, 삭제된 그룹 제외)은 유일 인덱스가 막아 409 로 답한다.

import { writeConsoleAuditLog } from "../_lib/console/audit.js";
import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "console",
  consoleRole: "schoolAdmin",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "그룹을 만들지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/groups]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const { name: rawName } = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (name === "") {
      sendError(res, "coded", 400, "그룹 이름을 입력해 주세요.", "BAD_REQUEST");
      return;
    }

    const { data: group, error } = await ctx.supabaseAdmin
      .from("class_groups")
      .insert({ tenant_id: actor.tenantId, name })
      .select("id")
      .single();
    if (error?.code === "23505") {
      sendError(
        res,
        "coded",
        409,
        "이미 있는 그룹 이름이에요.",
        "GROUP_EXISTS",
      );
      return;
    }
    if (error || !group) throw new Error("class group insert failed");

    await writeConsoleAuditLog(
      { ...ctx, console: actor },
      {
        action: "update",
        resourceKey: "classGroup",
        targetId: group.id,
        meta: { op: "create", name },
      },
    );

    res.status(200).json({ ok: true, groupId: group.id });
  },
});
