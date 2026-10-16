import { useCallback, useEffect, useId, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCooldown } from "@/hooks/useCooldown";
import { apiFetch, getAuthHeader } from "@/lib/apiFetch";
import {
  isValidMobile,
  normalizePhone,
  sendPhoneCode,
  verifyPhoneCode,
} from "@/lib/phoneVerification";
import { supabase } from "@/lib/supabase";
import MyPageModalShell from "./MyPageModalShell";

// 휴대폰 번호 변경 (Figma 3973:15330 입력 / 3973:16090 인증번호 / 3973:16297 확인
// / 3973:16478 완료). 4단계 — ChangeEmailModal.jsx/ChangePasswordModal.jsx 와 같은
// step 골격(form → verify → confirm → done), 발송·검증은 PhoneVerifyField.jsx
// (멘토신청)와 같은 헬퍼(src/lib/phoneVerification.js sendPhoneCode/verifyPhoneCode)
// 를 재사용한다 — 새 호출 규약을 만들지 않는다.
//
// purpose 는 'phone_change'다(api/send-phone-code.js ALLOWED_PURPOSES 에 이미
// 있던 목적 — 이 화면이 처음 소비한다). 'signup' 계열이 아니라서 이미 가입된
// 본인 번호를 phone_taken 으로 거절하는 SIGNUP_PURPOSES 분기를 타지 않는다.
//
// target(2026-09-03, 학부모 핸드폰) — 기본 'self'는 기존 동작 그대로 본인
// profiles.phone을 바꾼다. 'guardian'이면 profiles.guardian_phone을 바꾸는
// 화면으로, purpose가 'guardian_change'로 바뀌고(같은 번호로 본인 번호 변경과
// 동시에 진행 중이어도 purpose_mismatch가 걸러준다) api/change-phone.ts 호출
// body에 target:'guardian'을 함께 보낸다. 단계 흐름(auth → form → verify →
// confirm → done)과 본인확인(비밀번호) 게이트는 target과 무관하게 동일하다.
//
// 인증 채널은 시안 문구 그대로 카카오톡이다, api/_lib/messaging/aligo.ts 기본 채널이
// 알림톡(카카오)이라 문구와 실제 발송 채널이 일치한다.
//
// 완료 처리는 api/change-phone.js 서버 라우트를 거친다. phone_verifications 는
// RLS 전면 거부 테이블이라(sql/40 [6]) 클라이언트가 인증 여부를 스스로 확인할
// 수 없고, 그 라우트가 "검증된 번호로만 바뀐다"를 강제한다 — 그 파일 상단 주석
// 참고.
//
// 본인확인(현재 비밀번호)은 시안대로 별도 게이트 화면(3973:15526, step === "auth")
// 으로 분리했다 — 새 번호 입력보다 먼저 비밀번호를 확인해 통과해야 form 단계로
// 넘어간다(QA 행240, 2026-09). signInWithPassword 검증 로직 자체는 그대로이고
// 실행 시점만 auth 단계로 옮겼다 — 자리를 비운 사이 남이 번호를 바꾸는 것을 막는
// 목적(세션만 있으면 통과되는 구멍을 메운다)은 동일하다.
const RESEND_COOLDOWN_SECONDS = 60;

const FIELD_CLASS =
  "h-13 w-full rounded-xl border border-line px-4 text-[0.9375rem] text-ink outline-hidden focus:border-accent";

type ChangePhoneModalProps = {
  open: boolean;
  currentPhone?: string;
  target?: "self" | "guardian";
  onClose: () => void;
  onChanged?: (phone: string) => void;
};

export default function ChangePhoneModal({
  open,
  currentPhone,
  target = "self",
  onClose,
  onChanged,
}: ChangePhoneModalProps) {
  const isGuardian = target === "guardian";
  // 화면 문구용 명사 — "휴대폰 번호" / "학부모 핸드폰"는 조사(을/를, 이/가)가
  // 갈려서 각 자리에서 완성 문장을 따로 만든다(아래 사용처 참고).
  const phoneNoun = isGuardian ? "학부모 핸드폰" : "휴대폰 번호";
  const phoneTitle = isGuardian
    ? "학부모 핸드폰을 변경해요"
    : "휴대폰 번호를 변경해요";
  const currentLabel = isGuardian ? "현재 학부모 핸드폰" : "현재 휴대폰 번호";
  const newLabel = isGuardian ? "새 학부모 핸드폰" : "새 휴대폰 번호";
  const PHONE_PURPOSE = isGuardian ? "guardian_change" : "phone_change";
  const titleId = useId();
  const [step, setStep] = useState<
    "auth" | "form" | "verify" | "confirm" | "done"
  >("auth");
  const [nextPhone, setNextPhone] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [authenticating, setAuthenticating] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [requested, setRequested] = useState(false);

  const cooldown = useCooldown(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (!open) return;
    setStep("auth");
    setNextPhone("");
    setPassword("");
    setCode("");
    setAuthenticating(false);
    setSending(false);
    setVerifying(false);
    setConfirming(false);
    setErrorMsg("");
    setRequested(false);
  }, [open]);

  const normalizedNext = normalizePhone(nextPhone);
  const phoneValid =
    isValidMobile(normalizedNext) &&
    normalizedNext !== normalizePhone(currentPhone || "");
  const canSendPhoneCode = phoneValid && !sending && !cooldown.active;

  // 본인 확인(auth 단계) — ChangePasswordModal.jsx 와 같은 방식(같은 계정으로
  // signInWithPassword 를 태워 맞는지 확인, 세션은 갱신될 뿐 깨지지 않는다).
  // 여기를 통과해야만 새 번호 입력(form)으로 넘어간다.
  const confirmAuth = useCallback(async () => {
    if (authenticating || !password) return;
    setAuthenticating(true);
    setErrorMsg("");

    const { data: sessionData } = await supabase.auth.getSession();
    const authEmail = sessionData?.session?.user?.email;
    if (!authEmail) {
      setAuthenticating(false);
      setErrorMsg("로그인 정보를 확인할 수 없어요. 다시 로그인해 주세요.");
      return;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password,
    });
    setAuthenticating(false);

    if (authError) {
      if (authError.status === 429) {
        setErrorMsg("시도가 너무 많았어요. 잠시 후 다시 시도해 주세요.");
      } else if (
        authError.status === 400 ||
        /invalid|credential/i.test(authError.message || "")
      ) {
        setErrorMsg("비밀번호가 일치하지 않아요.");
      } else {
        setErrorMsg("본인 확인에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }
      return;
    }

    setStep("form");
  }, [authenticating, password]);

  // 인증번호 발송 — auth 단계에서 본인 확인이 끝났으므로 여기서는 재검증 없이
  // sendPhoneCode만 태운다.
  const sendCode = useCallback(async () => {
    if (sending || !phoneValid) return;
    setSending(true);
    setErrorMsg("");

    const result = await sendPhoneCode(nextPhone, PHONE_PURPOSE);
    setSending(false);

    if (!result.ok) {
      if (result.retryAfter) cooldown.start();
      setErrorMsg(result.message);
      return;
    }

    setRequested(true);
    setCode("");
    cooldown.start();
    setStep("verify");
  }, [sending, phoneValid, nextPhone, cooldown, PHONE_PURPOSE]);

  // 인증번호 검증. purpose를 함께 보내 같은 번호로 본인 번호 변경과 학부모
  // 번호 변경이 동시에 진행 중이어도 엉뚱한 목적의 코드로 통과되지 않게 한다.
  const verifyCode = useCallback(async () => {
    if (verifying || code.trim().length !== 6) return;
    setVerifying(true);
    setErrorMsg("");

    const result = await verifyPhoneCode(nextPhone, code, PHONE_PURPOSE);
    setVerifying(false);

    if (!result.ok) {
      setErrorMsg(result.message);
      return;
    }

    setStep("confirm");
  }, [verifying, code, nextPhone, PHONE_PURPOSE]);

  // 최종 확정 — api/change-phone.js.
  const submit = useCallback(async () => {
    if (confirming) return;
    setConfirming(true);
    setErrorMsg("");

    const authHeader = await getAuthHeader();
    if (!authHeader) {
      setConfirming(false);
      setStep("verify");
      setErrorMsg("로그인 정보를 확인할 수 없어요. 다시 로그인해 주세요.");
      return;
    }

    try {
      const res = await apiFetch("/api/change-phone", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({
          phone: nextPhone,
          ...(isGuardian ? { target: "guardian" } : {}),
        }),
      });
      const payload = await res.json();
      setConfirming(false);

      if (!res.ok || !payload?.ok) {
        setStep("verify");
        setErrorMsg(
          payload?.detail ||
            "번호 변경에 실패했어요. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }

      setStep("done");
      onChanged?.(payload.phone || nextPhone);
    } catch (err) {
      console.error("휴대폰 번호 변경 요청 실패:", err);
      setConfirming(false);
      setStep("verify");
      setErrorMsg("번호 변경에 실패했어요. 잠시 후 다시 시도해 주세요.");
    }
  }, [confirming, nextPhone, onChanged, isGuardian]);

  if (!open) return null;

  // ── 본인 확인 게이트(3973:15526, step === "auth") ─────────────────────
  if (step === "auth") {
    return (
      <MyPageModalShell
        open={open}
        onClose={onClose}
        labelledBy={titleId}
        className="w-104"
      >
        <ScrollArea className="flex-1 px-6 pt-8">
          <h2
            id={titleId}
            className="text-center text-[1.25rem] font-bold leading-[1.4] text-ink-title"
          >
            본인 확인이 필요해요
          </h2>
          <p className="mt-3 text-center text-[0.8125rem] leading-[1.6] text-ink-sub">
            {phoneNoun} 변경을 위해 현재 비밀번호를 입력해 주세요.
          </p>

          <label className="mt-7 block">
            <span className="text-[0.8125rem] font-semibold text-ink">
              현재 비밀번호
            </span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrorMsg("");
              }}
              placeholder="본인 확인을 위해 비밀번호를 입력해주세요"
              className={`mt-2 ${FIELD_CLASS}`}
            />
          </label>

          {errorMsg && (
            <p className="mt-4 text-[0.8125rem] text-error">{errorMsg}</p>
          )}
        </ScrollArea>

        <div className="grid grid-cols-2 gap-2 px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            className="h-12 rounded-xl bg-surface-footer text-[0.875rem] font-semibold text-ink-sub transition hover:bg-line/30"
          >
            취소
          </button>
          <button
            type="button"
            onClick={confirmAuth}
            disabled={!password || authenticating}
            className={`h-12 rounded-xl text-[0.875rem] font-semibold text-white transition ${
              password && !authenticating
                ? "bg-primary hover:opacity-90"
                : "cursor-not-allowed bg-line"
            }`}
          >
            {authenticating ? "확인 중..." : "확인"}
          </button>
        </div>
      </MyPageModalShell>
    );
  }

  // ── 완료(3973:16478) ────────────────────────────────────────────────
  if (step === "done") {
    return (
      <MyPageModalShell
        open={open}
        onClose={onClose}
        labelledBy={titleId}
        className="w-104"
      >
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <h2
            id={titleId}
            className="text-[1.25rem] font-bold leading-[1.4] text-ink-title"
          >
            변경이 완료됐어요
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="mt-7 h-10 w-37.5 rounded-lg bg-primary text-[0.875rem] font-semibold text-white transition hover:opacity-90"
          >
            확인
          </button>
        </div>
      </MyPageModalShell>
    );
  }

  // ── 확인(3973:16297) ────────────────────────────────────────────────
  if (step === "confirm") {
    return (
      <MyPageModalShell
        open={open}
        onClose={onClose}
        labelledBy={titleId}
        className="w-104"
      >
        <div className="flex flex-col items-center px-6 py-9 text-center">
          <h2
            id={titleId}
            className="text-[1.25rem] font-bold leading-[1.4] text-ink-title"
          >
            정말 변경하시겠어요?
          </h2>
          <p className="mt-4 break-keep text-[0.875rem] leading-[1.6] text-ink-sub">
            {phoneNoun}
            {isGuardian ? "이" : "가"} {nextPhone.trim()}로 변경돼요.
            <br />
            변경 후 새 번호로 인증 문자가 전송돼요.
          </p>

          {errorMsg && (
            <p className="mt-4 text-[0.8125rem] text-error">{errorMsg}</p>
          )}

          <div className="mt-7 grid w-full grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setStep("verify")}
              className="h-12 rounded-xl bg-surface-footer text-[0.875rem] font-semibold text-ink-sub transition hover:bg-line/30"
            >
              취소
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={confirming}
              className="h-12 rounded-xl bg-primary text-[0.875rem] font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {confirming ? "변경 중..." : "변경할게요"}
            </button>
          </div>
        </div>
      </MyPageModalShell>
    );
  }

  const sendLabel = cooldown.active
    ? `${cooldown.remaining}초 후`
    : requested
      ? "다시 보내기"
      : "인증번호 보내기";

  // form / verify 두 단계는 번호 입력칸(수정 가능 ↔ 읽기전용)이 뒤바뀌어
  // 사실상 서로 다른 화면이다 — confirm/done 처럼 단계별로 완전히 갈라서
  // 렌더한다(같은 파일 안 기존 관례). 본인확인(비밀번호)은 이제 auth 단계가
  // 끝내고 왔으므로 여기는 새 번호 입력만 받는다.
  if (step === "form") {
    return (
      <MyPageModalShell
        open={open}
        onClose={onClose}
        labelledBy={titleId}
        className="w-104"
      >
        <ScrollArea className="flex-1 px-6 pt-8">
          <h2
            id={titleId}
            className="text-center text-[1.25rem] font-bold leading-[1.4] text-ink-title"
          >
            {phoneTitle}
          </h2>
          <p className="mt-3 text-center text-[0.8125rem] leading-[1.6] text-ink-sub">
            알림과 본인 확인에 사용되는 번호예요.
          </p>

          <div className="mt-7">
            <span className="text-[0.8125rem] font-semibold text-ink">
              {currentLabel}
            </span>
            <div
              className={`mt-2 ${FIELD_CLASS} flex items-center bg-surface-footer text-ink-sub`}
            >
              {currentPhone || "-"}
            </div>
          </div>

          <label className="mt-5 block">
            <span className="text-[0.8125rem] font-semibold text-ink">
              {newLabel}
            </span>
            <div className="mt-2 flex gap-2">
              <input
                type="tel"
                autoComplete="tel"
                value={nextPhone}
                onChange={(e) => {
                  setNextPhone(e.target.value);
                  setErrorMsg("");
                }}
                placeholder="010-0000-0000"
                className={FIELD_CLASS}
              />
              <button
                type="button"
                onClick={sendCode}
                disabled={!canSendPhoneCode}
                className={`h-13 shrink-0 whitespace-nowrap rounded-xl px-4 text-[0.8125rem] font-semibold transition ${
                  canSendPhoneCode
                    ? "bg-primary text-white hover:opacity-90"
                    : "cursor-not-allowed bg-line text-white"
                }`}
              >
                {sendLabel}
              </button>
            </div>
          </label>

          {errorMsg && (
            <p className="mt-4 text-[0.8125rem] text-error">{errorMsg}</p>
          )}
        </ScrollArea>

        <div className="grid grid-cols-2 gap-2 px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            className="h-12 rounded-xl bg-surface-footer text-[0.875rem] font-semibold text-ink-sub transition hover:bg-line/30"
          >
            취소
          </button>
          <button
            type="button"
            disabled
            className="h-12 rounded-xl text-[0.875rem] font-semibold text-white transition cursor-not-allowed bg-line"
          >
            다음
          </button>
        </div>
      </MyPageModalShell>
    );
  }

  // ── 인증번호(3973:16090, step === "verify") ──────────────────────────
  return (
    <MyPageModalShell
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      className="w-104"
    >
      <ScrollArea className="flex-1 px-6 pt-8">
        <h2
          id={titleId}
          className="text-center text-[1.25rem] font-bold leading-[1.4] text-ink-title"
        >
          {phoneTitle}
        </h2>
        <p className="mt-3 text-center text-[0.8125rem] leading-[1.6] text-ink-sub">
          알림과 본인 확인에 사용되는 번호예요.
        </p>

        <div className="mt-7">
          <span className="text-[0.8125rem] font-semibold text-ink">
            {currentLabel}
          </span>
          <div
            className={`mt-2 ${FIELD_CLASS} flex items-center bg-surface-footer text-ink-sub`}
          >
            {currentPhone || "-"}
          </div>
        </div>

        <label className="mt-5 block">
          <span className="text-[0.8125rem] font-semibold text-ink">
            {newLabel}
          </span>
          <div className="mt-2 flex gap-2">
            <input
              type="tel"
              autoComplete="tel"
              value={nextPhone}
              onChange={(e) => {
                setNextPhone(e.target.value);
                setErrorMsg("");
              }}
              readOnly
              placeholder="010-0000-0000"
              className={`${FIELD_CLASS} bg-surface-footer text-ink-sub`}
            />
            <button
              type="button"
              onClick={sendCode}
              disabled={!canSendPhoneCode}
              className={`h-13 shrink-0 whitespace-nowrap rounded-xl px-4 text-[0.8125rem] font-semibold transition ${
                canSendPhoneCode
                  ? "bg-primary text-white hover:opacity-90"
                  : "cursor-not-allowed bg-line text-white"
              }`}
            >
              {sendLabel}
            </button>
          </div>
        </label>

        <label className="mt-5 block">
          <span className="text-[0.8125rem] font-semibold text-ink">
            인증번호
          </span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6));
              setErrorMsg("");
            }}
            placeholder="카카오톡으로 보낸 인증번호를 입력해주세요"
            className={`mt-2 ${FIELD_CLASS}`}
          />
        </label>

        {errorMsg && (
          <p className="mt-4 text-[0.8125rem] text-error">{errorMsg}</p>
        )}
      </ScrollArea>

      <div className="grid grid-cols-2 gap-2 px-6 py-5">
        <button
          type="button"
          onClick={onClose}
          className="h-12 rounded-xl bg-surface-footer text-[0.875rem] font-semibold text-ink-sub transition hover:bg-line/30"
        >
          취소
        </button>
        <button
          type="button"
          onClick={verifyCode}
          disabled={code.trim().length !== 6 || verifying}
          className={`h-12 rounded-xl text-[0.875rem] font-semibold text-white transition ${
            code.trim().length === 6 && !verifying
              ? "bg-primary hover:opacity-90"
              : "cursor-not-allowed bg-line"
          }`}
        >
          {verifying ? "확인 중..." : "다음"}
        </button>
      </div>
    </MyPageModalShell>
  );
}
