// 휴대폰번호 입력과 인증번호 확인 한 쌍. 학생 본인 번호(signup)와 학부모 번호(guardian_signup)가 함께 쓴다.
// 인증번호 6자리가 채워지면 바로 검증한다. 서버가 시도 횟수를 세므로 같은 코드는 한 번만 보낸다.
import { useRef, useState } from "react";
import { TextField } from "@/components/auth";
import { useCooldown } from "@/hooks/useCooldown";
import {
  formatPhoneInput,
  isValidMobile,
  PHONE_RESEND_COOLDOWN_SECONDS,
  sendPhoneCode,
  verifyPhoneCode,
} from "@/lib/phoneVerification";
import { PHONE_MESSAGES } from "./copy";
import Notice from "./Notice";

interface PhoneVerifyState {
  requested: boolean;
  verified: boolean;
}

interface PhoneVerifyFieldProps {
  idPrefix: string;
  label: string;
  codeLabel: string;
  phone: string;
  onPhoneChange: (phone: string) => void;
  purpose: "signup" | "guardian_signup";
  // 소속 안에서만 번호 중복을 보게 하는 범위(결정 r8). 학부모 번호는 넘기지 않는다.
  scope?: { tenantId?: string; catchAll?: boolean };
  state: PhoneVerifyState;
  onStateChange: (state: PhoneVerifyState) => void;
}

export default function PhoneVerifyField({
  idPrefix,
  label,
  codeLabel,
  phone,
  onPhoneChange,
  purpose,
  scope,
  state,
  onStateChange,
}: PhoneVerifyFieldProps) {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState({ text: "", isError: false });
  const [taken, setTaken] = useState(false);
  const [sending, setSending] = useState(false);
  const cooldown = useCooldown(PHONE_RESEND_COOLDOWN_SECONDS);
  const lastAttempt = useRef("");

  async function handleSend() {
    if (!isValidMobile(phone)) {
      setMessage({ text: PHONE_MESSAGES.invalid, isError: true });
      return;
    }

    if (cooldown.active) {
      setMessage({
        text: `인증번호는 ${cooldown.remaining}초 후에 다시 보낼 수 있어요.`,
        isError: true,
      });
      return;
    }

    setSending(true);
    setMessage({ text: "", isError: false });
    try {
      const result = await sendPhoneCode(phone, purpose, scope);

      if (!result.ok) {
        if (result.retryAfter) cooldown.start();
        setTaken(result.reason === "phone_taken");
        onStateChange({ requested: false, verified: false });
        // 이미 가입한 번호는 문구 대신 안내 상자(아이디 찾기 링크 포함)를 보여 준다.
        setMessage({
          text: result.reason === "phone_taken" ? "" : result.message,
          isError: true,
        });
        return;
      }

      lastAttempt.current = "";
      setCode("");
      onStateChange({ requested: true, verified: false });
      cooldown.start();
      setMessage({
        text: result.dryRun
          ? "테스트 모드입니다. 실제 문자는 발송되지 않았습니다."
          : "카카오톡으로 인증번호를 발송했습니다.",
        isError: false,
      });
    } finally {
      setSending(false);
    }
  }

  async function handleCodeChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setCode(digits);

    if (
      digits.length !== 6 ||
      !state.requested ||
      state.verified ||
      lastAttempt.current === digits
    ) {
      return;
    }

    lastAttempt.current = digits;
    const result = await verifyPhoneCode(phone, digits, purpose);

    if (result.ok) {
      onStateChange({ requested: true, verified: true });
      setMessage({ text: PHONE_MESSAGES.verified, isError: false });
      return;
    }

    setMessage({ text: result.message, isError: true });
    // 시도가 소진되거나 만료되면 재발송 외에 길이 없다. 다음 입력이 다시 시도되게 푼다.
    if (
      result.reason === "too_many_attempts" ||
      result.reason === "code_expired"
    ) {
      lastAttempt.current = "";
    }
  }

  function handlePhoneChange(value: string) {
    onPhoneChange(formatPhoneInput(value));
    setTaken(false);
    setMessage({ text: "", isError: false });
    onStateChange({ requested: false, verified: false });
  }

  return (
    <>
      <div>
        <TextField
          label={label}
          id={`${idPrefix}-phone`}
          name={`${idPrefix}Phone`}
          size="lg"
          value={phone}
          onChange={handlePhoneChange}
          actionLabel={
            cooldown.active
              ? `${cooldown.remaining}초 후 다시 보내기`
              : "인증번호 보내기"
          }
          onAction={handleSend}
          actionDisabled={sending || cooldown.active || state.verified}
          autoComplete="tel"
        />
        {taken && <Notice message={PHONE_MESSAGES.taken} hint="findId" />}
      </div>

      <TextField
        label={codeLabel}
        id={`${idPrefix}-phone-code`}
        name={`${idPrefix}PhoneCode`}
        size="lg"
        inputMode="numeric"
        value={code}
        onChange={handleCodeChange}
        disabled={!state.requested || state.verified}
        helperText={state.verified ? PHONE_MESSAGES.verified : message.text}
        status={state.verified || !message.isError ? "default" : "error"}
      />
    </>
  );
}
