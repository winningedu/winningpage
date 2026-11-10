import { useCallback, useEffect, useId, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { clearAllDrafts } from "@/lib/diagnosisDraft";
import { supabase } from "@/lib/supabase";
import { isValidEmail } from "@/lib/validators";
import MyPageModalShell from "./MyPageModalShell";

// 이메일 변경 (Figma 3633:1461 입력 / 3633:1657 인증 / 3633:1853 확인 / 3633:2034 완료).
//
// ── 인증 방식 ────────────────────────────────────────────────────────
// 시안이 "인증번호 보내기 → 이메일 인증번호 입력"이라 이 레포의 가입 플로우와
// 같은 **6자리 이메일 OTP** 를 쓴다. Supabase 는 auth.updateUser({ email }) 을
// 부르면 변경 확인 메일을 보내고, 그 코드를 verifyOtp({ type: 'email_change' })
// 로 검증하면 변경이 확정된다.
//
// ⚠ 대시보드 설정 의존 — Authentication → Emails → **Change Email Address**
// 템플릿이 `{{ .Token }}` 을 써야 이 화면이 성립한다. `{{ .ConfirmationURL }}`
// 만 있으면 사용자가 링크를 눌러 버려서 이 화면으로 돌아오지 않는다(가입
// 플로우가 겪은 것과 같은 함정 — sql/README.md "Supabase Auth 대시보드 설정").
// 또한 "Secure email change"가 켜져 있으면 **기존 주소로도** 확인이 필요해
// 코드가 두 번 온다. 운영 반영 전에 두 설정을 확인할 것.
//
// ⚠ 시안 오타 2건 —
//   · 입력 단계 라벨이 '새 이메일 번호'(→ '새 이메일')
//   · 인증 단계의 새 이메일 값이 '010-4321-4321'(전화번호 변경 화면에서 복사된
//     흔적)이고 안내가 '이메일으로'(→ '이메일로')
//
// profiles.email 도 함께 갱신한다 — 앱은 auth 가 아니라 profiles.email 을
// 읽어 화면에 뿌린다(MyPage.queryProfile). 갱신하지 않으면 변경 후에도 옛
// 주소가 계속 보인다.
const FIELD_CLASS =
  "h-13 w-full rounded-xl border border-line px-4 text-[0.9375rem] text-ink outline-hidden focus:border-accent";

type ChangeEmailModalProps = {
  open: boolean;
  currentEmail?: string;
  profileId?: string;
  onClose: () => void;
  onChanged?: (email: string) => void;
};

export default function ChangeEmailModal({
  open,
  currentEmail,
  profileId,
  onClose,
  onChanged,
}: ChangeEmailModalProps) {
  const titleId = useId();
  const [step, setStep] = useState<"form" | "verify" | "confirm" | "done">(
    "form",
  );
  const [nextEmail, setNextEmail] = useState("");
  const [code, setCode] = useState("");
  // 현재 비밀번호 — Secure email change 를 끈 대가를 메운다(아래 주석).
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [sent, setSent] = useState(false);
  // true = 새 주소 확인은 끝났지만 기존 주소 확인이 남아 아직 미확정.
  const [pendingOldConfirm, setPendingOldConfirm] = useState(false);
  // 화면에 보여주고 "같은 주소인지" 판정하는 기준은 **auth 의 로그인 이메일**이다.
  // 상위가 넘겨주는 currentEmail 은 profiles.email(표시용 미러)이라 확정 전
  // 변경이 남아 있거나 미러가 어긋나면 실제와 다르다 — 그 상태에서 판정하면
  // "현재와 같은 주소"를 변경 가능한 것으로 잘못 통과시키고, 서버는 보낼 게
  // 없어 인증번호가 오지 않는다(2026-08-13 실사용 신고).
  const [authEmail, setAuthEmail] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep("form");
    setNextEmail("");
    setCode("");
    setPassword("");
    setSaving(false);
    setErrorMsg("");
    setSent(false);
    setPendingOldConfirm(false);

    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (alive) setAuthEmail(data?.user?.email || "");
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  // 표시·판정 기준. auth 를 아직 못 읽었으면 미러로 임시 대체한다.
  const baseEmail = authEmail || currentEmail || "";

  const emailValid =
    isValidEmail(nextEmail) &&
    nextEmail.trim().toLowerCase() !== baseEmail.toLowerCase();
  const canSendEmailCode = emailValid && Boolean(password) && !saving;

  // 인증번호 발송 — updateUser({ email }) 이 곧 발송 트리거다.
  const sendCode = useCallback(async () => {
    if (saving || !emailValid || !password) return;
    setSaving(true);
    setErrorMsg("");

    // 발송 직전 한 번 더 본다 — 모달을 열어둔 사이에 다른 탭에서 바뀌었을 수 있다.
    const { data: fresh } = await supabase.auth.getUser();
    const liveEmail = fresh?.user?.email || baseEmail;
    if (
      liveEmail &&
      liveEmail.toLowerCase() === nextEmail.trim().toLowerCase()
    ) {
      setAuthEmail(liveEmail);
      setSaving(false);
      setErrorMsg("지금 쓰고 있는 이메일이에요. 다른 주소를 입력해 주세요.");
      return;
    }

    // 본인 확인 — Supabase 의 "Secure email change"를 껐기 때문에(2026-08-13)
    // 기존 주소 확인 단계가 사라졌다. 그대로 두면 **로그인 세션만 탈취해도**
    // 계정 이메일을 바꿔 계정을 통째로 가져갈 수 있다(비밀번호 재설정 메일이
    // 새 주소로 가므로 원 주인은 복구 수단을 잃는다). 비밀번호를 한 번 물어
    // 그 공백을 메운다 — ChangePasswordModal 과 같은 방식이다.
    if (!liveEmail) {
      setSaving(false);
      setErrorMsg("로그인 정보를 확인할 수 없어요. 다시 로그인해 주세요.");
      return;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: liveEmail,
      password,
    });
    if (authError) {
      console.error("본인 확인 실패:", authError);
      setSaving(false);
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

    const { error } = await supabase.auth.updateUser({
      email: nextEmail.trim(),
    });
    setSaving(false);

    if (error) {
      console.error("이메일 변경 요청 실패:", error);
      setErrorMsg(
        /already|registered|exists/i.test(error.message || "")
          ? "이미 사용 중인 이메일이에요."
          : "인증번호 발송에 실패했어요. 잠시 후 다시 시도해 주세요.",
      );
      return;
    }

    setSent(true);
    setStep("verify");
    // password·baseEmail 을 빠뜨리면 초기값(빈 문자열)을 붙든 오래된 클로저가
    // 남아, 첫 줄 가드(!password)에 걸려 **아무 반응 없이** 끝난다. 버튼은
    // 현재 렌더의 password 로 활성/비활성을 정하므로 눌리기는 하는데 실행만
    // 되지 않아 "에러도 안 뜨고 아무 일도 없는" 상태가 된다(2026-08-13 신고).
  }, [saving, emailValid, nextEmail, password, baseEmail]);

  // 코드 검증 → 변경 확정.
  const verify = useCallback(async () => {
    if (saving || code.trim().length === 0) return;
    setSaving(true);
    setErrorMsg("");

    const { error } = await supabase.auth.verifyOtp({
      email: nextEmail.trim(),
      token: code.trim(),
      type: "email_change",
    });

    if (error) {
      console.error("이메일 인증 실패:", error);
      setSaving(false);
      setErrorMsg("인증번호가 올바르지 않거나 만료됐어요.");
      return;
    }

    // 코드 검증이 통과해도 변경이 **확정되지 않을 수 있다** — 대시보드의
    // "Secure email change"가 켜져 있으면 기존 주소에서도 확인해야 최종
    // 반영된다(그래서 메일이 두 통 간다). 그 상태에서 profiles.email 을 먼저
    // 갱신하면 auth 이메일과 갈라져, 화면은 새 주소인데 로그인은 옛 주소로
    // 해야 하는 상태가 된다. 그러니 auth 를 다시 읽어 실제로 바뀌었는지
    // 확인한 뒤에만 미러를 갱신한다.
    const { data: fresh } = await supabase.auth.getUser();
    const applied =
      String(fresh?.user?.email || "").toLowerCase() ===
      nextEmail.trim().toLowerCase();

    if (applied && profileId) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          email: nextEmail.trim().toLowerCase(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", profileId);
      if (profileError)
        console.warn("profiles.email 갱신 실패:", profileError.message);
    }

    setSaving(false);
    setPendingOldConfirm(!applied);
    setStep("done");
    if (applied) onChanged?.(nextEmail.trim());
  }, [saving, code, nextEmail, profileId, onChanged]);

  // 변경 확정 후 재로그인 강제 — 권한 판정 문제는 아니다(서버는 auth.getUser 로
  // 라이브 이메일을 읽고, is_winning_admin/adminAuth 모두 id 분기로 통과한다).
  // 목적은 두 가지: 다른 기기의 refresh 토큰을 끊어 옛 이메일로 로그인하던
  // 기기를 정리하고, 이 기기도 새 이메일 세션으로 확실히 갈아탄다.
  // signOut 실패는 무시한다 — 로컬 세션 제거만 실패할 수 있는데, 어차피
  // 전체 리로드로 로그인 화면에 가면 이어서 쓸 수 없다.
  const relogin = useCallback(async () => {
    // 공용 PC에 학습진단 초안(성적, 목표 학교)이 남지 않게 함께 지운다.
    clearAllDrafts();
    try {
      await supabase.auth.signOut();
    } catch (signOutError) {
      console.warn("이메일 변경 후 로그아웃 실패:", signOutError);
    }
    window.location.replace("/login");
  }, []);

  if (!open) return null;

  if (step === "done") {
    return (
      <MyPageModalShell
        open={open}
        onClose={pendingOldConfirm ? onClose : relogin}
        labelledBy={titleId}
        className="w-104"
      >
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <h2
            id={titleId}
            className="text-[1.25rem] font-bold leading-[1.4] text-ink-title"
          >
            {pendingOldConfirm
              ? "기존 이메일에서도 확인해주세요"
              : "변경이 완료됐어요"}
          </h2>
          {pendingOldConfirm ? (
            // ⚠ 신규 카피 — 승인 필요. "Secure email change"가 켜져 있을 때만 나온다.
            <p className="mt-4 break-keep text-[0.875rem] leading-[1.6] text-ink-sub">
              보안 설정 때문에 기존 이메일로도 확인 메일이 갔어요.
              <br />그 메일까지 확인해야 변경이 완료돼요.
            </p>
          ) : (
            // ⚠ 신규 카피 — 승인 필요. 재로그인을 강제하는 이유는 relogin 주석 참고.
            <p className="mt-4 break-keep text-[0.875rem] leading-[1.6] text-ink-sub">
              보안을 위해 새 이메일로 다시 로그인해주세요.
            </p>
          )}
          <button
            type="button"
            onClick={pendingOldConfirm ? onClose : relogin}
            className="mt-7 h-10 w-37.5 rounded-lg bg-primary text-[0.875rem] font-semibold text-white transition hover:opacity-90"
          >
            {pendingOldConfirm ? "확인" : "다시 로그인하기"}
          </button>
        </div>
      </MyPageModalShell>
    );
  }

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
            이메일이 {nextEmail.trim()}으로 변경돼요.
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
              onClick={verify}
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

  // form / verify 두 단계는 이메일 입력칸(수정 가능 ↔ 읽기전용)과 본인확인
  // 방식(비밀번호 ↔ 인증코드)이 뒤바뀌어 사실상 서로 다른 화면이다 — confirm/done
  // 처럼 단계별로 완전히 갈라서 렌더한다(같은 파일 안 기존 관례).
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
            이메일을 변경해요
          </h2>
          <p className="mt-3 text-center text-[0.8125rem] leading-[1.6] text-ink-sub">
            결제 영수증이 이 주소로 발송돼요.
          </p>

          <div className="mt-7">
            <span className="text-[0.8125rem] font-semibold text-ink">
              현재 이메일
            </span>
            <div
              className={`mt-2 ${FIELD_CLASS} flex items-center bg-surface-footer text-ink-sub`}
            >
              {baseEmail || "-"}
            </div>
          </div>

          <label className="mt-5 block">
            {/* 시안 라벨 '새 이메일 번호' → 복붙 오타로 판단해 고쳤다(상단 주석). */}
            <span className="text-[0.8125rem] font-semibold text-ink">
              새 이메일
            </span>
            <div className="mt-2 flex gap-2">
              <input
                type="email"
                autoComplete="email"
                value={nextEmail}
                onChange={(e) => {
                  setNextEmail(e.target.value);
                  setErrorMsg("");
                }}
                placeholder="example@email.com"
                className={FIELD_CLASS}
              />
              <button
                type="button"
                onClick={sendCode}
                disabled={!canSendEmailCode}
                className={`h-13 shrink-0 whitespace-nowrap rounded-xl px-4 text-[0.8125rem] font-semibold transition ${
                  canSendEmailCode
                    ? "bg-primary text-white hover:opacity-90"
                    : "cursor-not-allowed bg-line text-white"
                }`}
              >
                {sent ? "다시 보내기" : "인증번호 보내기"}
              </button>
            </div>
          </label>

          {/* ⚠ 시안에 없는 필드 — 승인 필요. 추가한 이유는 sendCode 의 본인 확인 주석 참고. */}
          <label className="mt-5 block">
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
            disabled
            className="h-12 rounded-xl text-[0.875rem] font-semibold text-white transition cursor-not-allowed bg-line"
          >
            변경하기
          </button>
        </div>
      </MyPageModalShell>
    );
  }

  // ── 인증번호(step === "verify") ──────────────────────────────────────
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
          이메일을 변경해요
        </h2>
        <p className="mt-3 text-center text-[0.8125rem] leading-[1.6] text-ink-sub">
          결제 영수증이 이 주소로 발송돼요.
        </p>

        <div className="mt-7">
          <span className="text-[0.8125rem] font-semibold text-ink">
            현재 이메일
          </span>
          <div
            className={`mt-2 ${FIELD_CLASS} flex items-center bg-surface-footer text-ink-sub`}
          >
            {baseEmail || "-"}
          </div>
        </div>

        <label className="mt-5 block">
          <span className="text-[0.8125rem] font-semibold text-ink">
            새 이메일
          </span>
          <div className="mt-2 flex gap-2">
            <input
              type="email"
              autoComplete="email"
              value={nextEmail}
              onChange={(e) => {
                setNextEmail(e.target.value);
                setErrorMsg("");
              }}
              readOnly
              placeholder="example@email.com"
              className={`${FIELD_CLASS} bg-surface-footer text-ink-sub`}
            />
            <button
              type="button"
              onClick={sendCode}
              disabled={!canSendEmailCode}
              className={`h-13 shrink-0 whitespace-nowrap rounded-xl px-4 text-[0.8125rem] font-semibold transition ${
                canSendEmailCode
                  ? "bg-primary text-white hover:opacity-90"
                  : "cursor-not-allowed bg-line text-white"
              }`}
            >
              {sent ? "다시 보내기" : "인증번호 보내기"}
            </button>
          </div>
        </label>

        <label className="mt-5 block">
          <span className="text-[0.8125rem] font-semibold text-ink">
            이메일 인증번호
          </span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setErrorMsg("");
            }}
            placeholder="이메일로 보낸 인증번호를 입력해주세요"
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
          onClick={() => setStep("confirm")}
          disabled={code.trim().length === 0 || saving}
          className={`h-12 rounded-xl text-[0.875rem] font-semibold text-white transition ${
            code.trim().length > 0 && !saving
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
