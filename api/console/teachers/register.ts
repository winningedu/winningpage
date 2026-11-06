// POST /api/console/teachers/register  { name, phone, classes: [{ grade, name, groupId? }] }
//
// 담임 선생님 한 명 등록(W14b). 같은 사람(기관, 이름, 전화번호)이면 학급만 더한다.
// 새 계정을 만들면 임시 비밀번호를 응답에 한 번만 싣는다(안내 파일용). 저장하거나 로그에 남기지 않는다.
// 권한: 학교 관리자 또는 본사 대행.

import {
  parseRegisterBody,
  RpcError,
  registerResponseBody,
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
      // 전화번호가 다른 이름의 선생님과 겹치면 그 선생님의 아이디를 함께 알린다(W14b error, 사 #124).
      // 이 라우트는 학교 관리자 전용이고 같은 기관의 교사만 찾으므로 다른 기관 정보는 새지 않는다.
      if (error instanceof RpcError && error.code === "WC075") {
        const { data } = await ctx.supabaseAdmin
          .from("teachers")
          .select("login_id, deleted_at")
          .eq("tenant_id", actor.tenantId)
          .eq("phone", body.phone);
        const existing = (
          (data ?? []) as {
            login_id: string | null;
            deleted_at: string | null;
          }[]
        ).find((t) => !t.deleted_at && t.login_id);
        sendError(
          res,
          "coded",
          409,
          "다른 이름의 선생님이 이미 쓰는 전화번호입니다.",
          "PHONE_IN_USE",
          existing ? { existingLoginId: existing.login_id } : undefined,
        );
        return;
      }
      if (sendTeacherDbError(res, error)) return;
      throw error;
    }

    res.status(200).json(registerResponseBody(result));
  },
});
