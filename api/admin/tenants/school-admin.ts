// POST /api/admin/tenants/school-admin  { tenantId, name, phone }
//
// 본사가 기관 관리 화면에서 학교 관리자를 발급한다(사 #132, #159, D9). 같은 사람(기관, 이름, 전화번호)이
// 이미 담임이면 그 행을 학교 관리자로 승격한다. 임시 비밀번호는 응답에 한 번만 싣는다.
// 권한: 로그인 + HQ 권한 tenants edit(fn_admin_effective_permissions). 대행 세션은 필요 없다.

import { hasAdminEditPermission } from "../../_lib/console/proxy.js";
import {
  parseRegisterBody,
  registerResponseBody,
  registerTeacherWithAccount,
  sendTeacherDbError,
} from "../../_lib/console/teacherAccounts.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

const TENANTS_RESOURCE_KEY = "tenants";

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "학교 관리자를 발급하지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[admin/tenants/school-admin]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const userId = ctx.userId as string;
    if (
      !(await hasAdminEditPermission(
        ctx.supabaseAdmin,
        userId,
        TENANTS_RESOURCE_KEY,
      ))
    ) {
      sendError(res, "coded", 403, "기관 관리 권한이 없습니다.", "FORBIDDEN");
      return;
    }

    const tenantId = (req.body as { tenantId?: unknown } | undefined)?.tenantId;
    const body = parseRegisterBody(req.body);
    if (!body || typeof tenantId !== "string" || tenantId === "") {
      sendError(
        res,
        "coded",
        400,
        "기관, 이름, 전화번호를 확인해 주세요.",
        "BAD_REQUEST",
      );
      return;
    }

    try {
      const result = await registerTeacherWithAccount(
        {
          supabaseAdmin: ctx.supabaseAdmin,
          userId,
          user: ctx.user,
          // 대행 세션 없이 본사 관리자가 직접 하는 일이라 proxySessionId 는 비어 있다.
          console: {
            kind: "hq_proxy",
            tenantId,
            teacherId: null,
            classIds: [],
            proxySessionId: null,
            mustChangePassword: false,
            loginId: null,
          },
        },
        {
          tenantId,
          role: "school_admin",
          name: body.name,
          phone: body.phone,
          classes: [],
        },
      );
      res.status(200).json(registerResponseBody(result));
    } catch (error) {
      if (sendTeacherDbError(res, error)) return;
      throw error;
    }
  },
});
