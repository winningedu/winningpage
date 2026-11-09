// POST /api/auth/teacher-reset-password  { loginId, phone, password }
//
// 선생님 비밀번호 찾기(결정 103). 휴대폰 인증(reset_password 목적)으로 번호 소유를 증명한 뒤
// 아이디와 번호가 같은 교사의 비밀번호를 새로 정한다. 스쿨멘토 전용이라 위닝에서는 404.

import {
  checkNewPassword,
  PASSWORD_RULE_MESSAGES,
} from "../_lib/console/teacherAccounts.js";
import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import { isValidMobile, normalizePhone } from "../_lib/phoneCode.js";
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
  },
});
