// POST /api/admin/tenants/school-admin  { tenantId, name, phone, position?, email?, landline? }
//
// 본사가 기관 관리 화면에서 학교 관리자를 발급한다(사 #132, #159, D9). 같은 사람(기관, 이름, 전화번호)이
// 이미 담임이면 그 행을 학교 관리자로 승격한다. 임시 비밀번호는 응답에 한 번만 싣는다.
// 권한: 관리자 + 메뉴 tenants edit. 판정과 QA 계정 쓰기 차단은 defineHandler 가 한다. 대행 세션은 필요 없다.

import { z } from "zod";
import { getBearerToken } from "../../../_lib/adminAuth.js";
import {
  parseRegisterBody,
  registerResponseBody,
  registerTeacherWithAccount,
  sendTeacherDbError,
} from "../../../_lib/console/teacherAccounts.js";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

// 이름, 전화번호, 직책 같은 나머지 칸은 아래 parse 함수가 정규화하며 본다.
const bodySchema = z.looseObject({ tenantId: z.string().min(1) });
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
  auth: "admin",
  errorShape: "problem",
  permission: { key: "tenants" },
  body: bodySchema,
  unhandledMessage: "전체 관리자를 발급하지 못했습니다.",
  logLabel: "[admin/tenants/school-admin]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const userId = ctx.userId as string;
    const { tenantId } = ctx.body;
    const body = parseRegisterBody(req.body);
    const profileFields = parseProfileFields(req.body);
    if (!body || !profileFields) {
      sendError(
        res,
        "problem",
        400,
        "기관, 이름, 전화번호, 직책, 이메일, 일반전화를 확인해 주세요.",
        "VALIDATION_FAILED",
      );
      return;
    }

    // 감사 로그의 실행자 이메일용. auth:"admin" 은 user 를 싣지 않아 토큰으로 다시 읽는다.
    const { data: authData } = await ctx.supabaseAdmin.auth.getUser(
      getBearerToken(req),
    );

    try {
      const result = await registerTeacherWithAccount(
        {
          supabaseAdmin: ctx.supabaseAdmin,
          userId,
          user: authData.user ?? undefined,
          // 대행 세션 없이 본사 관리자가 직접 하는 일이라 proxySessionId 는 비어 있다.
          console: {
            kind: "hq",
            tenantId,
            teacherId: null,
            classIds: [],
            proxySessionId: null,
            mustChangePassword: false,
            loginId: null,
            readOnly: false,
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
      const { ok: _ok, ...created } = registerResponseBody(result);
      res.status(200).json(created);
    } catch (error) {
      if (sendTeacherDbError(res, error, "problem")) return;
      throw error;
    }
  },
});
