// POST /api/find-account-by-phone  { phone }
//
// "아이디(이메일) 찾기" — 휴대폰 인증을 마친 사용자에게 그 번호로 가입된 계정의
// 마스킹된 이메일을 보여준다. 원본 이메일은 응답 어디에도 담지 않는다.
//
// 조회 순서(2026-09-03) — 학생이 본인 명의 휴대폰이 없어 학부모 번호를
// profiles.guardian_phone에 저장하는 경우를 지원한다. ① profiles.phone 매치를
// 먼저 본다(기존 동작) — 있으면 그 결과만 쓴다. ② phone 매치가 하나도 없으면
// guardian_phone 매치 전부를 본다(그 번호를 학부모 번호로 등록한 학생 계정이
// 여러 명일 수 있다 — 형제자매). 응답의 masked_email(첫 건, 하위호환)과
// masked_emails(전체 배열)는 항상 같은 소스(phone 우선, 없으면 guardian_phone)에서
// 나온다 — 두 소스를 섞어 보여주면 "이 번호가 본인 번호로 가입돼 있다"는
// 정보와 "이 번호를 학부모 번호로 등록한 계정이 있다"는 정보가 응답 하나에
// 뒤섞여 오해를 준다.
//
// 인증 필수(로그인 아님, 휴대폰 인증)
//   프론트가 /api/send-phone-code(purpose:'find_account') → /api/verify-phone-code로
//   이 번호가 본인 것임을 이미 증명한 뒤에만 이 라우트를 호출한다. 여기서는 그 인증이
//   실제로 남아 있는지(phone_verifications.verified_at) 서버가 다시 확인하고, 조회가
//   끝나면 consumed_at을 찍어 같은 인증으로 여러 번 조회하지 못하게 한다 — 그렇지
//   않으면 재인증 없이 계정 조회를 무한 반복할 수 있다.
//
// accounts(2026-11-06, 스쿨멘토) — 같은 번호로 소속이 다른 계정이 여러 개일 수 있어
// 아이디(앞 3글자만 보이고 나머지 *, 결정 80)와 소속 이름을 계정마다 같이 준다.
// username이 없는 계정(위닝 이메일 가입)은 가릴 아이디가 없어 넣지 않는다.
//
// 계정 존재 여부를 노출하지 않는 원칙과의 관계
//   다른 라우트들은 "이메일이 이미 가입돼 있다/없다"를 알려주지 않는다(계정 존재
//   추측 방지). 여기서는 그 원칙이 그대로 적용되지 않는다 — 이 번호의 소유권을
//   OTP로 이미 증명한 뒤이기 때문이다. "이 번호로 가입한 계정이 없다"는 답은 그
//   번호를 실제로 가진 사람에게만 의미 있는 정보다.

import { defineHandler } from "./_lib/handler.js";
import { isValidMobile, normalizePhone } from "./_lib/phoneCode.js";

export const config = { runtime: "nodejs" };

// verify-phone-code가 verified_at을 찍은 뒤 이 창 안에서만 조회를 허용한다.
// 인증 화면과 결과 화면 사이의 자연스러운 지연은 허용하되, 인증을 무한정
// 들고 있다가 한참 뒤에 쓰는 것은 막는다.
const VERIFICATION_WINDOW_MS = 10 * 60 * 1000; // 10분

/**
 * 010-1234-5678 형태로 되돌린다. profiles.phone은 입력값을 그대로 저장해서
 * (complete_signup_profile) 하이픈이 섞인 행이 있다 — send-phone-code.ts의
 * 동명 헬퍼와 동일한 이유로 두 표기를 모두 대조한다.
 */
function toHyphenated(digits: string) {
  if (digits.length === 11)
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return digits;
}

/** ab****@gm***.com 형태로 가린다. 원본 이메일은 이 함수를 거친 결과만 응답에 남는다. */
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return "****";

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const domainName = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";

  const maskedLocal =
    local.length <= 2 ? `${local.slice(0, 1)}*` : `${local.slice(0, 2)}****`;
  const maskedDomain =
    domainName.length <= 2
      ? `${domainName.slice(0, 1)}*`
      : `${domainName.slice(0, 2)}***`;

  return `${maskedLocal}@${maskedDomain}${tld}`;
}

/** 앞 3글자만 남기고 나머지를 *로 가린다(결정 80). */
function maskUsername(username: string): string {
  return username.slice(0, 3) + "*".repeat(Math.max(username.length - 3, 0));
}

type ProfileMatch = {
  email: string | null;
  username: string | null;
  tenants: { name: string } | null;
};

export default defineHandler({
  methods: ["POST"],
  auth: "none",
  errorShape: "okDetail",
  unhandledMessage: "계정 조회 중 오류가 발생했습니다.",
  logLabel: "find-account-by-phone",
  handler: async (req, res, ctx) => {
    const phone = normalizePhone(req.body?.phone);

    if (!isValidMobile(phone)) {
      return void res.status(400).json({
        ok: false,
        reason: "invalid_phone",
        detail: "휴대폰 번호 형식이 올바르지 않습니다.",
      });
    }

    try {
      const supabase = ctx.supabaseAdmin;

      // 이 번호로 최근에 통과한 find_account 목적의 인증이 남아 있는지 본다.
      // consumed_at이 이미 찍혀 있으면 그 인증은 다른 조회에 이미 쓰인 것이다.
      const { data: verification, error: verificationError } = await supabase
        .from("phone_verifications")
        .select("id, verified_at")
        .eq("phone", phone)
        .eq("purpose", "find_account")
        .is("consumed_at", null)
        .not("verified_at", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (verificationError) throw verificationError;

      const verifiedAtMs = verification?.verified_at
        ? new Date(verification.verified_at).getTime()
        : 0;

      if (!verification || Date.now() - verifiedAtMs > VERIFICATION_WINDOW_MS) {
        return void res.status(401).json({
          ok: false,
          reason: "phone_not_verified",
          detail: "휴대폰 인증을 먼저 완료해 주세요.",
        });
      }

      // 조회 전에 바로 소비 처리한다 — 아래에서 실패하더라도 같은 인증으로
      // 반복 조회하게 두는 것보다, 새로 인증받게 하는 쪽이 안전하다.
      const { error: consumeError } = await supabase
        .from("phone_verifications")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", verification.id);

      if (consumeError) throw consumeError;

      const hyphenated = toHyphenated(phone);

      const { data: byPhone, error: byPhoneError } = await supabase
        .from("profiles")
        .select("email, username, tenants!profiles_tenant_id_fkey(name)")
        .not("member_type", "is", null)
        .or(`phone.eq.${phone},phone.eq.${hyphenated}`)
        .returns<ProfileMatch[]>();

      if (byPhoneError) throw byPhoneError;

      let matches = byPhone ?? [];
      let via: "phone" | "guardian_phone" = "phone";

      if (matches.length === 0) {
        const { data: byGuardianPhone, error: byGuardianPhoneError } =
          await supabase
            .from("profiles")
            .select("email, username, tenants!profiles_tenant_id_fkey(name)")
            .not("member_type", "is", null)
            .or(`guardian_phone.eq.${phone},guardian_phone.eq.${hyphenated}`)
            .returns<ProfileMatch[]>();

        if (byGuardianPhoneError) throw byGuardianPhoneError;

        matches = byGuardianPhone ?? [];
        via = "guardian_phone";
      }

      const emails = matches
        .map((row) => row.email)
        .filter((email): email is string => Boolean(email));

      if (emails.length === 0) {
        return void res.status(200).json({
          ok: true,
          found: false,
          detail: "해당 번호로 등록된 계정이 없습니다.",
        });
      }

      const maskedEmails = emails.map(maskEmail);

      return void res.status(200).json({
        ok: true,
        found: true,
        masked_email: maskedEmails[0],
        masked_emails: maskedEmails,
        accounts: matches
          .filter((row) => Boolean(row.username))
          .map((row) => ({
            maskedId: maskUsername(row.username as string),
            tenantName: row.tenants?.name ?? null,
          })),
        via,
      });
    } catch (error) {
      console.error("[find-account-by-phone] 오류:", error);

      return void res.status(500).json({
        ok: false,
        reason: "unknown",
        detail: "계정 조회 중 오류가 발생했습니다.",
      });
    }
  },
});
