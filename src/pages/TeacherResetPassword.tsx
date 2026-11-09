// 선생님 비밀번호 찾기(스쿨멘토, 결정 103). FindPassword.tsx 의 "선생님" 탭 내용이다.
// 아이디와 휴대폰 번호로 본인을 확인(휴대폰 인증, reset_password 목적)한 뒤 새 비밀번호를 직접 정한다.
// 서버: POST /api/auth/teacher-reset-password.
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { AuthTitle, PrimaryButton, TextField } from "@/components/auth";
import { useCooldown } from "@/hooks/useCooldown";
import {
  isValidMobile,
  normalizePhone,
  PHONE_RESEND_COOLDOWN_SECONDS,
  sendPhoneCode,
  verifyPhoneCode,
} from "@/lib/phoneVerification";
import {
  PASSWORD_MISMATCH_ERROR,
  PASSWORD_RULE_ERROR,
  SAVE_FAILED_MESSAGE,
  violatesPasswordRule,
} from "./console/passwordRule";

type FieldStatus = "default" | "error" | "success";

// 서버가 문구를 정해 주는 두 실패(결정 103). 그 밖의 실패는 저장 실패 문구로 보여 준다.
const VERIFICATION_EXPIRED = "VERIFICATION_EXPIRED";
const TEACHER_NOT_MATCHED = "TEACHER_NOT_MATCHED";

type ResetOutcome =
  | { kind: "ok" }
  | { kind: "expired"; message: string }
  | { kind: "not_matched"; message: string }
  | { kind: "failed" };

async function requestReset(
  loginId: string,
  phone: string,
  password: string,
): Promise<ResetOutcome> {
  try {
    const response = await fetch("/api/auth/teacher-reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loginId: loginId.trim().toUpperCase(),
        phone: normalizePhone(phone),
        password,
      }),
    });
    const payload = await response.json();
    if (response.ok && payload?.ok) return { kind: "ok" };

    const code = payload?.error?.code;
    const message = payload?.error?.message;
    if (typeof message === "string") {
      if (code === VERIFICATION_EXPIRED) return { kind: "expired", message };
      if (code === TEACHER_NOT_MATCHED) return { kind: "not_matched", message };
    }
    return { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

export default function TeacherResetPassword() {
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [requested, setRequested] = useState(false);
  const [verified, setVerified] = useState(false);
  const [sending, setSending] = useState(false);
  const [phoneMessage, setPhoneMessage] = useState<{
    text: string;
    status: FieldStatus;
  }>({ text: "", status: "default" });
  const cooldown = useCooldown(PHONE_RESEND_COOLDOWN_SECONDS);
  // 서버가 시도를 세므로 같은 코드를 두 번 보내지 않는다(FindPassword.tsx 와 같은 관례).
  const lastAttempt = useRef("");

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState(false);

  // 첫 단계로 돌아간다. 아이디와 번호는 그대로 두어 고쳐 쓸 수 있고, 인증은 새로 받는다.
  function restart() {
    lastAttempt.current = "";
    setRequested(false);
    setVerified(false);
    setPhoneCode("");
    setPassword("");
    setPasswordConfirm("");
    setPhoneMessage({ text: "", status: "default" });
    cooldown.reset();
  }

  async function submit() {
    if (violatesPasswordRule(password)) {
      setFormError(PASSWORD_RULE_ERROR);
      return;
    }
    if (password !== passwordConfirm) {
      setFormError(PASSWORD_MISMATCH_ERROR);
      return;
    }

    setSubmitting(true);
    setFormError("");
    const outcome = await requestReset(loginId, phone, password);
    setSubmitting(false);

    if (outcome.kind === "ok") {
      setDone(true);
      return;
    }
    if (outcome.kind === "expired") {
      // 인증 창이 지났다. 인증번호 단계로 돌아가 다시 받게 한다.
      lastAttempt.current = "";
      setPhoneCode("");
      setVerified(false);
      setFormError(outcome.message);
      return;
    }
    if (outcome.kind === "not_matched") {
      restart();
      setFormError(outcome.message);
      return;
    }
    setFormError(SAVE_FAILED_MESSAGE);
  }

  async function requestCode() {
    if (!isValidMobile(phone)) {
      setPhoneMessage({
        text: "전화번호를 올바르게 입력해 주세요.",
        status: "error",
      });
      return;
    }

    if (cooldown.active) {
      setPhoneMessage({
        text: `인증번호는 ${cooldown.remaining}초 후에 다시 보낼 수 있어요.`,
        status: "error",
      });
      return;
    }

    setSending(true);
    setPhoneMessage({ text: "", status: "default" });

    try {
      const sendResult = await sendPhoneCode(phone, "reset_password");

      if (!sendResult.ok) {
        if (sendResult.retryAfter) cooldown.start();
        setPhoneMessage({ text: sendResult.message, status: "error" });
        return;
      }

      lastAttempt.current = "";
      setRequested(true);
      setPhoneCode("");
      cooldown.start();
      setPhoneMessage({
        text: sendResult.dryRun
          ? "테스트 모드입니다. 실제 문자는 발송되지 않았습니다."
          : "카카오톡으로 인증번호를 발송했습니다.",
        status: "default",
      });
    } finally {
      setSending(false);
    }
  }

  // 6자리가 채워지면 곧바로 검증한다 - FindPassword.tsx 와 같은 패턴.
  const onCodeChange = useEffectEvent((code: string) => {
    if (
      code.length !== 6 ||
      !requested ||
      verified ||
      lastAttempt.current === code
    ) {
      return;
    }

    lastAttempt.current = code;

    verifyPhoneCode(phone, code, "reset_password").then((verifyResult) => {
      if (verifyResult.ok) {
        setVerified(true);
        setPhoneMessage({ text: "", status: "default" });
        return;
      }

      setPhoneMessage({ text: verifyResult.message, status: "error" });

      if (
        verifyResult.reason === "too_many_attempts" ||
        verifyResult.reason === "code_expired"
      ) {
        lastAttempt.current = "";
      }
    });
  });

  useEffect(() => {
    onCodeChange(phoneCode);
  }, [phoneCode]);

  if (done) {
    return (
      <>
        <AuthTitle line1="비밀번호를 바꿨어요" line2Color="ink" />
        <p className="w-full text-center text-sm text-ink">
          비밀번호를 바꿨어요. 새 비밀번호로 로그인해 주세요.
        </p>
        <PrimaryButton onClick={() => navigate("/login")}>
          로그인하러 가기
        </PrimaryButton>
      </>
    );
  }

  return (
    <>
      <AuthTitle
        line1="비밀번호를 잊으셨나요?"
        line2="아이디와 휴대폰 번호로 본인을 확인해 주세요"
        line2Color="ink"
      />

      <div className="flex w-full flex-col gap-5">
        <TextField
          label="아이디"
          id="teacher-reset-login-id"
          name="loginId"
          value={loginId}
          onChange={setLoginId}
          placeholder="선생님 아이디를 입력해 주세요"
          autoCapitalize="characters"
          autoComplete="username"
          spellCheck={false}
          required
        />

        {!verified && (
          <>
            <TextField
              label="휴대폰 번호"
              id="teacher-reset-phone"
              name="phone"
              type="tel"
              value={phone}
              onChange={setPhone}
              placeholder="등록된 휴대폰 번호를 입력해 주세요"
              actionLabel={
                cooldown.active
                  ? `${cooldown.remaining}초 후 다시 보내기`
                  : requested
                    ? "인증번호 다시 받기"
                    : "인증번호 받기"
              }
              onAction={requestCode}
              actionDisabled={sending || cooldown.active}
              helperText={phoneMessage.text}
              status={phoneMessage.status}
              autoComplete="tel"
              required
            />

            <TextField
              label="인증번호"
              id="teacher-reset-phone-code"
              name="phoneCode"
              value={phoneCode}
              onChange={(value) =>
                setPhoneCode(value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="카카오톡으로 보낸 인증번호를 입력해 주세요"
              disabled={!requested}
            />
          </>
        )}

        {verified && (
          <>
            <TextField
              label="새 비밀번호"
              id="teacher-reset-password"
              name="password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="8자 이상, 영문과 숫자 포함"
              autoComplete="new-password"
              required
            />

            <TextField
              label="새 비밀번호 확인"
              id="teacher-reset-password-confirm"
              name="passwordConfirm"
              type="password"
              value={passwordConfirm}
              onChange={setPasswordConfirm}
              autoComplete="new-password"
              required
            />
          </>
        )}
      </div>

      {formError && (
        <p role="alert" className="w-full text-center text-sm text-error">
          {formError}
        </p>
      )}

      {verified && (
        <PrimaryButton
          onClick={submit}
          disabled={submitting}
          loading={submitting}
        >
          비밀번호 바꾸기
        </PrimaryButton>
      )}
    </>
  );
}
