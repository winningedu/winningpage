// 회원 탈퇴 모달(QA #2) — ProfileTab 하단 "회원탈퇴" 링크에서 연다.
// 시안(3762:20560 비활성 / 3762:20898 활성) 실측: 사유 7개 박스형 라디오 목록, '기타 사유'
// 선택 시 한 줄 입력 노출, 분홍 경고 박스, 하단 취소/탈퇴 진행 버튼. 사유 미선택(또는 '기타
// 사유' 선택 후 입력 없음) 상태에서는 탈퇴 진행 버튼이 회색 비활성, 그 외엔 빨강 활성.
//
// 사유 4번째 항목은 원본 PNG에 "서서비 이용이 불편해서"로 판독되나 "서비스"의 중복 오타로
// 보여 "서비스 이용이 불편해서"로 교정했다 — 디자이너 확인 필요.
//
// 2단계 확인(QA 시트 지시) — 사유 선택 화면 자체는 위 시안을 그대로 두고, "탈퇴 진행"을
// 누르면 그 뒤에 안내(notice) → 최종 재확인(confirm) 두 단계를 추가로 거친다. 실제
// 삭제(api/_routes/delete-account.ts → fn_delete_account)는 confirm 단계에서만 호출된다.
import { useEffect, useState } from "react";
import { apiFetch, getAuthHeader } from "@/lib/apiFetch";
import { clearAllDrafts } from "@/lib/diagnosisDraft";
import { supabase } from "@/lib/supabase";

const ETC_REASON = "기타 사유 (직접 입력)";

const REASONS = [
  "더 이상 서비스가 필요하지 않아서",
  "서비스를 자주 이용하지 않아서",
  "원하는 기능이나 콘텐츠가 부족해서",
  "서비스 이용이 불편해서",
  "다른 서비스를 이용하려고",
  "계정을 새로 만들려고",
  ETC_REASON,
];

const NOTICE =
  "회원 탈퇴 시 회원 정보와 서비스 이용 내역이 삭제되며, 이용 중인 서비스(학업 활동 및 결과 리포트 등 모두 포함)와 보유한 쿠폰·혜택도 모두 소멸됩니다. 삭제된 정보는 복구할 수 없습니다.\n※ 결제 내역 등 관계 법령에 따라 보관이 필요한 정보는 일정 기간 보관됩니다.";

// 2단계 안내 모달 문구 — QA 시트가 지정한 원문 그대로(글자 하나도 바꾸지 않는다).
const FINAL_NOTICE_TEXT =
  "탈퇴 시에 회원정보 및 학업활동, 결과리포트 등이 파기되어 복구할 수 없습니다. 신중하게 선택하여 주십시요";

type Step = "reasons" | "notice" | "confirm" | "done";

type WithdrawModalProps = {
  open: boolean;
  onClose?: () => void;
};

export default function WithdrawModal({ open, onClose }: WithdrawModalProps) {
  const [step, setStep] = useState<Step>("reasons");
  const [reason, setReason] = useState("");
  const [etcText, setEtcText] = useState("");
  const [agreeChecked, setAgreeChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // 배경 스크롤 잠금 + ESC 닫기(완료 화면에서는 ESC로 닫혀도 실질적으로 안전 — 이미
  // 탈퇴 처리가 끝난 뒤라 되돌릴 상태가 없다).
  useEffect(() => {
    if (!open) return undefined;

    const { style } = document.body;
    const previousOverflow = style.overflow;
    style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (step !== "done") onClose?.();
      }
    }
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose, step]);

  if (!open) return null;

  const canSubmitReason =
    Boolean(reason) && (reason !== ETC_REASON || etcText.trim().length > 0);

  function resetState() {
    setStep("reasons");
    setReason("");
    setEtcText("");
    setAgreeChecked(false);
    setSubmitting(false);
    setErrorMsg("");
  }

  function closeAndReset() {
    resetState();
    onClose?.();
  }

  async function handleFinalWithdraw() {
    if (!agreeChecked || submitting) return;
    setSubmitting(true);
    setErrorMsg("");

    const authHeader = await getAuthHeader();
    if (!authHeader) {
      setSubmitting(false);
      setErrorMsg("로그인 정보를 확인할 수 없어요. 다시 로그인해 주세요.");
      return;
    }

    try {
      const res = await apiFetch("/api/delete-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        // 탈퇴 사유는 참고용 — 서버는 신원 확인만 토큰으로 하고 사유는 저장하지
        // 않는다(정책상 사유 보존 테이블이 없다, 판단 필요 시 후속 작업).
        body: JSON.stringify({
          reason: reason === ETC_REASON ? etcText.trim() : reason,
        }),
      });
      const payload = await res.json();

      if (!res.ok || !payload?.ok) {
        setSubmitting(false);
        setErrorMsg(
          payload?.detail ||
            "탈퇴 처리에 실패했어요. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }

      // 공용 PC에 탈퇴한 계정의 학습진단 초안이 남지 않게 지운다.
      clearAllDrafts();
      await supabase.auth.signOut({ scope: "local" });
      setSubmitting(false);
      setStep("done");
    } catch (err) {
      console.error("회원 탈퇴 요청 실패:", err);
      setSubmitting(false);
      setErrorMsg("탈퇴 처리에 실패했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  function handleDoneConfirm() {
    resetState();
    onClose?.();
    // 로그아웃된 상태로 완전히 새로 렌더되도록 전체 새로고침(Header.handleLogout과
    // 동일 관용구) — 헤더·마이페이지 등에 남은 캐시된 세션 상태를 확실히 턴다.
    window.location.replace("/");
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: APG 모달 백드롭 패턴 — role="presentation"으로 이미 장식 레이어임을 명시했다. Escape는 document keydown 리스너(위)가 처리한다.
    <div
      role="presentation"
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 px-4"
      onClick={step === "done" ? undefined : closeAndReset}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: onClick은 배경 클릭이 대화상자 안까지 닫지 않도록 막는 stopPropagation 가드일 뿐, 키보드로 도달할 사용자 동작이 없다. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="withdraw-modal-title"
        className="w-full max-w-104 rounded-perf-modal bg-white p-6 shadow-[0_24px_60px_rgba(0,0,0,0.24)]"
        onClick={(e) => e.stopPropagation()}
      >
        {step === "reasons" && (
          <>
            <h2
              id="withdraw-modal-title"
              className="text-center text-xl font-bold text-ink-title"
            >
              회원 탈퇴 사유를 작성해주세요
            </h2>

            <div className="mt-5 flex flex-col gap-2">
              {REASONS.map((item) => {
                const selected = reason === item;
                return (
                  <label
                    key={item}
                    className={`flex h-13 cursor-pointer items-center gap-3 rounded-xl border px-4 transition ${
                      selected ? "border-accent bg-surface-info" : "border-line"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                        selected ? "border-accent" : "border-line"
                      }`}
                    >
                      {selected && (
                        <span className="h-2.5 w-2.5 rounded-full bg-accent" />
                      )}
                    </span>
                    <input
                      type="radio"
                      name="withdraw-reason"
                      value={item}
                      checked={selected}
                      onChange={() => setReason(item)}
                      className="sr-only"
                    />
                    <span className="text-sm text-ink">{item}</span>
                  </label>
                );
              })}

              {reason === ETC_REASON && (
                <input
                  type="text"
                  value={etcText}
                  onChange={(e) => setEtcText(e.target.value)}
                  placeholder="탈퇴 사유를 직접 입력해주세요"
                  className="h-13 w-full rounded-xl border border-line px-4 text-sm text-ink outline-hidden focus:border-accent"
                />
              )}
            </div>

            <div className="mt-5 whitespace-pre-line rounded-xl bg-[#FCEAEE] px-4 py-3 text-xs leading-relaxed text-[#D6336C]">
              {NOTICE}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeAndReset}
                className="h-12 rounded-xl bg-surface-footer text-sm font-semibold text-ink-sub transition hover:bg-line/30"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => setStep("notice")}
                disabled={!canSubmitReason}
                className={`h-12 rounded-xl text-sm font-semibold text-white transition ${
                  canSubmitReason
                    ? "bg-error hover:bg-error/90"
                    : "cursor-not-allowed bg-line"
                }`}
              >
                탈퇴 진행
              </button>
            </div>
          </>
        )}

        {step === "notice" && (
          <>
            <h2
              id="withdraw-modal-title"
              className="text-center text-xl font-bold text-ink-title"
            >
              정말 탈퇴하시겠어요?
            </h2>

            <div className="mt-5 whitespace-pre-line rounded-xl bg-[#FCEAEE] px-4 py-4 text-sm leading-relaxed text-[#D6336C]">
              {FINAL_NOTICE_TEXT}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeAndReset}
                className="h-12 rounded-xl bg-surface-footer text-sm font-semibold text-ink-sub transition hover:bg-line/30"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => setStep("confirm")}
                className="h-12 rounded-xl bg-error text-sm font-semibold text-white transition hover:bg-error/90"
              >
                다음
              </button>
            </div>
          </>
        )}

        {step === "confirm" && (
          <>
            <h2
              id="withdraw-modal-title"
              className="text-center text-xl font-bold text-ink-title"
            >
              최종 확인
            </h2>

            <p className="mt-3 text-center text-sm text-ink-sub">
              위 안내 내용을 모두 확인했습니다.
            </p>

            <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-xl border border-line px-4 py-3">
              <input
                type="checkbox"
                checked={agreeChecked}
                onChange={(e) => setAgreeChecked(e.target.checked)}
                className="h-5 w-5 shrink-0 accent-error"
              />
              <span className="text-sm text-ink">
                안내 내용을 확인했으며, 탈퇴에 동의합니다.
              </span>
            </label>

            {errorMsg && (
              <div className="mt-4 rounded-xl bg-[#FCEAEE] px-4 py-3 text-xs text-[#D6336C]">
                {errorMsg}
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeAndReset}
                disabled={submitting}
                className="h-12 rounded-xl bg-surface-footer text-sm font-semibold text-ink-sub transition hover:bg-line/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleFinalWithdraw}
                disabled={!agreeChecked || submitting}
                className={`h-12 rounded-xl text-sm font-semibold text-white transition ${
                  agreeChecked && !submitting
                    ? "bg-error hover:bg-error/90"
                    : "cursor-not-allowed bg-line"
                }`}
              >
                {submitting ? "처리 중..." : "탈퇴하기"}
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <>
            <h2
              id="withdraw-modal-title"
              className="text-center text-xl font-bold text-ink-title"
            >
              탈퇴가 완료됐어요
            </h2>
            <p className="mt-3 text-center text-sm text-ink-sub">
              그동안 위닝에듀를 이용해 주셔서 감사합니다.
            </p>
            <button
              type="button"
              onClick={handleDoneConfirm}
              className="mt-6 h-12 w-full rounded-xl bg-primary text-sm font-semibold text-white transition hover:opacity-90"
            >
              확인
            </button>
          </>
        )}
      </div>
    </div>
  );
}
