// [신규] 아이디(이메일) 찾기 — QA 지시 2026-08-21, 로그인 화면(Login.tsx) 하단
// "아이디 찾기" 링크의 목적지.
//
// 휴대폰 인증(회원가입과 같은 /api/send-phone-code · /api/verify-phone-code)을
// 통과해야만 서버가 마스킹된 이메일을 알려준다(/api/find-account-by-phone).
// 원본 이메일은 어떤 응답에도 담기지 않는다 — 서버가 마스킹까지 끝낸 문자열만
// 내려준다.
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

type FieldStatus = "default" | "error" | "success";
interface FieldMessage {
  text: string;
  status: FieldStatus;
}

type LookupResult =
  | {
      kind: "found";
      maskedEmails: string[];
      via: "phone" | "guardian_phone";
    }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

async function fetchMaskedEmail(phone: string): Promise<LookupResult> {
  try {
    const response = await fetch("/api/find-account-by-phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: normalizePhone(phone) }),
    });
    const payload = await response.json();

    if (!response.ok || !payload?.ok) {
      return {
        kind: "error",
        message:
          payload?.detail ||
          "계정 조회 중 문제가 발생했습니다. 처음부터 다시 시도해 주세요.",
      };
    }

    if (!payload.found) return { kind: "not_found" };

    const maskedEmails: string[] = Array.isArray(payload.masked_emails)
      ? payload.masked_emails
      : [payload.masked_email];

    return {
      kind: "found",
      maskedEmails,
      via: payload.via === "guardian_phone" ? "guardian_phone" : "phone",
    };
  } catch {
    return {
      kind: "error",
      message: "연결 상태를 확인한 뒤 다시 시도해 주세요.",
    };
  }
}

export default function FindAccount() {
  const navigate = useNavigate();
  // 가입 오픈 여부(app_settings.signup_enabled) — false/로딩 중(null)이면
  // 회원가입 안내 CTA를 숨긴다(Header.tsx와 동일 원칙).
  const signupEnabled = useSignupEnabled();
  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneRequested, setPhoneRequested] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneMessage, setPhoneMessage] = useState<FieldMessage>({
    text: "",
    status: "default",
  });
  const [phoneSending, setPhoneSending] = useState(false);
  const phoneCooldown = useCooldown(PHONE_RESEND_COOLDOWN_SECONDS);
  // 서버가 시도를 세므로 같은 코드를 두 번 보내지 않는다(StudentForm과 동일 관례).
  const lastPhoneAttempt = useRef("");

  const [looking, setLooking] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);

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
      const sendResult = await sendPhoneCode(phone, "find_account");

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

  // 6자리가 채워지면 곧바로 검증한다 — 회원가입 폼과 동일한 패턴.
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

    verifyPhoneCode(phone, code, "find_account").then((verifyResult) => {
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

  // 인증이 확인되는 즉시 조회한다 — 별도 "조회하기" 버튼을 두지 않는다.
  useEffect(() => {
    if (!phoneVerified) return;

    let cancelled = false;
    setLooking(true);

    fetchMaskedEmail(phone).then((lookupResult) => {
      if (cancelled) return;
      setLooking(false);
      setResult(lookupResult);
    });

    return () => {
      cancelled = true;
    };
  }, [phoneVerified, phone]);

  return (
    <AuthLayout>
      <AuthTitle
        line1="아이디(이메일)를 찾아드려요"
        line2="가입하신 휴대폰 번호로 인증해 주세요"
        line2Color="ink"
      />

      {!phoneVerified && (
        <div className="flex w-full flex-col gap-5">
          <TextField
            label="전화번호"
            id="find-account-phone"
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
            id="find-account-phone-code"
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

      {phoneVerified && looking && (
        <p className="text-center text-sm text-ink-sub">
          등록된 계정을 조회하는 중입니다...
        </p>
      )}

      {result?.kind === "found" && (
        <div className="flex w-full flex-col gap-5">
          <InfoCard variant="card">
            {result.via === "guardian_phone" ? (
              <p>학부모 핸드폰으로 등록된 계정이에요.</p>
            ) : (
              <p>해당 번호로 가입된 이메일이에요.</p>
            )}
            <ul className="mt-2 flex flex-col gap-1">
              {result.maskedEmails.map((maskedEmail, index) => (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: 마스킹된 이메일이라 형제자매 계정끼리 동일 문자열일 수 있다 — 한 번의 조회 응답을 그대로 렌더하는 정적 목록이라 인덱스로 구분해도 안전하다.
                  key={`${index}-${maskedEmail}`}
                  className="text-lg font-semibold text-ink-title"
                >
                  {maskedEmail}
                </li>
              ))}
            </ul>
          </InfoCard>

          <PrimaryButton onClick={() => navigate("/login")}>
            로그인하러 가기
          </PrimaryButton>
        </div>
      )}

      {result?.kind === "not_found" && (
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

      {result?.kind === "error" && (
        <p role="alert" className="w-full text-center text-sm text-error">
          {result.message}
        </p>
      )}

      <TextLinkButton as="link" to="/login" tone="ink" size="xs" weight="bold">
        로그인으로 돌아가기
      </TextLinkButton>
    </AuthLayout>
  );
}
