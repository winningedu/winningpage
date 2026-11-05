// POST /api/console/first-password  { password }
//
// 첫 비밀번호 설정(W2, 교 #16, 사 #130). 임시 비밀번호 상태의 교사 본인만 쓸 수 있다.
// 순서: 규칙 검사 -> Auth 비밀번호 교체 -> DB 임시 상태 해제 -> 감사 로그.
// 다른 라우트와 달리 Auth 를 먼저 바꾼다. 반대로 하면 DB 만 해제되고 Auth 교체가 실패했을 때
// 임시 비밀번호가 변경 강제 없이 계속 유효해진다. 이 순서면 실패해도 변경 강제가 남아 같은 요청을 다시 보내면 된다.
// 권한: 로그인한 교사(임시 비밀번호 상태 허용, allowMustChange).

import { writeConsoleAuditLog } from "../_lib/console/audit.js";
import {
  RpcError,
  TEACHERS_RESOURCE_KEY,
} from "../_lib/console/teacherAccounts.js";
import {
  AuthSyncError,
  sendTeacherError,
} from "../_lib/console/teacherManage.js";
import { defineHandler } from "../_lib/handler.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "console",
  allowMustChange: true,
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "비밀번호를 설정하지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/first-password]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const { password } = (req.body ?? {}) as { password: string };
    const actor = ctx.console;
    if (!actor?.teacherId) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;

    try {
      const { error: authError } = await admin.auth.admin.updateUserById(
        ctx.userId as string,
        { password },
      );
      if (authError) throw new AuthSyncError("password");

      const { error } = await admin.rpc("fn_teacher_password_set", {
        p_teacher_id: actor.teacherId,
      });
      if (error) throw new RpcError("fn_teacher_password_set", error.code);

      await writeConsoleAuditLog(
        {
          supabaseAdmin: admin,
          userId: ctx.userId,
          user: ctx.user,
          console: actor,
        },
        {
          action: "password_set",
          resourceKey: TEACHERS_RESOURCE_KEY,
          targetId: actor.teacherId,
          meta: { kind: "first" },
        },
      );
      res.status(200).json({ ok: true });
    } catch (error) {
      if (sendTeacherError(res, error)) return;
      throw error;
    }
  },
});
