// POST /api/signup/school-student
//
// 스쿨멘토 학생 가입 확정. 위닝 배포에서는 404.

import { SYNTHETIC_DOMAIN } from "../../_lib/auth/login.js";
import { defineHandler, requireUserId } from "../../_lib/handler.js";
import { getClientIp } from "../../_lib/phoneCode.js";
import { mapSignupRpcError } from "../../_lib/signup/errors.js";
import { parseSchoolStudentBody } from "../../_lib/signup/schoolStudent.js";
import { lookupSignupTenant } from "../../_lib/signup/tenant.js";
import { isSchoolmentorSite } from "../../_lib/site.js";

export const config = { runtime: "nodejs" };

// 감사용 한 줄 로그. 이름, 이메일, 번호는 적지 않는다(Auth 사용자 id 와 기관 id, 결과 코드만).
function auditLog(fields: Record<string, string | boolean | null>): void {
  console.info(
    `[signup/school-student] ${Object.entries(fields)
      .map(([key, value]) => `${key}=${value ?? "none"}`)
      .join(" ")}`,
  );
}

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "detail",
  methodNotAllowedExtra: { code: "METHOD_NOT_ALLOWED" },
  authFailureExtra: { code: "UNAUTHENTICATED" },
  unhandledMessage: "가입하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  unhandledExtra: {
    code: "INTERNAL",
    message: "가입하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  },
  logLabel: "[signup/school-student]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    if (!isSchoolmentorSite()) {
      res.status(404).json({ code: "NOT_FOUND" });
      return;
    }
    // 이메일은 브라우저가 이미 인증을 마친 Auth 사용자(토큰)에서 읽는다. 본문의 값은 받지 않는다.
    const userId = requireUserId(ctx);
    const authUser = ctx.user;
    if (!authUser?.email_confirmed_at) {
      res.status(403).json({
        code: "EMAIL_NOT_VERIFIED",
        message: "이메일 인증을 먼저 완료해 주세요.",
      });
      return;
    }
    // 교사 합성 이메일(로그인 미끼 DECOY_EMAIL 포함)은 학생 이메일로 받지 않는다.
    if (authUser.email?.toLowerCase().endsWith(`@${SYNTHETIC_DOMAIN}`)) {
      res.status(400).json({
        code: "VALIDATION",
        message: "입력한 내용을 확인해 주세요.",
        field: "email",
      });
      return;
    }
    const ip = getClientIp(req);
    if (!ip) {
      res.status(400).json({ code: "CLIENT_IP_MISSING" });
      return;
    }
    const parsed = parseSchoolStudentBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({
        code: "VALIDATION",
        message: "입력한 내용을 확인해 주세요.",
        field: parsed.field,
      });
      return;
    }
    const input = parsed.value;

    // 클라이언트가 보낸 기관 id 는 받지 않는다. 코드로 다시 찾는다(null 은 기타 소속).
    let tenant: { id: string; name: string; orgType: string } | null = null;
    if (input.tenantCode !== null) {
      const found = await lookupSignupTenant(
        ctx.supabaseAdmin,
        input.tenantCode,
        ip,
      );
      if (!found.ok) {
        if (found.reason === "rate_limited") {
          res.status(429).json({ code: "WC068" });
        } else {
          res.status(404).json({
            code: "TENANT_NOT_FOUND",
            message: "소속코드를 다시 확인해 주세요.",
          });
        }
        return;
      }
      tenant = found.tenant;
      // 학교와 학원은 반이 필수다(결정 77). 기타 소속은 반과 번호를 받지 않는다.
      if (!input.className) {
        res.status(400).json({
          code: "CLASS_REQUIRED",
          message: "반을 입력해 주세요.",
          field: "className",
        });
        return;
      }
    }

    const { data: signup, error: signupError } = await ctx.supabaseAdmin.rpc(
      "fn_student_signup",
      {
        p_user_id: userId,
        p_username: null,
        p_name: input.name,
        p_email: null,
        p_phone: input.phone,
        p_birth_date: input.birthDate,
        p_gender: input.gender,
        p_tenant_id: tenant?.id ?? null,
        p_grade: input.grade,
        p_group_name: input.groupName,
        p_class_name: input.className,
        p_number: input.number,
        p_guardian_name: input.guardianName,
        p_guardian_phone: input.guardianPhone,
        p_guardian_relation: input.guardianRelation,
        p_guardian_consent: input.guardianConsent,
        p_identity_request_id: input.identityRequestId,
        p_agree_service: input.agreeService,
        p_agree_privacy: input.agreePrivacy,
        p_agree_db_transfer: input.agreeDbTransfer,
        p_agree_marketing: input.agreeMarketing,
      },
    );
    if (signupError) {
      const failure = mapSignupRpcError(signupError, input.name);
      if (!failure) throw signupError;
      auditLog({ outcome: "rejected", code: failure.code, user: userId });
      const { status, ...body } = failure;
      res.status(status).json(body);
      return;
    }

    auditLog({
      outcome: "created",
      user: userId,
      tenant: tenant?.id ?? null,
      under14: signup.under14,
    });
    res.status(200).json({
      linkCode: signup.link_code,
      tenantName: signup.tenant_name,
    });
  },
});
