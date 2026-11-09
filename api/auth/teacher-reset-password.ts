// POST /api/auth/teacher-reset-password  { loginId, phone, password }
//
// 선생님 비밀번호 찾기(결정 103). 휴대폰 인증(reset_password 목적)으로 번호 소유를 증명한 뒤
// 아이디와 번호가 같은 교사의 비밀번호를 새로 정한다. 스쿨멘토 전용이라 위닝에서는 404.

import { createLoginAuthClient, hashParam } from "../_lib/auth/login.js";
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
import {
  getClientIp,
  isValidMobile,
  normalizePhone,
} from "../_lib/phoneCode.js";
import { isSchoolmentorSite } from "../_lib/site.js";

export const config = { runtime: "nodejs" };

// teachers.login_id 의 CHECK 제약과 같은 형식.
const LOGIN_ID_PATTERN = /^[A-HJ-KM-NP-Z2-9]{14}$/;

// verify-phone-code 가 verified_at 을 찍은 뒤 이 창 안에서만 재설정을 허용한다(reset-password-by-phone.ts 와 같은 값).
const VERIFICATION_WINDOW_MS = 10 * 60 * 1000;

const VERIFICATION_EXPIRED_MESSAGE =
  "인증 시간이 지났어요. 인증번호를 다시 받아 주세요.";

export default defineHandler({
  methods: ["POST"],
  auth: "none",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "비밀번호를 바꾸지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[auth/teacher-reset-password]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    if (!isSchoolmentorSite()) {
      res.status(404).json({ code: "NOT_FOUND" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const loginId =
      typeof body.loginId === "string" ? body.loginId.trim().toUpperCase() : "";
    const phone = normalizePhone(body.phone);
    const password = body.password;
    if (
      !LOGIN_ID_PATTERN.test(loginId) ||
      !isValidMobile(phone) ||
      typeof password !== "string"
    ) {
      sendError(
        res,
        "coded",
        400,
        "입력한 내용을 확인해 주세요.",
        "BAD_REQUEST",
      );
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

    // 이 번호로 가장 최근에 통과한 reset_password 인증. reset-password-by-phone.ts 와 같은 판정이다.
    const { data: verification, error: verificationError } = await admin
      .from("phone_verifications")
      .select("id, verified_at")
      .eq("phone", phone)
      .eq("purpose", "reset_password")
      .is("consumed_at", null)
      .not("verified_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (verificationError) throw new Error("phone verification read failed");
    if (
      !verification?.verified_at ||
      Date.now() - new Date(verification.verified_at).getTime() >
        VERIFICATION_WINDOW_MS
    ) {
      sendError(
        res,
        "coded",
        400,
        VERIFICATION_EXPIRED_MESSAGE,
        "VERIFICATION_EXPIRED",
      );
      return;
    }

    const { data: teacher, error: teacherError } = await admin
      .from("teachers")
      .select("id, tenant_id, profile_id")
      .eq("login_id", loginId)
      .eq("phone", phone)
      .eq("status", "active")
      .is("deleted_at", null)
      .not("profile_id", "is", null)
      .maybeSingle();
    if (teacherError) throw new Error("teacher read failed");
    // 인증은 소비하지 않는다. 번호를 잘못 적은 사람이 인증을 다시 받지 않고 고쳐 적을 수 있다.
    if (!teacher) {
      sendError(
        res,
        "coded",
        400,
        "아이디와 휴대폰 번호를 다시 확인해 주세요.",
        "TEACHER_NOT_MATCHED",
      );
      return;
    }

    // 인증을 조건부 UPDATE 한 번으로 선점한다. 동시에 들어온 요청 중 하나만 통과한다.
    const { data: claimed, error: claimError } = await admin
      .from("phone_verifications")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", verification.id)
      .is("consumed_at", null)
      .select("id");
    if (claimError) throw new Error("phone verification claim failed");
    if (!claimed || claimed.length === 0) {
      sendError(
        res,
        "coded",
        400,
        VERIFICATION_EXPIRED_MESSAGE,
        "VERIFICATION_EXPIRED",
      );
      return;
    }

    // first-password.ts 와 같은 순서로 Auth 를 먼저 바꾼다. 이 아래 단계가 실패해도 비밀번호는 되돌리지 않는다.
    // 새 비밀번호는 이미 유효하고 임시 상태나 잠금이 남았더라도 새 비밀번호로 로그인하면 풀린다.
    const { error: authError } = await admin.auth.admin.updateUserById(
      teacher.profile_id,
      { password },
    );
    if (authError) {
      // 재설정이 일어나지 않았으니 선점한 인증을 되돌려 다시 시도할 수 있게 한다.
      const { error: releaseError } = await admin
        .from("phone_verifications")
        .update({ consumed_at: null })
        .eq("id", verification.id);
      if (releaseError) {
        console.error(
          "[auth/teacher-reset-password] 인증 선점 해제 실패:",
          releaseError,
        );
      }
      sendError(
        res,
        "coded",
        500,
        "비밀번호를 바꾸지 못했습니다. 다시 시도해 주세요.",
        "SAVE_FAILED",
      );
      return;
    }

    // 이전 기기 세션을 모두 끝낸다. 새 비밀번호로 만든 확인용 세션도 함께 끝내므로 응답에 세션을 싣지 않는다.
    const { data: signed, error: signInError } = await createLoginAuthClient(
      getClientIp(req),
    ).auth.signInWithPassword({
      email: syntheticEmail(loginId),
      password,
    });
    if (signInError || !signed.session)
      throw new Error("session after reset failed");
    const { error: signOutError } = await admin.auth.admin.signOut(
      signed.session.access_token,
      "global",
    );
    if (signOutError) throw new Error("sign out global failed");

    const { error: stampError } = await admin.rpc("fn_teacher_password_set", {
      p_teacher_id: teacher.id,
      p_tenant: teacher.tenant_id,
    });
    if (stampError)
      throw new RpcError("fn_teacher_password_set", stampError.code);

    // 로그인 잠금 열쇠는 로그인과 같은 해시(인증 이메일의 sha256)다. 잠겨 있던 교사가 재설정 뒤 바로 로그인할 수 있게 지운다.
    const { error: lockError } = await admin
      .from("login_attempts")
      .delete()
      .eq("identifier_hash", hashParam(syntheticEmail(loginId)));
    if (lockError) throw new Error("login attempts clear failed");

    await writeConsoleAuditLog(
      {
        supabaseAdmin: admin,
        userId: teacher.profile_id,
        console: {
          kind: "homeroom",
          tenantId: teacher.tenant_id,
          teacherId: teacher.id,
          classIds: [],
          proxySessionId: null,
          mustChangePassword: false,
          loginId,
        },
      },
      {
        action: "password_set",
        resourceKey: TEACHERS_RESOURCE_KEY,
        targetId: teacher.id,
        meta: { kind: "reset" },
      },
    );
    res.status(200).json({ ok: true });
  },
});
