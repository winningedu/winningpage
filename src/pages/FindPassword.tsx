// 비밀번호 찾기 — QA 지시 2026-08-21(이메일 링크), QA 시트 147·209행 2026-09-02
// 재확인(휴대폰 인증 경로 추가). 로그인 화면(Login.tsx) 하단 "비밀번호 찾기"
// 링크의 목적지.
//
// 휴대폰 인증 경로 문구 — 2026-09-02 승인(QA 시트 행 147·209, 기존 FindAccount 어조 동일).
//
// 두 가지 방법을 세그먼트로 제공한다. 기본은 휴대폰 인증이다 — QA가 요구한
// "알림톡 또는 이메일 인증코드" 중 이번에 새로 구현하는 쪽이라 우선 노출한다.
//
// ① 휴대폰 인증(신규)
//   FindAccount.tsx와 같은 골격(send-phone-code purpose:'reset_password' →
//   verify-phone-code)으로 번호 소유를 증명한 뒤, /api/reset-password-by-phone이
//   즉시 새 임시비밀번호를 발급한다. 알림톡으로 임시비밀번호 자체를 보내는 것은
//   신규 카카오 템플릿 승인이 필요해 이번 범위에 넣지 않았다 — 화면에 한 번
//   표시하고 복사 버튼을 제공하는 것으로 대신한다(StudentComplete.tsx의 연결코드
//   복사 패턴과 동일).
//
// ② 이메일 링크(기존, 그대로 유지)
//   Supabase resetPasswordForEmail로 재설정 링크를 보내고, 사용자가 그 링크를
//   열면 /login/reset-password(ResetPassword.tsx)로 이동해 새 비밀번호를 정한다.
//   계정 존재 여부를 노출하지 않는 원칙(자세한 이유는 이 섹션의 isServerFailure
//   주석 참고)은 이 경로만 해당한다 — 휴대폰 경로는 OTP로 번호 소유를 이미
//   증명했으므로 그 원칙의 예외다(find-account-by-phone.ts와 동일 논리).
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  AuthLayout,
  AuthTitle,
  InfoCard,
  PrimaryButton,
  TextField,
  TextLinkButton,
} from "@/components/auth";
import { useCooldown } from "@/hooks/useCooldown";
import { useSignupEnabled } from "@/hooks/useSignupEnabled";
import {
  isValidMobile,
  normalizePhone,
  PHONE_RESEND_COOLDOWN_SECONDS,
  sendPhoneCode,
  verifyPhoneCode,
} from "@/lib/phoneVerification";
import { supabase } from "@/lib/supabase";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_COOLDOWN_SECONDS = 60;
const COPY_FEEDBACK_MS = 2000;

type FindMethod = "phone" | "email";
type FieldStatus = "default" | "error" | "success";

/**
 * "서버가 못 보낸 것"인지 판정한다. 계정 존재 여부와 무관한 실패만 true 다.
 *
 * 왜 구분하나 — 실제로 당한 사고 (2026-08-23)
 *   dev 의 SMTP 자격증명이 틀어져 `/auth/v1/recover` 가 **500** 을 뱉고 있었는데,
 *   이 화면은 실패를 통째로 삼키고 "보냈어요"만 띄웠다. 메일은 한 통도 안 나갔는데
 *   사용자는 오지 않는 메일을 기다리며 스팸함만 뒤지게 된다 — 실제 사용자였으면
 *   계정을 영영 못 찾는다.
 *
 *   "계정이 없다"는 계속 숨겨야 맞다(그걸 구분해 보여주면 이메일 등록 여부를
 *   캐는 경로가 된다). 하지만 5xx 는 **어떤 계정 정보도 담고 있지 않으므로**
 *   사실대로 알려도 그 원칙이 깨지지 않는다.
 *
 * AuthRetryableFetchError 는 auth-js 가 네트워크 오류와 500·501·502·503·504,
 * Cloudflare 520~530 을 묶어 던지는 타입이다. status 를 못 읽는 경우까지 덮으려고
 * 이름과 status 둘 다 본다.
 */
export function isServerFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: string; status?: number };
  if (candidate.name === "AuthRetryableFetchError") return true;
  return typeof candidate.status === "number" && candidate.status >= 500;
}

type PhoneResetResult =
  | {
      kind: "success";
      tempPassword: string;
      maskedEmail: string;
      via: "phone" | "guardian_phone";
    }
  | { kind: "not_found" }
  | { kind: "multiple_accounts"; maskedEmails: string[]; message: string }
  | { kind: "error"; message: string };

async function requestPhoneReset(phone: string): Promise<PhoneResetResult> {
  try {
    const response = await fetch("/api/reset-password-by-phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: normalizePhone(phone) }),
    });
    const payload = await response.json();

    if (response.status === 409 && payload?.reason === "multiple_accounts") {
      return {
        kind: "multiple_accounts",
        maskedEmails: Array.isArray(payload.masked_emails)
          ? payload.masked_emails
          : [],
        message: payload.detail,
      };
    }

    if (!response.ok || !payload?.ok) {
      return {
        kind: "error",
        message:
          payload?.detail ||
          "비밀번호 재설정 중 문제가 발생했습니다. 처음부터 다시 시도해 주세요.",
      };
    }

    if (!payload.found) return { kind: "not_found" };

    return {
      kind: "success",
      tempPassword: payload.temp_password,
      maskedEmail: payload.masked_email,
      via: payload.via === "guardian_phone" ? "guardian_phone" : "phone",
    };
  } catch {
    return {
      kind: "error",
      message: "연결 상태를 확인한 뒤 다시 시도해 주세요.",
    };
  }
}

export default function FindPassword() {
  const navigate = useNavigate();
  // 가입 오픈 여부(app_settings.signup_enabled) — false/로딩 중(null)이면
  // 회원가입 안내 CTA를 숨긴다(Header.tsx와 동일 원칙).
  const signupEnabled = useSignupEnabled();
  const [method, setMethod] = useState<FindMethod>("phone");

  // --- ② 이메일 링크(기존) ---
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [emailStatus, setEmailStatus] = useState<FieldStatus>("default");
  const emailCooldown = useCooldown(RESEND_COOLDOWN_SECONDS);

  async function handleSendEmail() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setEmailMessage("이메일 형식이 올바르지 않습니다.");
      setEmailStatus("error");
      return;
    }

    if (emailCooldown.active) {
      setEmailMessage(`${emailCooldown.remaining}초 후에 다시 보낼 수 있어요.`);
      setEmailStatus("error");
      return;
    }

    setSending(true);
    setEmailMessage("");

    let serverFailed = false;

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        { redirectTo: `${window.location.origin}/login/reset-password` },
      );

      // 계정이 없는 경우에는 실패를 숨긴다(파일 상단 주석). 서버 장애는 숨기지
      // 않는다 — 위 isServerFailure 주석 참고.
      if (error) {
        console.error("비밀번호 재설정 메일 발송 오류:", error);
        serverFailed = isServerFailure(error);
      }
    } finally {
      setSending(false);

      if (serverFailed) {
        // 쿨다운을 걸지 않는다 — 아예 발송되지 않았으므로 60초를 기다리게 할
        // 이유가 없다. 남용은 Supabase 쪽 rate limit 이 계속 막는다.
        setEmailMessage(
          "지금은 메일을 보낼 수 없습니다. 잠시 후 다시 시도해 주세요. 계속되면 고객센터로 문의해 주세요.",
        );
        setEmailStatus("error");
      } else {
        emailCooldown.start();
        setEmailMessage(
          "입력하신 이메일로 비밀번호 재설정 링크를 보냈어요. 메일함(스팸함 포함)을 확인해 주세요.",
        );
        setEmailStatus("success");
      }
    }
  }

  // --- ① 휴대폰 인증(신규) ---
  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneRequested, setPhoneRequested] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneMessage, setPhoneMessage] = useState<{
    text: string;
    status: FieldStatus;
  }>({ text: "", status: "default" });
  const [phoneSending, setPhoneSending] = useState(false);
  const phoneCooldown = useCooldown(PHONE_RESEND_COOLDOWN_SECONDS);
  // 서버가 시도를 세므로 같은 코드를 두 번 보내지 않는다(FindAccount.tsx와 동일 관례).
  const lastPhoneAttempt = useRef("");

  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<PhoneResetResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function requestPhoneCode() {
    if (!isValidMobile(phone)) {
      setPhoneMessage({
        text: "전화번호를 올바르게 입력해 주세요.",
        status: "error",
      });
      return;
    }

    if (phoneCooldown.active) {
      setPhoneMessage({
        text: `인증번호는 ${phoneCooldown.remaining}초 후에 다시 보낼 수 있어요.`,
        status: "error",
      });
      return;
    }

    setPhoneSending(true);
    setPhoneMessage({ text: "", status: "default" });

    try {
      const sendResult = await sendPhoneCode(phone, "reset_password");

      if (!sendResult.ok) {
        if (sendResult.retryAfter) phoneCooldown.start();
        setPhoneMessage({ text: sendResult.message, status: "error" });
        return;
      }

      lastPhoneAttempt.current = "";
      setPhoneRequested(true);
      setPhoneCode("");
      phoneCooldown.start();
      setPhoneMessage({
        text: sendResult.dryRun
          ? "테스트 모드입니다 — 실제 문자는 발송되지 않았습니다."
          : "카카오톡으로 인증번호를 발송했습니다.",
        status: "default",
      });
    } finally {
      setPhoneSending(false);
    }
  }

  // 6자리가 채워지면 곧바로 검증한다 — FindAccount.tsx와 동일 패턴.
  const onPhoneCodeChange = useEffectEvent((code: string) => {
    if (
      code.length !== 6 ||
      !phoneRequested ||
      phoneVerified ||
      lastPhoneAttempt.current === code
    ) {
      return;
    }

    lastPhoneAttempt.current = code;

    verifyPhoneCode(phone, code, "reset_password").then((verifyResult) => {
      if (verifyResult.ok) {
        setPhoneVerified(true);
        setPhoneMessage({
          text: "전화번호 인증이 완료되었습니다.",
          status: "success",
        });
        return;
      }

      setPhoneMessage({ text: verifyResult.message, status: "error" });

      if (
        verifyResult.reason === "too_many_attempts" ||
        verifyResult.reason === "code_expired"
      ) {
        lastPhoneAttempt.current = "";
      }
    });
  });

  useEffect(() => {
    onPhoneCodeChange(phoneCode);
  }, [phoneCode]);

  // 인증이 확인되는 즉시 재설정을 요청한다 — 별도 "재설정하기" 버튼을 두지 않는다
  // (FindAccount.tsx가 인증 직후 바로 조회하는 것과 동일 패턴).
  useEffect(() => {
    if (!phoneVerified) return;

    let cancelled = false;
    setResetting(true);

    requestPhoneReset(phone).then((result) => {
      if (cancelled) return;
      setResetting(false);
      setResetResult(result);
    });

    return () => {
      cancelled = true;
    };
  }, [phoneVerified, phone]);

  async function handleCopyPassword() {
    if (resetResult?.kind !== "success") return;

    try {
      await navigator.clipboard.writeText(resetResult.tempPassword);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch (error) {
      // TODO: 클립보드 API 미지원 환경 대비 폴백(예: 임시 textarea + execCommand) 필요.
      console.error("임시비밀번호 복사 오류:", error);
    }
  }

  function switchMethod(next: FindMethod) {
    if (next === method) return;
    setMethod(next);
  }

  return (
    <AuthLayout>
      <AuthTitle
        line1="비밀번호를 잊으셨나요?"
        line2={
          method === "phone"
            ? "가입하신 휴대폰 번호로 인증해 주세요"
            : "가입하신 이메일로 재설정 링크를 보내드려요"
        }
        line2Color="ink"
      />

      <div
        role="tablist"
        aria-label="비밀번호 찾기 방법"
        className="flex w-full gap-2 rounded-xl bg-surface-card p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={method === "phone"}
          onClick={() => switchMethod("phone")}
          className={`h-10 flex-1 rounded-lg text-sm font-semibold transition-colors ${
            method === "phone"
              ? "bg-white text-primary shadow-sm"
              : "text-ink-sub"
          }`}
        >
          휴대폰 인증
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={method === "email"}
          onClick={() => switchMethod("email")}
          className={`h-10 flex-1 rounded-lg text-sm font-semibold transition-colors ${
            method === "email"
              ? "bg-white text-primary shadow-sm"
              : "text-ink-sub"
          }`}
        >
          이메일 링크
        </button>
      </div>

      {method === "phone" && (
        <>
          {!phoneVerified && (
            <div className="flex w-full flex-col gap-5">
              <TextField
                label="전화번호"
                id="find-password-phone"
                name="phone"
                type="tel"
                value={phone}
                onChange={setPhone}
                placeholder="가입 시 등록한 전화번호를 입력해 주세요"
                actionLabel={
                  phoneCooldown.active
                    ? `${phoneCooldown.remaining}초 후 다시 보내기`
                    : phoneRequested
                      ? "인증번호 다시 보내기"
                      : "인증번호 보내기"
                }
                onAction={requestPhoneCode}
                actionDisabled={phoneSending || phoneCooldown.active}
                helperText={phoneMessage.text}
                status={phoneMessage.status}
                autoComplete="tel"
                required
              />

              <TextField
                label="인증번호"
                id="find-password-phone-code"
                name="phoneCode"
                value={phoneCode}
                onChange={(value) =>
                  setPhoneCode(value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="카카오톡으로 보낸 인증번호를 입력해 주세요"
                disabled={!phoneRequested}
              />
            </div>
          )}

          {phoneVerified && resetting && (
            <p className="text-center text-sm text-ink-sub">
              새 비밀번호를 발급하는 중입니다...
            </p>
          )}

          {resetResult?.kind === "success" && (
            <div className="flex w-full flex-col gap-5">
              <InfoCard variant="card" className="text-center">
                {resetResult.via === "guardian_phone" && (
                  <>
                    학부모 핸드폰으로 등록된 계정이에요.
                    <br />
                  </>
                )}
                {resetResult.maskedEmail} 계정의 임시비밀번호가 발급됐어요.
                <br />
                로그인 후 마이페이지 &gt; 내 정보 수정에서 비밀번호를 바꿔
                주세요.
              </InfoCard>

              <div className="flex w-full items-center justify-center rounded-[0.875rem] bg-surface-card py-4 text-xl font-medium tracking-[0.2em] text-accent">
                {resetResult.tempPassword}
              </div>

              <TextLinkButton
                as="button"
                tone="accent"
                size="xs"
                underline
                onClick={handleCopyPassword}
                className="self-center"
              >
                {copied ? "복사되었습니다" : "임시비밀번호 복사하기"}
              </TextLinkButton>

              <PrimaryButton onClick={() => navigate("/login")}>
                로그인하러 가기
              </PrimaryButton>
            </div>
          )}

          {resetResult?.kind === "not_found" && (
            <div className="flex w-full flex-col gap-5">
              <InfoCard variant="info">
                해당 번호로 등록된 계정이 없어요. 아직 가입하지 않으셨다면
                회원가입을 진행해 주세요.
              </InfoCard>

              {signupEnabled && (
                <TextLinkButton as="link" to="/signup" tone="primary" size="md">
                  회원가입하러 가기
                </TextLinkButton>
              )}
            </div>
          )}

          {resetResult?.kind === "multiple_accounts" && (
            <div className="flex w-full flex-col gap-5">
              <p role="alert" className="w-full text-center text-sm text-error">
                {resetResult.message}
              </p>

              {resetResult.maskedEmails.length > 0 && (
                <InfoCard variant="info">
                  <ul className="flex flex-col gap-1">
                    {resetResult.maskedEmails.map((maskedEmail, index) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: 마스킹된 이메일이라 형제자매 계정끼리 동일 문자열일 수 있다 — 한 번의 조회 응답을 그대로 렌더하는 정적 목록이라 인덱스로 구분해도 안전하다.
                      <li key={`${index}-${maskedEmail}`}>{maskedEmail}</li>
                    ))}
                  </ul>
                </InfoCard>
              )}

              <PrimaryButton onClick={() => switchMethod("email")}>
                이메일로 재설정하기
              </PrimaryButton>
            </div>
          )}

          {resetResult?.kind === "error" && (
            <p role="alert" className="w-full text-center text-sm text-error">
              {resetResult.message}
            </p>
          )}
        </>
      )}

      {method === "email" && (
        <div className="flex w-full flex-col gap-5">
          <TextField
            label="이메일"
            id="find-password-email"
            name="email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="가입하신 이메일을 입력해 주세요"
            helperText={emailMessage}
            status={emailStatus}
            autoComplete="email"
            required
          />

          <PrimaryButton
            onClick={handleSendEmail}
            disabled={sending || emailCooldown.active}
            loading={sending}
          >
            {emailCooldown.active
              ? `${emailCooldown.remaining}초 후 다시 보내기`
              : "재설정 링크 보내기"}
          </PrimaryButton>
        </div>
      )}

      <TextLinkButton as="link" to="/login" tone="ink" size="xs" weight="bold">
        로그인으로 돌아가기
      </TextLinkButton>
    </AuthLayout>
  );
}
