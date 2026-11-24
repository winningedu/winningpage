// POST /api/console/first-password  { password }
//
// 첫 비밀번호 설정(W2, 교 #16, 사 #130). 임시 비밀번호 상태의 교사 본인만 쓸 수 있다.
// 순서: 규칙 검사 -> Auth 비밀번호 교체 -> 새 비밀번호로 다시 로그인 -> 그 세션 외 로그아웃 -> DB 임시 상태 해제 -> 감사 로그.
// 관리자 API 의 비밀번호 교체는 요청을 보낸 세션을 포함해 사용자의 모든 세션을 끝낸다. 그래서 요청에 쓴 토큰으로는
// signOut 할 수 없고, 새 비밀번호로 만든 세션을 응답으로 돌려주면 클라이언트가 setSession 한다(change-password 와 같다).
// 다른 라우트와 달리 Auth 를 먼저 바꾼다. 반대로 하면 DB 만 해제되고 Auth 교체가 실패했을 때
// 임시 비밀번호가 변경 강제 없이 계속 유효해진다. 이 순서면 실패해도 변경 강제가 남아 같은 요청을 다시 보내면 된다.
// 권한: 로그인한 교사(임시 비밀번호 상태 허용, allowMustChange).

import { createLoginAuthClient } from "../../_lib/auth/login.js";
import { writeConsoleAuditLog } from "../../_lib/console/audit.js";
import {
  checkNewPassword,
  PASSWORD_RULE_MESSAGES,
  RpcError,
  syntheticEmail,
  TEACHERS_RESOURCE_KEY,
  verifyTempPassword,
} from "../../_lib/console/teacherAccounts.js";
import {
  AuthSyncError,
  sendTeacherError,
} from "../../_lib/console/teacherManage.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";
import { getClientIp } from "../../_lib/phoneCode.js";
import {
  isPwnedAuthError,
  PASSWORD_PWNED_CODE,
  PWNED_PASSWORD_MESSAGE,
} from "../../_lib/pwnedPassword.js";

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
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const loginId = actor.loginId;
    if (!actor.teacherId || !loginId) {
      sendError(
        res,
        "coded",
        403,
        "선생님 계정만 사용할 수 있습니다.",
        "FORBIDDEN",
      );
      return;
    }
    if (!actor.mustChangePassword) {
      sendError(
        res,
        "coded",
        409,
        "이미 비밀번호를 설정한 계정입니다.",
        "NOT_REQUIRED",
      );
      return;
    }
    const { password } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof password !== "string") {
      sendError(res, "coded", 400, "비밀번호를 입력해 주세요.", "BAD_REQUEST");
      return;
    }
    const violation = checkNewPassword(password);
    if (violation) {
      sendError(
        res,
        "coded",
        400,
        PASSWORD_RULE_MESSAGES[violation],
        violation,
      );
      return;
    }
    const admin = ctx.supabaseAdmin;

    const { data: teacher, error: readError } = await admin
      .from("teachers")
      .select("temp_password_hash")
      .eq("id", actor.teacherId)
      .maybeSingle();
    if (readError || !teacher)
      throw new RpcError("teacher read", readError?.code);
    if (
      teacher.temp_password_hash &&
      (await verifyTempPassword(password, teacher.temp_password_hash))
    ) {
      sendError(
        res,
        "coded",
        400,
        "임시 비밀번호와 다른 비밀번호를 입력해 주세요.",
        "PASSWORD_SAME_AS_TEMP",
      );
      return;
    }

    try {
      const { error: authError } = await admin.auth.admin.updateUserById(
        ctx.userId as string,
        { password },
      );
      if (authError && isPwnedAuthError(authError)) {
        sendError(
          res,
          "coded",
          400,
          PWNED_PASSWORD_MESSAGE,
          PASSWORD_PWNED_CODE,
        );
        return;
      }
      if (authError) throw new AuthSyncError("password");

      // 교체로 모든 세션이 끝났으므로 새 비밀번호로 다시 로그인해 새 세션만 남긴다. DB 임시 상태 해제보다
      // 먼저 해서 실패해도 변경 강제가 남아 같은 요청을 다시 보내면 된다.
      const { data: signedIn, error: signInError } =
        await createLoginAuthClient(getClientIp(req)).auth.signInWithPassword({
          email: syntheticEmail(loginId),
          password,
        });
      const session = signedIn?.session;
      if (signInError || !session) throw new AuthSyncError("signIn");
      const { error: signOutError } = await admin.auth.admin.signOut(
        session.access_token,
        "others",
      );
      if (signOutError) throw new AuthSyncError("signOut");

      const { error } = await admin.rpc("fn_teacher_password_set", {
        p_teacher_id: actor.teacherId,
        p_tenant: actor.tenantId,
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
      res.status(200).json({
        ok: true,
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at ?? 0,
        },
      });
    } catch (error) {
      if (sendTeacherError(res, error)) return;
      throw error;
    }
  },
});
