// POST /api/reset-password-by-phone  { phone, chooseAccount?, accountId? }
//
// "비밀번호 찾기"의 휴대폰 인증 경로 — QA 시트 147·209행(2026-08-21 지시,
// 2026-09-02 재확인). 이메일 링크 재설정(FindPassword.tsx → Supabase
// resetPasswordForEmail)과 별개로, 휴대폰 인증만으로 새 임시비밀번호를
// 즉시 발급한다.
//
// 인증 필수(로그인 아님, 휴대폰 인증) — find-account-by-phone.ts와 동일 골격
//   프론트가 /api/send-phone-code(purpose:'reset_password') →
//   /api/verify-phone-code로 번호 소유를 이미 증명한 뒤에만 이 라우트를
//   호출한다. 여기서 phone_verifications.verified_at을 다시 확인하고,
//   처리 직후 consumed_at을 찍어 같은 인증으로 재설정을 반복하지 못하게
//   한다 — 그렇지 않으면 재인증 없이 비밀번호를 계속 새로 발급할 수 있다.
//
// 계정 존재 여부를 노출하지 않는 원칙과의 관계
//   find-account-by-phone.ts와 같은 이유로 예외다 — OTP로 번호 소유를
//   이미 증명했으므로 "이 번호로 가입한 계정이 없다"는 응답이 안전하다.
//
// 같은 번호에 계정이 여러 개(학생·학부모 각각 가입)인 경우
//   목록을 보여주고 고르게 하는 흐름은 이 화면(임시비밀번호 1회 노출)에는
//   과하다고 판단해, 그 번호로 가장 먼저 가입한(= created_at 오름차순 1위)
//   계정 하나만 재설정한다. 어느 계정인지는 응답의 masked_email로 알려준다.
//
// 계정 고르기(2026-11-06, 스쿨멘토) — 소속이 다르면 같은 번호로 계정을 따로 만들 수
// 있어서(결정 r8) 위의 "가장 먼저 가입한 계정" 규칙이 맞지 않는다. 스쿨멘토 화면은
// chooseAccount:true를 보낸다. profiles.phone 매치가 2건 이상이고 accountId가 없으면
// 409 { code:'choose_account', accounts:[{ accountId, maskedId, tenantName }] }를 주고
// 인증은 소비하지 않는다. accountId는 이 번호의 매치 목록 안에 있어야 한다(아니면 400,
// 남의 계정 비밀번호를 id만 알아서 바꾸지 못하게). 위닝은 새 필드를 보내지 않는다.
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

import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { defineHandler } from "./_lib/handler.js";
import { isValidMobile, normalizePhone } from "./_lib/phoneCode.js";

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

// 혼동되는 문자(0/O, 1/l/I)를 뺀 문자셋. 사람이 화면에서 옮겨 적을 때 실수를
// 줄인다.
const LOWER = "abcdefghjkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SPECIAL = "!@#$%^&*";
const ALL_CHARS = LOWER + UPPER + DIGITS + SPECIAL;
const TEMP_PASSWORD_LENGTH = 8;

function pickChar(charset: string): string {
  return charset[crypto.randomInt(charset.length)]!;
}

/** Fisher-Yates. crypto.randomInt를 써서 순서 자체도 예측 불가능하게 섞는다. */
function secureShuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/**
 * 임시비밀번호를 생성한다.
 *
 * QA 지시는 "6자리 특수/숫자/영문"이지만 ResetPassword.tsx의 PASSWORD_REGEX가
 * 영문+숫자+특수 6자 이상을 요구하므로 6자리는 여유가 없다 — 8자로 발급해
 * 규칙에 항상 여유 있게 맞춘다. 영문 대/소문자·숫자·특수문자를 각 1자 이상
 * 강제로 넣고 나머지를 무작위로 채운 뒤 전체를 다시 섞는다(앞 4자리 패턴이
 * 항상 "소대숫특"으로 고정되는 것을 막기 위함).
 */
export function generateTempPassword(): string {
  const required = [
    pickChar(LOWER),
    pickChar(UPPER),
    pickChar(DIGITS),
    pickChar(SPECIAL),
  ];

  const rest = Array.from(
    { length: TEMP_PASSWORD_LENGTH - required.length },
    () => pickChar(ALL_CHARS),
  );

  return secureShuffle([...required, ...rest]).join("");
}

type MatchedAccount = { id: string; email: string };

/**
 * 이 번호로 가입이 끝난 계정 중 가장 먼저 만들어진 것 하나만 고른다.
 * find-account-by-phone.ts의 조회 조건(member_type 존재, 두 표기 대조)과
 * 동일하되, 여러 건일 때의 우선순위(created_at 오름차순)만 추가한다.
 */
async function findOldestAccountByPhone(
  supabase: SupabaseClient,
  phone: string,
): Promise<MatchedAccount | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email")
    .not("member_type", "is", null)
    .or(`phone.eq.${phone},phone.eq.${toHyphenated(phone)}`)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.email) return null;
  return { id: data.id, email: data.email };
}

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
  tenantName: string | null;
};

/** 이 번호(profiles.phone)로 가입이 끝난 계정 전부. 계정 고르기용이라 아이디와 소속도 함께 읽는다. */
async function findAllAccountsByPhone(
  supabase: SupabaseClient,
  phone: string,
): Promise<ChooseCandidate[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, username, tenants!profiles_tenant_id_fkey(name)")
    .not("member_type", "is", null)
    .or(`phone.eq.${phone},phone.eq.${toHyphenated(phone)}`)
    .order("created_at", { ascending: true })
    .returns<
      {
        id: string;
        email: string | null;
        username: string | null;
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

      // 소비(consumed_at)는 실제 재설정이 성공한 뒤에만 찍는다(2026-09-03,
      // 아래로 이동) — guardian_phone 다중 매치로 409를 돌려줄 때도 이
      // 인증을 태워버리면 사용자가 이메일 재설정으로 안내받은 뒤에도 다시
      // SMS 인증부터 반복해야 한다. 계정을 찾지 못했을 때(found:false)도
      // 마찬가지로 소비하지 않는다 — 재설정이 실제로 일어나지 않았다.
      const chooseAccount = req.body?.chooseAccount === true;
      const accountId =
        typeof req.body?.accountId === "string" ? req.body.accountId : null;
      const candidates = chooseAccount
        ? await findAllAccountsByPhone(supabase, phone)
        : [];

      if (chooseAccount && candidates.length >= 2 && !accountId) {
        return void res.status(409).json({
          ok: false,
          code: "choose_account",
          accounts: candidates.map((c) => ({
            accountId: c.id,
            maskedId: c.username
              ? maskUsername(c.username)
              : maskEmail(c.email),
            tenantName: c.tenantName,
          })),
          detail: "이 번호로 가입한 계정이 여러 개예요. 계정을 골라 주세요.",
        });
      }

      if (chooseAccount && accountId) {
        if (!candidates.some((c) => c.id === accountId)) {
          return void res.status(400).json({
            ok: false,
            reason: "account_not_found",
            detail: "선택한 계정을 찾을 수 없습니다.",
          });
        }
      }

      const chosen = accountId
        ? candidates.find((c) => c.id === accountId)
        : undefined;
      const phoneAccount =
        chosen ?? (await findOldestAccountByPhone(supabase, phone));
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

      const tempPassword = generateTempPassword();

      const { error: updateError } = await supabase.auth.admin.updateUserById(
        account.id,
        { password: tempPassword },
      );

      if (updateError) {
        console.error(
          "[reset-password-by-phone] 비밀번호 갱신 실패:",
          updateError,
        );
        return void res.status(500).json({
          ok: false,
          reason: "update_failed",
          detail: "비밀번호 재설정에 실패했습니다. 다시 시도해 주세요.",
        });
      }

      // 재설정이 실제로 성공했다 — 이제 인증을 소비 처리한다. 여기서 실패해도
      // 비밀번호는 이미 바뀌었으므로 사용자에게는 성공으로 응답한다
      // (change-phone.ts의 동일 방침과 같다).
      const { error: consumeError } = await supabase
        .from("phone_verifications")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", verification.id);

      if (consumeError) {
        console.error(
          "[reset-password-by-phone] phone_verifications 소비 마킹 실패:",
          consumeError,
        );
      }

      // 기존 로그인 세션 강제 로그아웃 — 시도하지 않는다.
      // supabase-js(@supabase/supabase-js@2.110.0/@supabase/auth-js)의
      // admin.signOut(jwt, scope)은 "특정 세션의 access token(jwt)"을 받아
      // 그 세션 하나를 무효화하는 API다. userId로 그 사용자의 전체 세션을
      // 무효화하는 admin 엔드포인트가 없어(2026-09-02 기준) 여기서는 호출하지
      // 않는다 — 기존 세션이 있다면 새 임시비밀번호 발급 후에도 그 세션은
      // 계속 유효하다(계정 소유자 본인이 OTP로 인증한 뒤라는 전제하의 알려진
      // 제약, 완료 보고에 명시).

      return void res.status(200).json({
        ok: true,
        found: true,
        temp_password: tempPassword,
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
