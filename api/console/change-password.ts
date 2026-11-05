// POST /api/console/change-password  { currentPassword, newPassword }
//
// 로그인한 교사의 비밀번호 변경(W18a, 교 #208, 설계 P9). 현재 비밀번호 확인은 로그인과 같은 잠금 흐름
// (attemptLogin)을 거쳐 틀리면 실패 횟수에 들어가고 5회째에 10분 잠긴다. 맞으면 Auth 비밀번호를 바꾸고
// 새 비밀번호로 만든 세션을 돌려주고(클라이언트가 setSession) 그 세션 외의 세션은 모두 끝낸다. 비밀번호는 저장하거나 로그에 남기지 않는다.
// 권한: 로그인한 교사(임시 비밀번호 상태는 first-password 를 쓴다).

import { attemptLogin, createLoginAuthClient } from "../_lib/auth/login.js";
import { writeConsoleAuditLog } from "../_lib/console/audit.js";
import {
  checkNewPassword,
  PASSWORD_RULE_MESSAGES,
  RpcError,
  syntheticEmail,
  TEACHERS_RESOURCE_KEY,
} from "../_lib/console/teacherAccounts.js";
import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import { getClientIp } from "../_lib/phoneCode.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "console",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "비밀번호를 바꾸지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/change-password]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const { currentPassword, newPassword } = (req.body ?? {}) as Record<
      string,
      unknown
    >;
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
    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string"
    ) {
      sendError(res, "coded", 400, "비밀번호를 입력해 주세요.", "BAD_REQUEST");
      return;
    }

    const violation = checkNewPassword(newPassword);
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
    const authClient = createLoginAuthClient(getClientIp(req));
    const login = await attemptLogin(admin, {
      identifier: loginId,
      password: currentPassword,
      signIn: async (email, password) =>
        authClient.auth.signInWithPassword({ email, password }),
    });
    if (!login.ok) {
      if (login.retryAfterSeconds !== undefined) {
        res.setHeader("Retry-After", String(login.retryAfterSeconds));
      }
      sendError(
        res,
        "coded",
        login.status,
        login.message,
        login.code,
        login.extra,
      );
      return;
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(
      ctx.userId as string,
      { password: newPassword },
    );
    if (updateError) throw new Error("password update failed");

    const { error: stampError } = await admin.rpc("fn_teacher_password_set", {
      p_teacher_id: actor.teacherId,
      p_tenant: actor.tenantId,
    });
    if (stampError)
      throw new RpcError("fn_teacher_password_set", stampError.code);

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
        meta: { kind: "change" },
      },
    );

    const { data, error } = await authClient.auth.signInWithPassword({
      email: syntheticEmail(loginId),
      password: newPassword,
    });
    if (error || !data.session) throw new Error("session after change failed");
    // 새 세션만 남긴다. 이전 기기 세션과 현재 비밀번호 확인용 세션은 여기서 끝낸다.
    const { error: signOutError } = await admin.auth.admin.signOut(
      data.session.access_token,
      "others",
    );
    if (signOutError) throw new Error("sign out others failed");
    res.status(200).json({
      ok: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at ?? 0,
      },
    });
  },
});
