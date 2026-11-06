// POST /api/change-phone  { phone, target? }
//
// 마이페이지 "휴대폰 번호를 변경해요" 플로우(Figma 3973:15330→16090→16297→16478)
// 마지막 단계 — 인증번호 검증까지 끝난 번호를 실제로 profiles.phone 에 반영한다.
//
// target(선택, 기본 'self', 2026-09-03)
//   'guardian'이면 본인 번호가 아니라 profiles.guardian_phone(학부모 번호)을
//   바꾼다 — purpose 'guardian_change'로 인증된 건만 받는다. 'self'(기본)는
//   기존 동작 그대로 profiles.phone을 purpose 'phone_change'로 바꾼다.
//
// 왜 서버 API 인가
//   phone_verifications 는 RLS 전면 거부 + 권한 회수 테이블이다(sql/40_auth_signup.sql
//   [6] 주석 — "이 파일과 라우트만 service_role로 그 테이블에 접근한다"). 클라이언트가
//   supabase.from('profiles').update({ phone }) 을 직접 부르면 인증번호 확인 여부와
//   무관하게 통과된다(profiles RLS 는 본인 행 수정만 확인하지 인증 이력을 보지
//   않는다) — 그래서 "검증된 번호로만 바뀐다"를 강제하려면 이 라우트가 필요하다.
//   ChangeEmailModal 은 Supabase Auth 의 verifyOtp 가 이 검증을 대신 해주지만,
//   휴대폰은 profiles 의 커스텀 컬럼이라 대응하는 Auth 내장 플로우가 없다.
//
// 신뢰 경계
//   본인 확인은 세션 토큰(Authorization) 하나다 — 현재 비밀번호 재확인은
//   ChangePhoneModal.jsx 가 이미 signInWithPassword 로 먼저 해 둔 뒤에만 이
//   엔드포인트를 부른다(자리를 비운 사이 남이 번호를 바꾸는 것을 막는 목적,
//   ChangePasswordModal.jsx 와 동일 근거).

import type { VercelResponse } from "@vercel/node";
import { defineHandler } from "./_lib/handler.js";
import { sendError } from "./_lib/httpResponse.js";
import { isValidMobile, normalizePhone } from "./_lib/phoneCode.js";
import { getBearerToken } from "./_lib/serviceAccess.js";
import { isSchoolmentorSite } from "./_lib/site.js";

export const config = { runtime: "nodejs" };

/** 010-1234-5678 형태로 되돌린다. profiles.phone 은 입력 원문 표기가 섞여 있어 두 표기를 모두 대조한다. */
function toHyphenated(digits: string) {
  if (digits.length === 11)
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return digits;
}

function fail(
  res: VercelResponse,
  status: number,
  reason: string,
  message: string,
) {
  sendError(res, "okDetail", status, message, undefined, { reason });
}

export default defineHandler({
  methods: ["POST"],
  auth: "none",
  errorShape: "okDetail",
  unhandledMessage: "번호 변경 중 오류가 발생했습니다.",
  logLabel: "change-phone",
  handler: async (req, res, ctx) => {
    const rawPhone = String(req.body?.phone || "").trim();
    const normalized = normalizePhone(rawPhone);
    const target: "self" | "guardian" =
      req.body?.target === "guardian" ? "guardian" : "self";

    if (!isValidMobile(normalized)) {
      return fail(
        res,
        400,
        "invalid_phone",
        "휴대폰 번호 형식이 올바르지 않습니다.",
      );
    }

    // 이 라우트는 개별 401 사유마다 문구가 다르다("로그인이 필요합니다." vs
    // "로그인이 만료되었습니다...") — defineHandler auth:"user"는 두 경우 모두
    // 단일 문구로 통일하므로(_lib/handler.ts AUTH_REQUIRED_MESSAGE), 그 문구
    // 손실을 피하기 위해 auth:"none" + _lib/serviceAccess.js의 getBearerToken을
    // 그대로 재사용해 여기서 직접 판정한다(api/docs/batch-3-issues.md 참고).
    const token = getBearerToken(req);
    if (!token) {
      return fail(res, 401, "not_authenticated", "로그인이 필요합니다.");
    }

    try {
      const supabaseAdmin = ctx.supabaseAdmin;

      const { data: userData, error: userError } =
        await supabaseAdmin.auth.getUser(token);
      const userId = userData?.user?.id ?? null;
      if (userError || !userId) {
        return void res.status(401).json({
          ok: false,
          reason: "not_authenticated",
          detail: "로그인이 만료되었습니다. 다시 로그인해 주세요.",
        });
      }

      // 이 번호로 verify-phone-code 를 통과한 가장 최근 미소비 발송 건을 찾는다.
      // send-phone-code.js 와 같은 정규화(digits-only)로 저장돼 있다.
      // target에 따라 요구하는 purpose가 다르다 — self는 'phone_change'(기존
      // 동작), guardian은 'guardian_change'다. 서로 다른 purpose로 인증된
      // 건을 상대 target에 쓸 수 있게 하면, 본인 번호 인증만으로 학부모
      // 번호까지 바꿀 수 있게 되어 원치 않는 번호로 학부모 번호가 바뀐다.
      const purpose =
        target === "guardian" ? "guardian_change" : "phone_change";
      const { data: verification, error: verificationError } =
        await supabaseAdmin
          .from("phone_verifications")
          .select("id, expires_at")
          .eq("phone", normalized)
          .eq("purpose", purpose)
          .not("verified_at", "is", null)
          .is("consumed_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

      if (verificationError) {
        console.error("[change-phone] 인증 이력 조회 실패:", verificationError);
        return void res.status(500).json({
          ok: false,
          reason: "unknown",
          detail: "처리 중 오류가 발생했습니다.",
        });
      }

      if (
        !verification ||
        new Date(verification.expires_at).getTime() < Date.now()
      ) {
        return void res.status(400).json({
          ok: false,
          reason: "not_verified",
          detail: "인증번호 확인을 먼저 완료해 주세요.",
        });
      }

      // 번호 유일 인덱스가 기관별로 바뀌어 DB 는 전역 중복을 더 막지 않는다. 직접 본다:
      // 스쿨멘토는 같은 기관 안(소속 없음은 소속 없는 계정끼리, 인덱스와 같은 기준), 위닝은 전체.
      if (target === "self") {
        let owners = supabaseAdmin
          .from("profiles")
          .select("id")
          .not("member_type", "is", null)
          .or(`phone.eq.${normalized},phone.eq.${toHyphenated(normalized)}`);

        if (isSchoolmentorSite()) {
          const { data: me, error: meError } = await supabaseAdmin
            .from("profiles")
            .select("tenant_id")
            .eq("id", userId)
            .maybeSingle();
          if (meError) throw meError;
          owners = me?.tenant_id
            ? owners.eq("tenant_id", me.tenant_id)
            : owners.is("tenant_id", null);
        }

        const { data: taken, error: takenError } = await owners;
        if (takenError) throw takenError;
        if ((taken ?? []).some((row) => row.id !== userId)) {
          return fail(
            res,
            409,
            "phone_taken",
            "이미 사용 중인 휴대폰 번호입니다.",
          );
        }
      }

      // profiles.phone(또는 guardian_phone) 은 기존 인라인 편집(ProfileTab.jsx)과
      // 같은 표기(사용자 입력 원문)를 그대로 저장한다 — 정규화된 digits-only 로
      // 바꾸면 기존 표시 형식(010-1234-5678)과 갈린다.
      const updateColumn = target === "guardian" ? "guardian_phone" : "phone";
      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({
          [updateColumn]: rawPhone,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (updateError) {
        console.error(
          `[change-phone] profiles.${updateColumn} 갱신 실패:`,
          updateError,
        );
        return void res.status(500).json({
          ok: false,
          reason: "unknown",
          detail: "번호 변경에 실패했습니다.",
        });
      }

      // 소비 처리 — 재사용(같은 인증 건으로 두 번 변경) 방지.
      const { error: consumeError } = await supabaseAdmin
        .from("phone_verifications")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", verification.id);

      if (consumeError) {
        // 번호는 이미 바뀌었다 — 소비 마킹 실패로 사용자에게 실패를 알리면
        // "바뀌었는데 실패라고 뜨는" 혼란을 준다. 로그만 남기고 성공으로 응답한다.
        console.error(
          "[change-phone] phone_verifications 소비 마킹 실패:",
          consumeError,
        );
      }

      return void res.status(200).json({ ok: true, phone: rawPhone, target });
    } catch (error) {
      console.error("[change-phone] 오류:", error);
      return void res.status(500).json({
        ok: false,
        reason: "unknown",
        detail: "번호 변경 중 오류가 발생했습니다.",
      });
    }
  },
});
