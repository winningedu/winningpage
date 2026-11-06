// POST /api/signup/school-student
//
// 스쿨멘토 학생 가입 확정. 위닝 배포에서는 404.

import { createLoginAuthClient } from "../_lib/auth/login.js";
import { defineHandler } from "../_lib/handler.js";
import { getClientIp } from "../_lib/phoneCode.js";
import {
  createSignupAuthUser,
  discardSignupAuthUser,
} from "../_lib/signup/authUser.js";
import { mapSignupRpcError } from "../_lib/signup/errors.js";
import { parseSchoolStudentBody } from "../_lib/signup/schoolStudent.js";
import { isSchoolmentorSite } from "../_lib/signup/site.js";
import { lookupSignupTenant } from "../_lib/signup/tenant.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "none",
  errorShape: "detail",
  methodNotAllowedExtra: { code: "METHOD_NOT_ALLOWED" },
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
    const ip = getClientIp(req);

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

    const authUser = await createSignupAuthUser(
      ctx.supabaseAdmin,
      input.email,
      input.password,
    );
    if (!authUser.ok) {
      if (authUser.reason === "weak_password") {
        res.status(400).json({
          code: "VALIDATION",
          message: "비밀번호를 다시 확인해 주세요.",
          field: "password",
        });
      } else {
        res.status(409).json({
          code: "EMAIL_TAKEN",
          message: "이미 가입된 이메일입니다.",
        });
      }
      return;
    }
    const { userId, created } = authUser;

    const { data: signup, error: signupError } = await ctx.supabaseAdmin.rpc(
      "fn_student_signup",
      {
        p_user_id: userId,
        p_username: input.username,
        p_name: input.name,
        p_email: input.email,
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
      if (created) await discardSignupAuthUser(ctx.supabaseAdmin, userId);
      const failure = mapSignupRpcError(signupError, input.name);
      if (!failure) throw signupError;
      const { status, ...body } = failure;
      res.status(status).json(body);
      return;
    }

    const { data: signed, error: signInError } = await createLoginAuthClient(
      ip,
    ).auth.signInWithPassword({
      email: signup.email,
      password: input.password,
    });
    if (signInError || !signed.session) throw signInError;

    res.status(200).json({
      session: {
        access_token: signed.session.access_token,
        refresh_token: signed.session.refresh_token,
      },
      username: signup.username,
      linkCode: signup.link_code,
      tenantName: signup.tenant_name,
    });
  },
});
