// PATCH /api/console/teachers/name  { teacherId, name }
//
// 선생님 이름 수정(교 #117). 이름만 바꾸고 로그인 아이디, 전화번호, 기관은 그대로다.
// 계정이 있으면 프로필 이름도 맞춘다(화면 표시용 사본이라 같은 트랜잭션이 아니어도 된다).
// 권한: 학교 관리자 또는 본사 대행.

import { writeConsoleAuditLog } from "../../../_lib/console/audit.js";
import {
  RpcError,
  TEACHERS_RESOURCE_KEY,
} from "../../../_lib/console/teacherAccounts.js";
import { loadTeachersInScope } from "../../../_lib/console/teacherManage.js";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["PATCH"],
  auth: "console",
  consoleRole: "schoolAdmin",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "이름을 바꾸지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/teachers/name]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const { teacherId, name } = (req.body ?? {}) as Record<string, unknown>;
    if (
      typeof teacherId !== "string" ||
      teacherId === "" ||
      typeof name !== "string" ||
      name.trim() === ""
    ) {
      sendError(
        res,
        "coded",
        400,
        "대상과 이름을 확인해 주세요.",
        "BAD_REQUEST",
      );
      return;
    }
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;

    const scoped = await loadTeachersInScope(admin, actor.tenantId, [
      teacherId,
    ]);
    const teacher = scoped?.[0];
    if (!teacher) {
      sendError(res, "coded", 404, "대상을 찾을 수 없습니다.", "NOT_FOUND");
      return;
    }

    const trimmed = name.trim();
    const { error } = await admin
      .from("teachers")
      .update({ name: trimmed })
      .eq("id", teacherId)
      .eq("tenant_id", actor.tenantId);
    if (error) throw new RpcError("teachers name update", error.code);

    if (teacher.profileId) {
      const { error: profileError } = await admin
        .from("profiles")
        .update({ name: trimmed })
        .eq("id", teacher.profileId);
      if (profileError)
        throw new RpcError("profiles name update", profileError.code);
    }

    await writeConsoleAuditLog(
      {
        supabaseAdmin: admin,
        userId: ctx.userId,
        user: ctx.user,
        console: actor,
      },
      {
        action: "update",
        resourceKey: TEACHERS_RESOURCE_KEY,
        targetId: teacherId,
        meta: { field: "name" },
      },
    );
    res.status(200).json({ ok: true });
  },
});
