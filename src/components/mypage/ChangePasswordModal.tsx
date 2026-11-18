import { useCallback, useEffect, useId, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePwnedPasswordCheck } from "@/hooks/usePwnedPasswordCheck";
import { PWNED_PASSWORD_MESSAGE } from "@/lib/pwnedPassword";
import { supabase } from "@/lib/supabase";
import MyPageModalShell from "./MyPageModalShell";

// 비밀번호 변경 (Figma 3633:2219 입력 / 3633:2611 확인 / 3633:2792 완료).
//
// 3단계 — 입력 → "정말 변경하시겠어요?" → "변경이 완료됐어요".
//
// ── 현재 비밀번호 확인 방법 ──────────────────────────────────────────
// Supabase 의 auth.updateUser({ password }) 는 **현재 비밀번호를 검사하지
// 않는다**(세션만 유효하면 통과). 시안이 현재 비밀번호를 받는 이유는 자리를
// 비운 사이 남이 바꾸는 것을 막기 위해서이므로, 그 검사를 우리가 해야 한다.
// 같은 계정으로 signInWithPassword 를 한 번 태워서 맞는지 확인한다 — 성공하면
// 같은 사용자의 세션이 갱신될 뿐이라 로그인 상태가 깨지지 않는다.
//
// ⚠ 시안 라벨 오타 — 새 비밀번호 입력칸의 라벨이 '새 휴대폰 번호'로 되어
// 있다(전화번호 변경 화면에서 복사된 흔적). '새 비밀번호'로 고쳐 썼다.
//
// 최소 길이는 **6자**다(2026-08-13 사용자 확정). 시안(3633:2219)에는 '8자
// 이상'으로 적혀 있으나 가입 폼(ParentForm.jsx PASSWORD_REGEX)이 6자라 그쪽에
// 맞춘다 — 8자로 올리면 가입 때 6자로 만든 사람이 같은 비밀번호를 다시 설정할
// 수 없고, 두 화면이 서로 다른 규칙을 말하게 된다. 규칙을 바꿀 일이 생기면
// 가입 폼과 이 상수를 **함께** 고칠 것.
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;
const PASSWORD_HINT = "영문·숫자·특수문자 포함 6자 이상";

const FIELD_CLASS =
  "h-13 w-full rounded-xl border border-line px-4 text-[0.9375rem] text-ink outline-hidden focus:border-accent";

type ChangePasswordModalProps = {
  open: boolean;
  email?: string;
  onClose: () => void;
  onChanged?: () => void;
};

export default function ChangePasswordModal({
  open,
  email,
  onClose,
  onChanged,
}: ChangePasswordModalProps) {
  const titleId = useId();
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const pwnedCheck = usePwnedPasswordCheck();
  const { reset: resetPwned } = pwnedCheck;

  useEffect(() => {
    if (!open) return;
    resetPwned();
    setStep("form");
    setCurrent("");
    setNext("");
    setSaving(false);
    setErrorMsg("");
  }, [open, resetPwned]);

  const nextValid = PASSWORD_REGEX.test(next);
  const canProceed = current.length > 0 && nextValid && !saving;

  const submit = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setErrorMsg("");

    // 1) 현재 비밀번호 확인(위 주석 참고).
    //
    // 로그인 이메일은 **세션에서 직접** 읽는다. 상위가 넘겨주는 값은
    // profiles.email(프로필 미러)이라 auth 의 로그인 이메일과 다를 수 있고,
    // 다르면 비밀번호가 맞아도 invalid_credentials 로 떨어져 "현재 비밀번호가
    // 틀렸다"는 잘못된 안내를 하게 된다(2026-08-13 실사용 신고 — 400
    // invalid_credentials). 미러는 화면 표시용이지 인증용 식별자가 아니다.
    const { data: sessionUser } = await supabase.auth.getUser();
    const authEmail = sessionUser?.user?.email || email;

    if (!authEmail) {
      setSaving(false);
      setStep("form");
      setErrorMsg("로그인 정보를 확인할 수 없어요. 다시 로그인해 주세요.");
      return;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: current,
    });
    if (authError) {
      console.error("현재 비밀번호 확인 실패:", authError);
      setSaving(false);
      setStep("form");
      // 인증 오류를 전부 "비밀번호 불일치"로 뭉개면 안 된다 — 실제로는 맞게
      // 입력했는데 레이트리밋(429)에 걸린 경우가 있고, 그때 "비밀번호가 틀렸다"고
      // 하면 사용자는 맞는 비밀번호를 계속 의심하며 재시도한다(2026-08-13 실사용
      // 신고). 상태 코드로 갈라서 실제 사유를 말한다.
      if (authError.status === 429) {
        setErrorMsg("시도가 너무 많았어요. 잠시 후 다시 시도해 주세요.");
      } else if (
        authError.status === 400 ||
        /invalid|credential/i.test(authError.message || "")
      ) {
        setErrorMsg("현재 비밀번호가 일치하지 않아요.");
      } else {
        setErrorMsg("본인 확인에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }
      return;
    }

    // 2) 실제 변경.
    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) {
      console.error("비밀번호 변경 실패:", error);
      setSaving(false);
      setStep("form");
      // Supabase 는 "새 비밀번호가 기존과 같음"을 별도 코드로 주지 않아 메시지
      // 키워드로만 구분한다. 실제 문구는 "New password should be different from
      // the old password." 라 'same' 만 보면 걸리지 않는다 — 두 표현을 함께 본다.
      const raw = error.message || "";
      if (/same|different from the old/i.test(raw)) {
        setErrorMsg("기존과 다른 비밀번호를 입력해주세요.");
      } else if (error.status === 429) {
        setErrorMsg("시도가 너무 많았어요. 잠시 후 다시 시도해 주세요.");
      } else if (/reauthentication/i.test(raw)) {
        // 대시보드에서 "Secure password change"를 켜면 nonce 재인증을 요구한다.
        // 이 화면은 그 흐름을 구현하지 않았으므로 원인을 그대로 알린다.
        setErrorMsg(
          "보안 설정 때문에 이 화면에서 변경할 수 없어요. 고객센터로 문의해 주세요.",
        );
      } else {
        setErrorMsg("비밀번호 변경에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }
      return;
    }

    // 3) 다른 기기 로그아웃 — 시안 문구("변경 후 모든 기기에서 다시 로그인해야
    //    해요")를 실제로 성립시킨다. 실패해도 변경 자체는 이미 끝났으므로
    //    사용자 흐름을 막지 않는다.
    try {
      await supabase.auth.signOut({ scope: "others" });
    } catch (revokeError) {
      console.warn("다른 기기 세션 종료 실패:", revokeError);
    }

    setSaving(false);
    setStep("done");
    onChanged?.();
  }, [saving, email, current, next, onChanged]);

  if (!open) return null;

  // ── 완료 ────────────────────────────────────────────────────────────
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

  // ── 확인 ────────────────────────────────────────────────────────────
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
          <p className="mt-4 whitespace-pre-line break-keep text-[0.875rem] leading-[1.6] text-ink-sub">
            {
              "비밀번호가 새 비밀번호로 변경돼요.\n변경 후 모든 기기에서 다시 로그인해야 해요."
            }
          </p>

          <div className="mt-7 grid w-full grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setStep("form")}
              className="h-12 rounded-xl bg-surface-footer text-[0.875rem] font-semibold text-ink-sub transition hover:bg-line/30"
            >
              취소
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="h-12 rounded-xl bg-primary text-[0.875rem] font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "변경 중..." : "변경할게요"}
            </button>
          </div>
        </div>
      </MyPageModalShell>
    );
  }

  // ── 입력 ────────────────────────────────────────────────────────────
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
          비밀번호를 변경해요
        </h2>

        <label className="mt-7 block">
          <span className="text-[0.8125rem] font-semibold text-ink">
            현재 비밀번호
          </span>
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              setErrorMsg("");
            }}
            placeholder="현재 비밀번호를 입력해주세요"
            className={`mt-2 ${FIELD_CLASS}`}
          />
          <span className="mt-2 block text-[0.75rem] text-ink-sub">
            본인 확인을 위해 지금 쓰는 비밀번호를 입력해주세요
          </span>
        </label>

        <label className="mt-5 block">
          {/* 시안 라벨은 '새 휴대폰 번호'지만 복붙 오타로 판단해 고쳤다(상단 주석). */}
          <span className="text-[0.8125rem] font-semibold text-ink">
            새 비밀번호
          </span>
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => {
              setNext(e.target.value);
              setErrorMsg("");
              pwnedCheck.reset();
            }}
            onBlur={() => {
              if (nextValid) pwnedCheck.checkOnBlur(next);
            }}
            placeholder="새 비밀번호 입력"
            className={`mt-2 ${FIELD_CLASS}`}
          />
          <span
            className={`mt-2 block text-[0.75rem] ${
              pwnedCheck.pwned || (next && !nextValid)
                ? "text-error"
                : "text-ink-sub"
            }`}
          >
            {pwnedCheck.pwned ? PWNED_PASSWORD_MESSAGE : PASSWORD_HINT}
          </span>
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
          onClick={() => setStep("confirm")}
          disabled={!canProceed}
          className={`h-12 rounded-xl text-[0.875rem] font-semibold text-white transition ${
            canProceed
              ? "bg-primary hover:opacity-90"
              : "cursor-not-allowed bg-line"
          }`}
        >
          변경하기
        </button>
      </div>
    </MyPageModalShell>
  );
}
