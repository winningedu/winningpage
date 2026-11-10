// 멘토신청 5-2 휴대폰 본인인증 — docs/mentor-apply-spec.md §폼 명세 섹션 5.
//
// 회원가입(ParentForm.jsx `:118-190`)과 **같은 서버 시퀀스**를 쓴다 —
// `sendPhoneCode`/`verifyPhoneCode`(src/lib/phoneVerification.js) + `useCooldown(60)`.
// 새 호출 규약을 만들지 않았고, 에러 문구도 라이브러리가 내려주는 `result.message`
// 를 그대로 노출한다(문구가 두 벌이 되면 서버 reason 과 어긋난다).
//
// purpose 는 **'mentor_apply'** 다. 'signup'/'parent_signup' 계열을 쓰면
// `api/_routes/send-phone-code.js` 의 `SIGNUP_PURPOSES` 분기를 타면서 **이미 가입한 대학생의
// 번호가 409 `phone_taken` 으로 거절**돼 지원 자체가 막힌다(명세 §재사용 매핑 B).
// 지원자는 비회원이므로 중복 검사 대상이 아니다(확인 항목 ㊵ 해소).
//
// ⚠️ 여기 상태(verified)는 **UX 용이다.** 제출 시점에 서버가 `phone_verifications`
// 의 `verified_at` 을 다시 확인하므로(명세 §백엔드/데이터 3·5), 클라이언트가
// verified 를 들고 있다고 해서 통과가 보장되지 않는다. 반대로 인증 후 시간이 많이
// 지나 서버 레코드가 만료되면 제출이 거절될 수 있다.
//
// ⚠️ 인증 성공/실패/타이머 상태는 **시안에 없다**(확인 항목 ㉜ — Figma 전수 재조사에서
// 부재 확정). 아래 메시지 표현(`{ text, status }` + 'default'/'error'/'success' 3상태,
// 쿨다운 남은 초를 버튼 라벨에 노출)은 **회원가입 화면의 기존 상태 표현을 그대로
// 차용**한 것이다(ParentForm.jsx `:400-402`, `:429-440`). 디자인 확정 시 교체 대상.
//
// 시안과 다르게 만든 곳: ParentForm 은 6자리가 채워지면 자동 검증하지만, 이 시안에는
// `인증번호 확인` 버튼이 명시돼 있어 **버튼 클릭으로만** 검증한다. 서버가 시도를 5회로
// 세기 때문에(phoneVerification.js 파일 주석) 자동 검증은 지웠다 다시 입력하는 것만으로
// 시도를 깎는데, 버튼 방식은 그 문제도 같이 없앤다.
import { useState } from "react";
import { useCooldown } from "@/hooks/useCooldown";
import {
  DUPLICATE_PHONE_MESSAGE,
  isValidMobile,
  normalizePhone,
  sendPhoneCode,
  verifyPhoneCode,
} from "@/lib/phoneVerification";

const PHONE_PURPOSE = "mentor_apply";
// ParentForm.jsx:109 와 동일한 60초. 서버(api/_routes/send-phone-code.js)가 강제하는 값을
// 화면에 보이게 만드는 용도일 뿐 보안 장치가 아니다(useCooldown.js 파일 주석).
const RESEND_COOLDOWN_SECONDS = 60;

// 시안 §폼 명세 5-2 placeholder 원문.
const PHONE_PLACEHOLDER = "휴대폰 번호 입력";
const CODE_PLACEHOLDER = "인증번호 입력";

// 인풋 h52(3.25rem) / radius 12(0.75rem) / padding 20(1.25rem) / border 1px — §6-5.
// 시안 보더·placeholder 색은 #D9D9D9 지만 토큰에 없어 가장 가까운 line(#d7d7d7)을 쓴다.
const FIELD_BOX_CLASS =
  "flex h-13 w-full items-center gap-2 rounded-xl border bg-white px-5 transition-colors focus-within:border-accent";
const INPUT_CLASS =
  "min-w-0 flex-1 bg-transparent text-[1rem] leading-[1.4] text-ink outline-hidden placeholder:text-line disabled:cursor-not-allowed disabled:text-ink-sub";
// 액션 버튼 94×34(5.875rem × 2.125rem), radius 8(0.5rem), padding 8/6, SemiBold 14 accent.
// 폭은 `w-` 가 아니라 `min-w-` 로 뒀다 — `인증번호 확인`(6자 × 14px ≈ 84px) + 좌우 패딩
// 16px 이 94px 를 넘겨 고정폭이면 글자가 버튼 밖으로 삐져나온다. 쿨다운 라벨(`60초`)처럼
// 짧은 문구에서는 시안 94px 를 그대로 유지한다.
const ACTION_BUTTON_CLASS =
  "flex h-8.5 min-w-23.5 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-accent bg-transparent px-2 py-1.5 text-[0.875rem] font-semibold leading-[1.4] text-accent transition-opacity hover:opacity-80 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-line disabled:text-ink-sub disabled:hover:opacity-100";

const MESSAGE_TEXT_CLASS: Record<string, string> = {
  default: "text-ink-sub",
  error: "text-error",
  success: "text-accent",
};

type MessageStatus = "default" | "error" | "success";

// phoneVerification.js(checkJs, JSDoc @returns)의 반환 유니온을 그대로 옮긴 로컬 타입.
// 크로스 파일 JSDoc 유니온은 `!result.ok` discriminant narrowing 이 적용되지 않아
// (result 가 계속 전체 유니온으로 남아 `result.reason`/`result.message` 접근이 막힌다) 이
// 파일 안에서 다시 선언하고 캐스팅한다 — phoneVerification.js 는 담당 파일이 아니다.
type SendPhoneCodeResult =
  | { ok: true; expiresIn: number; cooldown: number; dryRun: boolean }
  | { ok: false; reason: string; message: string; retryAfter?: number };

type VerifyPhoneCodeResult =
  | { ok: true }
  | { ok: false; reason: string; message: string; remainingAttempts?: number };

type PhoneVerifyFieldProps = {
  value?: string; // 휴대폰 번호(원문 입력값). 정규화는 전송 직전에 한다.
  onChange?: (value: string) => void;
  verified?: boolean;
  onVerified?: (normalizedPhone: string) => void;
  error?: string;
  id?: string;
};

export default function PhoneVerifyField({
  value = "", // 휴대폰 번호(원문 입력값). 정규화는 전송 직전에 한다.
  onChange,
  verified = false,
  onVerified,
  error,
  id = "mentor-apply-phone",
}: PhoneVerifyFieldProps) {
  const [code, setCode] = useState("");
  const [requested, setRequested] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    status: MessageStatus;
  }>({
    text: "",
    status: "default",
  });

  const cooldown = useCooldown(RESEND_COOLDOWN_SECONDS);
  const normalizedPhone = normalizePhone(value);

  const errorId = `${id}-message`;
  // 부모가 내려주는 error(제출 시 검증)가 우선이다 — 실패 원인을 덮지 않는다.
  const shownMessage = error
    ? { text: error, status: "error" }
    : verified
      ? { text: "인증되었습니다", status: "success" }
      : message;

  // 시안에 있는 라벨은 최초 상태 `인증번호 발송` 하나뿐이다. 쿨다운·재발송 라벨은
  // 회원가입(`${remaining}초 후 다시 보내기` / `인증번호 다시 보내기`, ParentForm.jsx:400)
  // 문구를 94px 버튼에 맞게 줄인 **파생 카피**다 — 확정 문구는 기획 확인 대상.
  const sendLabel = cooldown.active
    ? `${cooldown.remaining}초 후`
    : requested
      ? "다시 발송"
      : "인증번호 발송";

  async function handleSend() {
    if (!isValidMobile(value)) {
      setMessage({ text: "올바른 전화번호를 입력해 주세요", status: "error" });
      return;
    }

    setSending(true);
    setMessage({ text: "", status: "default" });

    try {
      const result = (await sendPhoneCode(
        normalizedPhone,
        PHONE_PURPOSE,
      )) as SendPhoneCodeResult;

      // ⚠ `=== false` — `!result.ok` 로 쓰면 SendPhoneCodeResult(리터럴 유니온) discriminant
      // narrowing 이 깨져(TS가 반대 분기로 좁혀 result.reason/message 를 "존재하지 않음"으로
      // 오판) 아래 result.retryAfter/reason/message 접근에서 컴파일 에러가 난다. 동작은 동일.
      if (result.ok === false) {
        // 서버가 남은 시간을 알려준 경우에만 쿨다운을 돌린다(ParentForm.jsx:164 동일).
        if (result.retryAfter) cooldown.start();

        if (result.reason === "phone_taken") {
          // purpose 를 'mentor_apply' 로 보내는 한 서버가 중복 검사를 하지 않으므로
          // 여기로 오면 안 된다. 방어적으로 남겨 둔다.
          setRequested(false);
          setMessage({ text: DUPLICATE_PHONE_MESSAGE, status: "error" });
          return;
        }

        setMessage({ text: result.message, status: "error" });
        return;
      }

      setRequested(true);
      setCode("");
      cooldown.start();
      setMessage({
        // 운영에서 dryRun 이 true 면 문자가 실제로 나가지 않은 것이다.
        text: result.dryRun
          ? "테스트 모드입니다 — 실제 문자는 발송되지 않았습니다."
          : "인증번호를 보냈습니다.",
        status: "default",
      });
    } finally {
      setSending(false);
    }
  }

  async function handleVerify() {
    if (code.length !== 6) {
      setMessage({ text: "인증번호 6자리를 입력해 주세요.", status: "error" });
      return;
    }

    setVerifying(true);

    try {
      const result = (await verifyPhoneCode(
        normalizedPhone,
        code,
      )) as VerifyPhoneCodeResult;

      // ⚠ `=== false` — 위 handleSend 와 같은 이유(`!result.ok` narrowing 실패)로 바꿨다.
      if (result.ok === false) {
        setMessage({ text: result.message, status: "error" });
        return;
      }

      setMessage({ text: "인증되었습니다", status: "success" });
      // 부모에는 정규화된 번호를 넘긴다 — 제출 페이로드와 서버 조회 키를 맞춘다.
      onVerified?.(normalizedPhone);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-2">
      {/* 시안: 370.5 + gap 12 + 370.5 = 753 의 2컬럼. 좁은 화면에서는 세로로 쌓는다. */}
      <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2">
        <div
          className={`${FIELD_BOX_CLASS} ${shownMessage.status === "error" ? "border-error" : "border-line"}`}
        >
          {/* 인증이 끝난 뒤 번호를 바꾸면 서버 인증 기록과 어긋나므로 입력·발송을 잠근다. */}
          <input
            id={id}
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            value={value}
            onChange={(event) => onChange?.(event.target.value)}
            placeholder={PHONE_PLACEHOLDER}
            disabled={verified}
            aria-label="휴대폰 번호"
            aria-invalid={shownMessage.status === "error"}
            aria-describedby={shownMessage.text ? errorId : undefined}
            className={INPUT_CLASS}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || cooldown.active || verified}
            className={ACTION_BUTTON_CLASS}
          >
            {sendLabel}
          </button>
        </div>

        <div
          className={`${FIELD_BOX_CLASS} ${shownMessage.status === "error" ? "border-error" : "border-line"}`}
        >
          <input
            id={`${id}-code`}
            name="phoneCode"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder={CODE_PLACEHOLDER}
            disabled={!requested || verified}
            aria-label="인증번호"
            className={INPUT_CLASS}
          />
          <button
            type="button"
            onClick={handleVerify}
            disabled={!requested || verifying || verified || code.length !== 6}
            className={ACTION_BUTTON_CLASS}
          >
            인증번호 확인
          </button>
        </div>
      </div>

      {/* 메시지 노드가 새로 삽입되는 구조라 role 을 상태에 맞춰 바꾼다 —
          에러는 alert(assertive), 나머지 안내는 status(polite)로 읽힌다. */}
      {shownMessage.text && (
        <p
          id={errorId}
          role={shownMessage.status === "error" ? "alert" : "status"}
          className={`text-[0.875rem] leading-[1.4] ${MESSAGE_TEXT_CLASS[shownMessage.status]}`}
        >
          {shownMessage.text}
        </p>
      )}
    </div>
  );
}
