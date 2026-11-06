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
import { lookupSignupTenant } from "../_lib/signup/tenant.js";
import { isSchoolmentorSite } from "../_lib/site.js";

export const config = { runtime: "nodejs" };

// 감사용 한 줄 로그. 이름, 이메일, 아이디, 번호, 비밀번호는 적지 않는다(Auth 사용자 id 와 기관 id, 결과 코드만).
function auditLog(fields: Record<string, string | boolean | null>): void {
  console.info(
    `[signup/school-student] ${Object.entries(fields)
      .map(([key, value]) => `${key}=${value ?? "none"}`)
      .join(" ")}`,
  );
}

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

    // 값싼 사전 확인: 이미 쓰는 아이디면 Auth 사용자를 만들었다 지우지 않는다. 최종 판정은 DB 가 한다.
    const { data: available, error: availableError } =
      await ctx.supabaseAdmin.rpc("is_username_available", {
        check_username: input.username,
      });
    if (availableError) throw availableError;
    if (available !== true) {
      res.status(409).json({
        code: "USERNAME_TAKEN",
        message: "이미 사용 중인 아이디입니다.",
      });
      return;
    }

    // 본인 번호 문자 인증을 가입 확정(fn_student_signup)과 같은 규칙으로 미리 본다(가입 목적, 10분 안,
    // 아직 안 쓴 것). 없으면 Auth 사용자를 만들었다 지우지 않는다. 소비와 최종 판정은 DB 가 한다.
    if (input.phone !== null) {
      const { data: verified, error: verifiedError } = await ctx.supabaseAdmin
        .from("phone_verifications")
        .select("id")
        .eq("phone", input.phone)
        .eq("purpose", "signup")
        .not("verified_at", "is", null)
        .is("consumed_at", null)
        .gte("verified_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
        .limit(1);
      if (verifiedError) throw verifiedError;
      if (!verified?.length) {
        const failure = mapSignupRpcError(
          { message: "phone_not_verified" },
          input.name,
        );
        if (!failure) throw new Error("phone_not_verified mapping missing");
        const { status, ...body } = failure;
        res.status(status).json(body);
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
    const { userId } = authUser;

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
      await discardSignupAuthUser(ctx.supabaseAdmin, userId);
      const failure = mapSignupRpcError(signupError, input.name);
      if (!failure) throw signupError;
      auditLog({ outcome: "rejected", code: failure.code, user: userId });
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
    auditLog({
      outcome: "created",
      user: userId,
      tenant: tenant?.id ?? null,
      under14: signup.under14,
    });
    if (signInError || !signed.session) {
      res.status(502).json({
        code: "LOGIN_FAILED",
        message: "가입은 완료됐어요. 로그인해 주세요.",
      });
      return;
    }

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
