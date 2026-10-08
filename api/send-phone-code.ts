// POST /api/send-phone-code  { phone, purpose? }
//
// 휴대폰 인증번호를 발송하고 해시만 DB에 남긴다. 평문 코드는 어디에도 저장하지
// 않으며 응답에도 포함하지 않는다.
//
// 인증이 필요 없는(로그인 전) 엔드포인트다. 학부모 가입은 계정을 만들기 전에
// 휴대폰 인증을 하기 때문이다. 대신 실제 요금이 나가는 API이므로 한도를
// 4겹으로 건다 — 번호별 쿨타임/시간당/일일, IP별, 전역 일일 상한.
// (api/_lib/phoneCode.js checkSendLimits)
//
// 인증 성공 사실은 가입 RPC가 다시 확인한다(sql/40_auth_signup.sql [14]/[15] —
// phone_verifications.verified_at 조회 후 consumed_at으로 소비). 그래서 이 단계를
// 건너뛰고 가입을 완료할 수는 없다.
//
// 가입 목적 발송은 이미 가입에 쓰인 번호를 먼저 걸러낸다(reason:'phone_taken').
// 최종 판정은 아니다 — 동시 가입 경합은 profiles의 unique 인덱스와 가입 RPC의
// duplicate_phone이 잡는다.

import type { VercelResponse } from "@vercel/node";
import { defineHandler } from "./_lib/handler.js";
import { sendError } from "./_lib/httpResponse.js";
import {
  getChannel,
  isDryRun,
  sendVerificationCode,
} from "./_lib/messaging/aligo.js";
import {
  CODE_TTL_SECONDS,
  COOLDOWN_SECONDS,
  checkSendLimits,
  generateCode,
  getClientIp,
  hashCode,
  isValidMobile,
  maskPhone,
  normalizePhone,
} from "./_lib/phoneCode.js";
import type { createSupabaseAdmin } from "./_lib/supabaseAdmin.js";

// Fixie 프록시(undici ProxyAgent)를 쓰므로 Edge 런타임에서는 동작하지 않는다.
export const config = { runtime: "nodejs" };

const ALLOWED_PURPOSES = [
  "signup",
  "parent_signup",
  "phone_change",
  "mentor_apply",
  // 아이디(이메일) 찾기(QA 지시 2026-08-21) — /api/find-account-by-phone이
  // 이 purpose로 인증된 요청만 받는다. 계정이 '있어야' 정상 시나리오라
  // SIGNUP_PURPOSES에는 넣지 않는다(중복 번호 차단 대상 아님).
  "find_account",
  // 비밀번호 찾기의 휴대폰 인증 경로(QA 시트 147·209행, 2026-09-02) —
  // /api/reset-password-by-phone이 이 purpose로 인증된 요청만 받는다.
  // find_account와 같은 이유로 SIGNUP_PURPOSES에 넣지 않는다.
  "reset_password",
  // 학생이 본인 명의 휴대폰이 없어 학부모 번호를 profiles.guardian_phone에
  // 저장하는 가입 경로(2026-09-03) — 학부모 번호도 SMS 인증한다. 학부모 본인은
  // 이미 다른 계정으로 가입돼 있을 수 있는 게 정상 시나리오라 SIGNUP_PURPOSES에는
  // 넣지 않는다(phone_taken 중복 차단 대상이 아니다 — find_account/reset_password와
  // 같은 이유).
  "guardian_signup",
  // 마이페이지에서 학부모 번호(guardian_phone)를 바꾸는 경로(2026-09-03) —
  // phone_change와 동일하게 로그인한 본인의 기존 학부모 번호가 자기 자신과
  // 중복으로 잡힐 수 있어 SIGNUP_PURPOSES에 넣지 않는다.
  "guardian_change",
];

// 가입 목적의 발송만 중복 번호를 막는다. 'phone_change'는 로그인한 본인의 번호가
// 자기 자신과 중복으로 잡히는데, 이 엔드포인트는 인증이 없어서 본인을 구분할 수 없다.
// 'mentor_apply'(멘토 지원서 본인인증)도 여기 넣으면 안 된다 — 지원은 비회원 기준이지만
// 이미 위닝에듀 회원인 대학생이 지원하는 경우가 정상 시나리오이고, 넣는 순간 그 번호가
// isPhoneTaken에 걸려 409 'phone_taken'으로 거절돼 지원 자체가 막힌다.
const SIGNUP_PURPOSES = ["signup", "parent_signup"];

/**
 * 010-1234-5678 형태로 되돌린다.
 *
 * profiles.phone은 입력값을 그대로 저장해서(complete_signup_profile) 하이픈이 섞인
 * 행이 있다. 조회는 숫자만으로 하고 싶지만 PostgREST에서 정규화 함수를 쓸 수 없어
 * 두 표기를 모두 대조한다.
 */
function toHyphenated(digits: string) {
  if (digits.length === 11)
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return digits;
}

/**
 * 이미 가입이 끝난 계정이 쓰고 있는 번호인지 본다.
 *
 * member_type이 채워진 행만 센다. 이메일 인증만 하고 이탈한 계정은 트리거가
 * profiles 행을 미리 만들어두지만 아직 번호가 없고, 있더라도 가입이 끝난 게
 * 아니다(sql/40_auth_signup.sql [9]와 같은 판정 기준).
 */
async function isPhoneTaken(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  phone: string,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .not("member_type", "is", null)
    .or(`phone.eq.${phone},phone.eq.${toHyphenated(phone)}`)
    .limit(1);

  // 조회가 실패했다고 발송까지 막으면 장애가 가입 전면 중단으로 번진다.
  // 최종 방어선은 DB의 unique 인덱스와 가입 RPC(duplicate_phone)다.
  if (error) {
    console.error("[send-phone-code] 번호 중복 조회 실패:", error);
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}

const LIMIT_MESSAGES = {
  cooldown: "잠시 후에 다시 시도해 주세요.",
  hourly_limit: "인증번호 요청이 많습니다. 1시간 후에 다시 시도해 주세요.",
  daily_limit: "오늘 요청 가능한 횟수를 초과했습니다. 내일 다시 시도해 주세요.",
  ip_hourly_limit: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
  ip_daily_limit: "요청이 많습니다. 내일 다시 시도해 주세요.",
  service_daily_limit:
    "일시적으로 인증번호 발송이 어렵습니다. 고객센터로 문의해 주세요.",
};

function fail(
  res: VercelResponse,
  status: number,
  reason: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  sendError(res, "okDetail", status, message, undefined, { reason, ...extra });
}

export default defineHandler({
  methods: ["POST"],
  auth: "none",
  errorShape: "okDetail",
  unhandledMessage: "인증번호 발송 중 오류가 발생했습니다.",
  logLabel: "send-phone-code",
  handler: async (req, res, ctx) => {
    const phone = normalizePhone(req.body?.phone);
    const purpose: string = ALLOWED_PURPOSES.includes(req.body?.purpose)
      ? req.body.purpose
      : "signup";

    if (!isValidMobile(phone)) {
      return fail(
        res,
        400,
        "invalid_phone",
        "휴대폰 번호 형식이 올바르지 않습니다.",
      );
    }

    const ip = getClientIp(req);

    try {
      const supabase = ctx.supabaseAdmin;

      // 한도 검사보다 먼저 본다. 어차피 가입할 수 없는 번호에 문자 요금과
      // 쿨타임을 쓸 이유가 없다.
      if (
        SIGNUP_PURPOSES.includes(purpose) &&
        (await isPhoneTaken(supabase, phone))
      ) {
        return void res.status(409).json({
          ok: false,
          reason: "phone_taken",
          detail: "중복된 전화번호입니다.",
        });
      }

      const limit = await checkSendLimits(supabase, { phone, ip });

      if (!limit.allowed) {
        // Retry-After는 초 단위 표준 헤더다. 프론트가 쿨타임 표시에 쓸 수 있다.
        res.setHeader(
          "Retry-After",
          String(limit.retryAfter || COOLDOWN_SECONDS),
        );

        return void res.status(429).json({
          ok: false,
          reason: limit.reason,
          retry_after: limit.retryAfter || COOLDOWN_SECONDS,
          detail:
            LIMIT_MESSAGES[limit.reason!] || "잠시 후에 다시 시도해 주세요.",
        });
      }

      const code = generateCode();
      const expiresAt = new Date(
        Date.now() + CODE_TTL_SECONDS * 1000,
      ).toISOString();

      // 발송을 먼저 시도한다. 저장부터 하면 발송이 실패했을 때 쿨타임만 소모된다.
      const result = await sendVerificationCode({ phone, code });

      if (!result.ok) {
        console.error(
          `[send-phone-code] 발송 실패 ${maskPhone(phone)} channel=${result.channel} ` +
            `code=${result.providerCode} message=${result.providerMessage}`,
        );

        return void res.status(502).json({
          ok: false,
          reason: "send_failed",
          detail: "인증번호 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        });
      }

      const { error: insertError } = await supabase
        .from("phone_verifications")
        .insert({
          phone,
          code_hash: hashCode(phone, code),
          purpose,
          expires_at: expiresAt,
          request_ip: ip,
        });

      if (insertError) {
        // 문자는 이미 나갔는데 기록이 안 된 상태다. 사용자는 코드를 받았지만
        // 검증할 수 없으므로 재발송을 유도한다.
        console.error("[send-phone-code] 인증 기록 저장 실패:", insertError);

        return void res.status(500).json({
          ok: false,
          reason: "store_failed",
          detail: "인증번호 처리 중 문제가 발생했습니다. 다시 시도해 주세요.",
        });
      }

      return void res.status(200).json({
        ok: true,
        expires_in: CODE_TTL_SECONDS,
        cooldown: COOLDOWN_SECONDS,
        // 운영에서는 항상 false여야 한다. true면 문자가 실제로 안 나간 것이다.
        dry_run: Boolean(result.dryRun),
        channel: getChannel(),
      });
    } catch (error) {
      console.error("[send-phone-code] 오류:", error);

      // 설정 누락(프록시·키·시크릿)은 개발자가 봐야 할 오류라 구분해 남긴다.
      const isConfigError =
        /환경변수|FIXIE_URL|PHONE_CODE_SECRET/.test(
          String(error?.message || ""),
        ) && !isDryRun();

      return void res.status(500).json({
        ok: false,
        reason: isConfigError ? "server_misconfigured" : "unknown",
        detail: "인증번호 발송 중 오류가 발생했습니다.",
      });
    }
  },
});
