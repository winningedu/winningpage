// POST /api/verify-phone-code  { phone, code, purpose? }
//
// 인증번호를 검증한다. 검증은 반드시 서버에서 해야 한다 — mockApi.js가 하던
// 것처럼 발송 시점 코드를 클라이언트에 내려주고 프론트에서 비교하면 누구나
// 통과할 수 있다.
//
// 무차별 대입 방어는 해시가 아니라 시도 횟수가 담당한다. 6자리 숫자는 경우의
// 수가 100만뿐이라 해시를 어떻게 걸든 시도를 막지 않으면 뚫린다.
//
// purpose(선택, 2026-09-03)
//   주어지면 대상 인증 행의 purpose와 일치할 때만 통과시킨다 — 같은 번호로
//   동시에 여러 목적(예: 본인 번호 변경과 학부모 번호 변경)의 인증을 진행 중일
//   때 엉뚱한 목적의 코드로 통과되는 것을 막는다. 미제공 시 기존 동작(번호만
//   보고 최신 미소비 건을 대상으로 함)을 그대로 유지한다.

import { defineHandler } from "../_lib/handler.js";
import {
  hashCode,
  isValidMobile,
  MAX_VERIFY_ATTEMPTS,
  normalizePhone,
  safeCompareHash,
} from "../_lib/phoneCode.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "none",
  errorShape: "okDetail",
  unhandledMessage: "인증번호 확인 중 오류가 발생했습니다.",
  logLabel: "verify-phone-code",
  handler: async (req, res, ctx) => {
    const phone = normalizePhone(req.body?.phone);
    const code = String(req.body?.code || "").trim();
    const purpose =
      typeof req.body?.purpose === "string" && req.body.purpose
        ? req.body.purpose
        : undefined;

    if (!isValidMobile(phone)) {
      return void res.status(400).json({
        ok: false,
        reason: "invalid_phone",
        detail: "휴대폰 번호 형식이 올바르지 않습니다.",
      });
    }

    if (!/^[0-9]{6}$/.test(code)) {
      return void res.status(400).json({
        ok: false,
        reason: "invalid_code_format",
        detail: "인증번호 6자리를 입력해 주세요.",
      });
    }

    try {
      const supabase = ctx.supabaseAdmin;

      // 아직 사용되지 않은 가장 최근 발송 건만 대상으로 한다.
      // 재발송했다면 이전 코드는 자동으로 무효가 된다.
      const { data: row, error: selectError } = await supabase
        .from("phone_verifications")
        .select(
          "id, code_hash, attempt_count, expires_at, verified_at, consumed_at, purpose",
        )
        .eq("phone", phone)
        .is("consumed_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (selectError) throw selectError;

      if (!row) {
        return void res.status(400).json({
          ok: false,
          reason: "code_not_found",
          detail: "인증번호를 먼저 요청해 주세요.",
        });
      }

      if (purpose && row.purpose !== purpose) {
        return void res.status(400).json({
          ok: false,
          reason: "purpose_mismatch",
          detail: "인증번호를 먼저 요청해 주세요.",
        });
      }

      if (new Date(row.expires_at).getTime() < Date.now()) {
        return void res.status(400).json({
          ok: false,
          reason: "code_expired",
          detail: "인증번호가 만료되었습니다. 다시 요청해 주세요.",
        });
      }

      if (row.attempt_count >= MAX_VERIFY_ATTEMPTS) {
        return void res.status(429).json({
          ok: false,
          reason: "too_many_attempts",
          detail: "시도 횟수를 초과했습니다. 인증번호를 다시 요청해 주세요.",
        });
      }

      // 비교 전에 시도 횟수를 먼저 올린다. 나중에 올리면 요청을 중단하는 방식으로
      // 카운트를 회피하면서 무제한으로 대입할 수 있다.
      const { error: bumpError } = await supabase
        .from("phone_verifications")
        .update({ attempt_count: row.attempt_count + 1 })
        .eq("id", row.id);

      if (bumpError) throw bumpError;

      if (!safeCompareHash(row.code_hash, hashCode(phone, code))) {
        return void res.status(400).json({
          ok: false,
          reason: "code_mismatch",
          remaining_attempts: Math.max(
            0,
            MAX_VERIFY_ATTEMPTS - (row.attempt_count + 1),
          ),
          detail: "인증번호가 일치하지 않습니다.",
        });
      }

      // verified_at만 찍는다. consumed_at은 실제 가입 완료 시점에 찍어야
      // "인증은 했지만 가입은 안 한" 상태를 구분할 수 있다.
      const { error: updateError } = await supabase
        .from("phone_verifications")
        .update({ verified_at: new Date().toISOString() })
        .eq("id", row.id);

      if (updateError) throw updateError;

      return void res.status(200).json({ ok: true, verified: true });
    } catch (error) {
      console.error("[verify-phone-code] 오류:", error);

      return void res.status(500).json({
        ok: false,
        reason: "unknown",
        detail: "인증번호 확인 중 오류가 발생했습니다.",
      });
    }
  },
});
