// POST /api/admin/tenants/school-admin  { tenantId, name, phone, position?, email?, landline? }
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
import { assertQaAdminMayWrite } from "../../_lib/qaAccount.js";

export const config = { runtime: "nodejs" };

const TENANTS_RESOURCE_KEY = "tenants";
const MAX_POSITION_LENGTH = 50;
const MAX_EMAIL_LENGTH = 254;

interface AdminProfileFields {
  position?: string;
  email?: string;
  landline?: string;
}

/** 직책, 담당 이메일, 일반전화(사 #159-q3). 모두 선택이고 잘못된 값이면 null. 전화는 숫자만으로 정규화한다. */
function parseProfileFields(body: unknown): AdminProfileFields | null {
  const { position, email, landline } = (body ?? {}) as Record<string, unknown>;
  const fields: AdminProfileFields = {};
  if (position !== undefined && position !== null) {
    if (typeof position !== "string") return null;
    const trimmed = position.trim();
    if (trimmed.length > MAX_POSITION_LENGTH) return null;
    if (trimmed) fields.position = trimmed;
  }
  if (email !== undefined && email !== null) {
    if (typeof email !== "string") return null;
    const normalized = email.trim().toLowerCase();
    if (normalized) {
      if (
        normalized.length > MAX_EMAIL_LENGTH ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
      ) {
        return null;
      }
      fields.email = normalized;
    }
  }
  if (landline !== undefined && landline !== null) {
    if (typeof landline !== "string") return null;
    const digits = landline.replace(/\D/g, "");
    if (digits) {
      if (!/^0[0-9]{8,10}$/.test(digits)) return null;
      fields.landline = digits;
    }
  }
  return fields;
}

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

    await assertQaAdminMayWrite(ctx.supabaseAdmin, userId);

    const tenantId = (req.body as { tenantId?: unknown } | undefined)?.tenantId;
    const body = parseRegisterBody(req.body);
    const profileFields = parseProfileFields(req.body);
    if (
      !body ||
      !profileFields ||
      typeof tenantId !== "string" ||
      tenantId === ""
    ) {
      sendError(
        res,
        "coded",
        400,
        "기관, 이름, 전화번호, 직책, 이메일, 일반전화를 확인해 주세요.",
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
            kind: "hq",
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
          ...profileFields,
        },
      );
      res.status(200).json(registerResponseBody(result));
    } catch (error) {
      if (sendTeacherDbError(res, error)) return;
      throw error;
    }
  },
});
