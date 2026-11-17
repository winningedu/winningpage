// 이메일 입력과 인증번호 확인 한 쌍. 위닝 학생 가입(StudentForm)과 같은 이메일 코드 흐름을 쓴다.
// 인증번호 6자리가 채워지면 바로 검증한다. 같은 코드는 한 번만 보낸다.
import { useRef, useState } from "react";
import { TextField } from "@/components/auth";
import type { useSignup } from "@/context/SignupContext";
import { useCooldown } from "@/hooks/useCooldown";
import {
  EMAIL_RESEND_COOLDOWN_SECONDS,
  EMAIL_STATE,
  MESSAGES,
  sendSignupEmailCode,
  verifySignupEmailCode,
} from "@/lib/signupEmailAuth";
import { supabase } from "@/lib/supabase";
import { EMAIL_MESSAGES } from "./copy";
import { isValidEmail } from "./rules";

type EmailVerifyState = ReturnType<typeof useSignup>["verification"]["email"];

const EMAIL_RESET: Partial<EmailVerifyState> = {
  requested: false,
  verified: false,
  checked: false,
  available: false,
  mode: null,
  resumed: false,
};

interface EmailVerifyFieldProps {
  idPrefix: string;
  label: string;
  codeLabel: string;
  email: string;
  onEmailChange: (email: string) => void;
  code: string;
  onCodeChange: (code: string) => void;
  // 인증 메일을 만들 때 계정에 남기는 값. 비밀번호가 비어 있으면 임시값으로 만들어진다.
  name: string;
  password: string;
  state: EmailVerifyState;
  onStateChange: (state: Partial<EmailVerifyState>) => void;
}

export default function EmailVerifyField({
  idPrefix,
  label,
  codeLabel,
  email,
  onEmailChange,
  code,
  onCodeChange,
  name,
  password,
  state,
  onStateChange,
}: EmailVerifyFieldProps) {
  const [message, setMessage] = useState({ text: "", isError: false });
  const [sending, setSending] = useState(false);
  const cooldown = useCooldown(EMAIL_RESEND_COOLDOWN_SECONDS);
  const lastAttempt = useRef("");

  async function handleSend() {
    if (sending) return;

    if (cooldown.active) {
      setMessage({
        text: MESSAGES.cooldown(cooldown.remaining),
        isError: true,
      });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
      setMessage({ text: EMAIL_MESSAGES.invalid, isError: true });
      return;
    }

    setSending(true);
    setMessage({ text: "", isError: false });
    try {
      const {
        state: signupState,
        mode,
        resumed,
        error,
      } = await sendSignupEmailCode({
        email: normalizedEmail,
        password,
        name,
        memberType: "student",
      });

      if (error) {
        onStateChange(EMAIL_RESET);
        setMessage({
          // state가 없으면 상태 조회 자체가 실패한 것이다.
          text: signupState ? error.message : MESSAGES.checkFailed,
          isError: true,
        });
        return;
      }

      if (signupState === EMAIL_STATE.TAKEN) {
        onStateChange({ ...EMAIL_RESET, checked: true });
        setMessage({ text: MESSAGES.taken, isError: true });
        return;
      }

      lastAttempt.current = "";
      onCodeChange("");
      onStateChange({
        checked: true,
        available: true,
        requested: true,
        verified: false,
        mode: mode ?? null,
        resumed: resumed === true,
      });
      cooldown.start();
      setMessage({
        text: resumed ? MESSAGES.resumed : MESSAGES.sent,
        isError: false,
      });
    } finally {
      setSending(false);
    }
  }

  async function handleCodeChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    onCodeChange(digits);

    if (
      digits.length !== 6 ||
      !state.requested ||
      state.verified ||
      lastAttempt.current === digits
    ) {
      return;
    }

    lastAttempt.current = digits;
    const { error } = await verifySignupEmailCode({
      email: email.trim().toLowerCase(),
      token: digits,
      ...(state.mode !== null && { mode: state.mode }),
    });

    if (error) {
      onStateChange({ verified: false });
      setMessage({ text: MESSAGES.codeMismatch, isError: true });
      return;
    }

    // 인증한 계정이 그 사이 다른 창에서 가입을 마쳤을 수 있다. 그대로 두면 기존 회원의
    // 프로필을 덮어쓰는 요청이 된다.
    const { data: userData } = await supabase.auth.getUser();
    const currentUser = userData.user;

    if (currentUser?.id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email, member_type")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (profile?.email && profile?.member_type) {
        onStateChange({ verified: false });
        setMessage({ text: MESSAGES.taken, isError: true });
        return;
      }
    }

    onStateChange({ verified: true });
    setMessage({ text: EMAIL_MESSAGES.verified, isError: false });
  }

  function handleEmailChange(value: string) {
    onEmailChange(value);
    onCodeChange("");
    lastAttempt.current = "";
    setMessage({ text: "", isError: false });
    onStateChange(EMAIL_RESET);
  }

  function actionLabel() {
    if (cooldown.active) return `${cooldown.remaining}초 후 재발송`;
    return state.requested ? "인증번호 다시 보내기" : "인증번호 보내기";
  }

  // 발송 뒤의 안내는 인증번호 칸이 보여 준다. 같은 문구를 두 칸이 함께 띄우지 않는다.
  return (
    <>
      <TextField
        label={label}
        id={`${idPrefix}-email`}
        name="email"
        type="email"
        size="lg"
        value={email}
        onChange={handleEmailChange}
        actionLabel={actionLabel()}
        onAction={handleSend}
        actionDisabled={sending || cooldown.active || state.verified}
        helperText={state.requested ? "" : message.text}
        status={!state.requested && message.isError ? "error" : "default"}
        autoComplete="email"
      />

      <TextField
        label={codeLabel}
        id={`${idPrefix}-email-code`}
        name="emailCode"
        size="lg"
        inputMode="numeric"
        value={code}
        onChange={handleCodeChange}
        disabled={!state.requested || state.verified}
        helperText={
          state.verified
            ? EMAIL_MESSAGES.verified
            : state.requested
              ? message.text
              : ""
        }
        status={
          state.verified || !state.requested || !message.isError
            ? "default"
            : "error"
        }
      />
    </>
  );
}
