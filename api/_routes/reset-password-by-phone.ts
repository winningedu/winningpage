// POST /api/reset-password-by-phone  { phone, accountId?, password }
//
// "비밀번호 찾기"의 휴대폰 인증 경로 — QA 시트 147·209행(2026-08-21 지시,
// 2026-09-02 재확인). 이메일 링크 재설정(FindPassword.tsx → Supabase
// resetPasswordForEmail)과 별개로, 휴대폰 인증만으로 회원이 정한 새
// 비밀번호로 바꾼다.
//
// 인증 필수(로그인 아님, 휴대폰 인증) — find-account-by-phone.ts와 동일 골격
//   프론트가 /api/send-phone-code(purpose:'reset_password') →
//   /api/verify-phone-code로 번호 소유를 이미 증명한 뒤에만 이 라우트를
//   호출한다. 여기서 phone_verifications.verified_at을 다시 확인하고,
//   처리 직후 consumed_at을 찍어 같은 인증으로 재설정을 반복하지 못하게
//   한다 — 그렇지 않으면 재인증 없이 비밀번호를 계속 바꿀 수 있다.
//
// 새 비밀번호(2026-11-09 스쿨멘토 사 #96, 위닝에듀도 같은 경로): 임시비밀번호를 만들지도 돌려주지도
// 않는다. 본문의 password(학생 비밀번호 규칙)를 DB 를 읽기 전에 검증하고, 인증 선점 뒤 그 값으로
// 비밀번호를 바꾼 다음 모든 세션을 끊고 로그인 잠금을 푼다.
//
// 계정 존재 여부를 노출하지 않는 원칙과의 관계
//   find-account-by-phone.ts와 같은 이유로 예외다 — OTP로 번호 소유를
//   이미 증명했으므로 "이 번호로 가입한 계정이 없다"는 응답이 안전하다.
//
// 계정 고르기(2026-11-06, 스쿨멘토) — 소속이 다르면 같은 번호로 계정을 따로 만들 수
// 있어서(결정 r8) "가장 먼저 가입한 계정" 규칙이 맞지 않는다.
// profiles.phone 매치가 1건이면 accountId 없이 진행하고, 2건 이상이고 accountId가 없으면
// 409 { code:'choose_account', accounts:[{ accountId, maskedId, tenantName }] }를 주고
// (maskedId는 가린 이메일, 선생님만 가린 로그인 아이디)
// 인증은 소비하지 않는다. accountId는 이 번호의 매치 목록 안에 있어야 한다(아니면 400,
// 남의 계정 비밀번호를 id만 알아서 바꾸지 못하게).
//
// guardian_phone 경로(2026-09-03)
//   ① profiles.phone 매치를 먼저 본다(기존 동작) — 있으면 그 결과만 쓴다.
//   ② phone 매치가 없으면 guardian_phone 매치를 본다(학생이 본인 명의
//   휴대폰이 없어 학부모 번호로 가입한 경우). 이때는 "가장 오래된 것 하나"를
//   임의로 골라 비밀번호를 바꾸지 않는다 — 형제자매가 같은 학부모 번호로
//   가입해 있을 수 있는데, 그중 한 명이 다른 형제의 비밀번호를 자기 명의
//   인증만으로 바꿀 수 있게 되면 계정 탈취가 된다. guardian_phone 매치가
//   정확히 1건일 때만 진행하고, 2건 이상이면 발급 없이 409로 이메일 재설정을
//   안내한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createLoginAuthClient } from "../_lib/auth/login.js";
import { defineHandler } from "../_lib/handler.js";
import {
  getClientIp,
  isValidMobile,
  normalizePhone,
} from "../_lib/phoneCode.js";
import {
  isPwnedAuthError,
  PWNED_PASSWORD_MESSAGE,
} from "../_lib/pwnedPassword.js";
import { isValidPassword } from "../_lib/signup/schoolStudent.js";

export const config = { runtime: "nodejs" };

// verify-phone-code가 verified_at을 찍은 뒤 이 창 안에서만 재설정을 허용한다.
// find-account-by-phone.ts와 동일 값·동일 이유(인증 화면과 결과 화면 사이의
// 자연스러운 지연은 허용하되, 인증을 무한정 들고 있다가 한참 뒤에 쓰는 것은
// 막는다).
const VERIFICATION_WINDOW_MS = 10 * 60 * 1000; // 10분

/**
 * 010-1234-5678 형태로 되돌린다. profiles.phone은 입력값을 그대로 저장해서
 * (complete_signup_profile) 하이픈이 섞인 행이 있다 — send-phone-code.ts·
 * find-account-by-phone.ts의 동명 헬퍼와 동일한 이유로 두 표기를 모두 대조한다.
 */
function toHyphenated(digits: string) {
  if (digits.length === 11)
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return digits;
}

/** ab****@gm***.com 형태로 가린다. find-account-by-phone.ts의 동명 헬퍼와 동일. */
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

type MatchedAccount = { id: string; email: string };

/**
 * 이 번호를 guardian_phone으로 등록한 계정을 전부 찾는다(2026-09-03).
 * 학생이 본인 명의 휴대폰이 없어 학부모 번호로 가입한 경우를 위한 경로다.
 * 형제자매가 같은 학부모 번호로 각자 가입해 있을 수 있어 "가장 오래된 것"을
 * 임의로 고르지 않고 전부 반환한다 — 정확히 1건일 때만 핸들러가 진행한다.
 */
async function findAccountsByGuardianPhone(
  supabase: SupabaseClient,
  phone: string,
): Promise<MatchedAccount[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email")
    .not("member_type", "is", null)
    .or(`guardian_phone.eq.${phone},guardian_phone.eq.${toHyphenated(phone)}`);

  if (error) throw error;
  return (data ?? []).filter((row): row is MatchedAccount =>
    Boolean(row.email),
  );
}

type ChooseCandidate = MatchedAccount & {
  username: string | null;
  memberType: string | null;
  tenantName: string | null;
};

/** 이 번호(profiles.phone)로 가입이 끝난 계정 전부. 계정 고르기용이라 아이디와 소속도 함께 읽는다. */
async function findAllAccountsByPhone(
  supabase: SupabaseClient,
  phone: string,
): Promise<ChooseCandidate[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, email, username, member_type, tenants!profiles_tenant_id_fkey(name)",
    )
    .not("member_type", "is", null)
    .or(`phone.eq.${phone},phone.eq.${toHyphenated(phone)}`)
    .order("created_at", { ascending: true })
    .returns<
      {
        id: string;
        email: string | null;
        username: string | null;
        member_type: string | null;
        tenants: { name: string } | null;
      }[]
    >();

  if (error) throw error;
  return (data ?? [])
    .filter((row) => Boolean(row.email))
    .map((row) => ({
      id: row.id,
      email: row.email as string,
      username: row.username,
      memberType: row.member_type,
      tenantName: row.tenants?.name ?? null,
    }));
}

/** 앞 3글자만 남기고 나머지를 *로 가린다(find-account-by-phone.ts의 동명 헬퍼와 동일, 결정 80). */
function maskUsername(username: string): string {
  return username.slice(0, 3) + "*".repeat(Math.max(username.length - 3, 0));
}

export type ResetTarget =
  | { kind: "none" }
  | { kind: "multiple"; accounts: MatchedAccount[] }
  | {
      kind: "single";
      account: MatchedAccount;
      via: "phone" | "guardian_phone";
    };

/**
 * phone/guardian_phone 두 조회 결과를 보고 이 요청을 어떻게 처리할지 정한다.
 * I/O가 없는 순수 함수라 로컬에서 바로 검증할 수 있다(이 파일의 다른 헬퍼와
 * 동일 방침 — 상단 주석 참고).
 *
 * phone 매치가 있으면 그것으로 확정한다(guardian_phone은 보지도 않는다).
 * phone 매치가 없고 guardian_phone 매치가 2건 이상이면 "multiple" —
 * 형제자매가 같은 학부모 번호로 가입해 있을 수 있어 임의로 하나를 고르면
 * 계정 탈취가 된다.
 */
export function resolveResetTarget(
  phoneAccount: MatchedAccount | null,
  guardianAccounts: MatchedAccount[],
): ResetTarget {
  if (phoneAccount)
    return { kind: "single", account: phoneAccount, via: "phone" };
  if (guardianAccounts.length > 1)
    return { kind: "multiple", accounts: guardianAccounts };
  if (guardianAccounts.length === 1)
    return {
      kind: "single",
      account: guardianAccounts[0]!,
      via: "guardian_phone",
    };
  return { kind: "none" };
}

export default defineHandler({
  methods: ["POST"],
  auth: "none",
  errorShape: "okDetail",
  headers: { "Cache-Control": "no-store" },
  unhandledMessage: "비밀번호 재설정 중 오류가 발생했습니다.",
  logLabel: "reset-password-by-phone",
  handler: async (req, res, ctx) => {
    const phone = normalizePhone(req.body?.phone);

    if (!isValidMobile(phone)) {
      return void res.status(400).json({
        ok: false,
        reason: "invalid_phone",
        detail: "휴대폰 번호 형식이 올바르지 않습니다.",
      });
    }

    // 회원이 정한 새 비밀번호를 받는다. DB 를 읽기 전에 검증한다.
    const newPassword: unknown = req.body?.password;
    if (typeof newPassword !== "string" || !isValidPassword(newPassword)) {
      return void res.status(400).json({
        ok: false,
        reason: "invalid_password",
        detail: "영문, 숫자, 특수문자를 모두 포함해 6자 이상 입력해 주세요.",
      });
    }

    try {
      const supabase = ctx.supabaseAdmin;

      // 이 번호로 최근에 통과한 reset_password 목적의 인증이 남아 있는지 본다.
      // find-account-by-phone.ts와 동일 판정(consumed_at이 이미 찍혀 있으면
      // 그 인증은 다른 요청에 이미 쓰인 것).
      const { data: verification, error: verificationError } = await supabase
        .from("phone_verifications")
        .select("id, verified_at")
        .eq("phone", phone)
        .eq("purpose", "reset_password")
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

      // 소비(consumed_at)는 재설정을 시도하기 직전에(아래 선점) 찍는다 — guardian_phone 다중 매치로 409를 돌려줄 때도 이
      // 인증을 태워버리면 사용자가 이메일 재설정으로 안내받은 뒤에도 다시
      // SMS 인증부터 반복해야 한다. 계정을 찾지 못했을 때(found:false)도
      // 마찬가지로 소비하지 않는다 — 재설정이 실제로 일어나지 않았다.
      const accountId =
        typeof req.body?.accountId === "string" ? req.body.accountId : null;
      const candidates = await findAllAccountsByPhone(supabase, phone);

      if (candidates.length >= 2 && !accountId) {
        return void res.status(409).json({
          ok: false,
          code: "choose_account",
          accounts: candidates.map((c) => ({
            accountId: c.id,
            maskedId:
              c.memberType === "teacher" && c.username
                ? maskUsername(c.username)
                : maskEmail(c.email),
            tenantName: c.tenantName,
          })),
          detail: "이 번호로 가입한 계정이 여러 개예요. 계정을 골라 주세요.",
        });
      }

      if (accountId && !candidates.some((c) => c.id === accountId)) {
        return void res.status(400).json({
          ok: false,
          reason: "account_not_found",
          detail: "선택한 계정을 찾을 수 없습니다.",
        });
      }

      const phoneAccount = accountId
        ? (candidates.find((c) => c.id === accountId) ?? null)
        : (candidates[0] ?? null);
      const guardianAccounts = phoneAccount
        ? []
        : await findAccountsByGuardianPhone(supabase, phone);
      const target = resolveResetTarget(phoneAccount, guardianAccounts);

      if (target.kind === "multiple") {
        return void res.status(409).json({
          ok: false,
          reason: "multiple_accounts",
          masked_emails: target.accounts.map((m) => maskEmail(m.email)),
          detail:
            "학부모 번호로 여러 계정이 등록돼 있습니다. 이메일로 비밀번호를 재설정해 주세요.",
        });
      }

      if (target.kind === "none") {
        return void res.status(200).json({
          ok: true,
          found: false,
          detail: "해당 번호로 등록된 계정이 없습니다.",
        });
      }

      const { account, via } = target;

      // 인증을 조건부 UPDATE 한 번으로 선점한다(consumed_at 이 null 인 행만). 동시에 들어온
      // 요청 중 하나만 통과하고, 못 얻으면 이미 다른 요청이 쓴 인증이다.
      const { data: claimed, error: claimError } = await supabase
        .from("phone_verifications")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", verification.id)
        .is("consumed_at", null)
        .select("id");

      if (claimError) throw claimError;

      if (!claimed || claimed.length === 0) {
        return void res.status(401).json({
          ok: false,
          reason: "phone_not_verified",
          detail: "휴대폰 인증을 먼저 완료해 주세요.",
        });
      }

      const { error: updateError } = await supabase.auth.admin.updateUserById(
        account.id,
        { password: newPassword },
      );

      if (updateError) {
        console.error(
          "[reset-password-by-phone] 비밀번호 갱신 실패:",
          updateError,
        );
        // 재설정이 일어나지 않았으니 선점한 인증을 되돌려 다시 시도할 수 있게 한다.
        const { error: releaseError } = await supabase
          .from("phone_verifications")
          .update({ consumed_at: null })
          .eq("id", verification.id);
        if (releaseError) {
          console.error(
            "[reset-password-by-phone] phone_verifications 선점 해제 실패:",
            releaseError,
          );
        }
        // 정한 비밀번호가 유출 목록에 있으면 다른 비밀번호를 고르게 한다(인증은 위에서 풀었다).
        if (isPwnedAuthError(updateError)) {
          return void res.status(400).json({
            ok: false,
            reason: "password_pwned",
            detail: PWNED_PASSWORD_MESSAGE,
          });
        }
        return void res.status(500).json({
          ok: false,
          reason: "update_failed",
          detail: "비밀번호 재설정에 실패했습니다. 다시 시도해 주세요.",
        });
      }

      // 로그인과 같은 주소다. attemptLogin 이 fn_login_resolve_email 로 profiles.email 을 읽어 소문자와 공백 제거로 다룬다.
      const authEmail = account.email.trim().toLowerCase();

      // 이전 기기 세션을 모두 끝낸다(auth/teacher-reset-password.ts 와 같은 방식). 새 비밀번호로 만든 확인용 세션도
      // 함께 끝내므로 응답에 세션을 싣지 않는다. 실패해도 비밀번호는 이미 바뀌었으니 되돌리지 않고 인증 선점도
      // 풀지 않는다(같은 요청을 다시 보내도 소용없다).
      const { data: signed, error: signInError } = await createLoginAuthClient(
        getClientIp(req),
      ).auth.signInWithPassword({ email: authEmail, password: newPassword });
      let revoked = false;
      if (!signInError && signed?.session) {
        const { error: signOutError } = await supabase.auth.admin.signOut(
          signed.session.access_token,
          "global",
        );
        revoked = !signOutError;
      }
      if (!revoked) {
        console.error("[reset-password-by-phone] 세션 정리 실패");
        console.info("[reset-password-by-phone] reset", {
          profileId: account.id,
          via,
          outcome: "revoke_failed",
        });
        return void res.status(500).json({
          ok: false,
          reason: "revoke_failed",
          detail:
            "비밀번호는 바뀌었어요. 다른 기기의 로그인은 끊지 못했으니 새 비밀번호로 로그인한 뒤 마이페이지에서 비밀번호를 한 번 더 바꿔 주세요.",
        });
      }

      // 로그인 잠금 행은 auth.users 비밀번호 변경 트리거(login_attempts_clear_on_password_change)가 지운다.

      console.info("[reset-password-by-phone] reset", {
        profileId: account.id,
        via,
        outcome: "ok",
      });

      return void res.status(200).json({
        ok: true,
        found: true,
        masked_email: maskEmail(account.email),
        via,
      });
    } catch (error) {
      console.error("[reset-password-by-phone] 오류:", error);

      return void res.status(500).json({
        ok: false,
        reason: "unknown",
        detail: "비밀번호 재설정 중 오류가 발생했습니다.",
      });
    }
  },
});
