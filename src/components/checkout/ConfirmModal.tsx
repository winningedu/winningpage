import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ConfirmModalProps = {
  title?: ReactNode;
  children?: ReactNode;
  buttonLabel?: string;
  onConfirm?: () => void;
  onClose: () => void;
  /**
   * 기본 스택(overlay z-50, 콘텐츠 z-100) 위로 올려야 하는 특수 호출부용
   * 선택적 오버라이드 — 예: 홈 프로모션 팝업(Home.tsx의 HomePopupLayer, z-9999)
   * 위에 반드시 떠야 하는 전역 안내(SessionKickGuard, 배정 메시지 "E2E 실버그"
   * 대응). z-10000으로 그 어떤 기존 페이지 레이어보다 위에 올린다.
   *
   * 기본값 false — 결제 흐름 안내 모달(ParentCheckout·StudentEnrollmentRequest)은
   * 서로 같은 스택 안에서만 겹치므로 기존 z-50/z-100 그대로 둔다(하위호환,
   * 기존 호출부는 이 prop을 생략하므로 영향 없음).
   */
  elevated?: boolean;
};

// 결제 요청 흐름 공용 안내 모달 — 학생 화면의 학부모 미연결 실패 모달
// (시안 3921:7480, StudentEnrollmentRequest.jsx)과 Pricing.jsx 의 학부모용
// "학생이 요청한 건만 결제할 수 있다" 안내 모달이 같은 구조를 쓴다(팀 리드
// 지시, 2026-08-12b — "화면 2 모달의 구조·해요체 톤을 따르라"). 시안 실측
// (3921:7480): overlay bg-black/40 전체, 카드 546×339 rounded-20, 내부
// gap-36 콘텐츠 폭 362.
//
// 버튼 동작(그냥 닫기 vs 페이지 이동)은 onConfirm 으로 호출부가 정한다 —
// 생략하면 onClose 와 동일하게 닫기만 한다.
//
// open prop이 없다 — 마운트 자체가 열림이다(조건부 렌더는 호출부 소유). Dialog는
// 항상 open으로 두고, ESC·배경 클릭으로 닫히려는 요청(Base UI 내장 처리)만 onClose로
// 흘려보낸다. ESC/포커스 트랩/스크롤 잠금은 shadcn Dialog(Base UI)가 내장 제공한다.
export default function ConfirmModal({
  title,
  children,
  buttonLabel = "확인",
  onConfirm,
  onClose,
  elevated = false,
}: ConfirmModalProps) {
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPortal>
        <DialogOverlay className={cn("bg-black/40", elevated && "z-10000")} />
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          // Base UI Popup은 aria-modal을 자동 배선하지 않는다 — 리터럴로 명시.
          aria-modal="true"
          className={cn(
            "fixed top-1/2 left-1/2 z-100 flex w-[min(calc(100%-2.5rem),34.125rem)] -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-perf-modal bg-white px-6 py-10 shadow-2xl outline-none lg:h-84.75 lg:justify-center lg:px-0 lg:py-0",
            elevated && "z-10000",
          )}
        >
          <div className="mx-auto flex w-full max-w-90.5 flex-col items-center gap-9 text-center">
            <DialogTitle className="text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.03rem] text-ink">
              {title}
            </DialogTitle>
            <p className="text-[1rem] font-normal leading-[1.3] tracking-[-0.02rem] text-ink-sub">
              {children}
            </p>
            <button
              type="button"
              onClick={onConfirm || onClose}
              className="flex h-10 w-44.75 shrink-0 items-center justify-center rounded-lg bg-primary text-[1rem] font-semibold text-white transition hover:brightness-125"
            >
              {buttonLabel}
            </button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
