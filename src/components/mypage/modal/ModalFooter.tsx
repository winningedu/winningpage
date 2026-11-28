import type { ReactNode } from "react";

// 마이페이지 결제 탭 모달 공용 푸터 — 방언A 규격(grid full-width h-12 rounded-xl
// 버튼, px-6 py-5, 구분선 없음)을 부품화한다. RefundApprovalModal 등 6개 모달이
// 각자 그리던 버튼 그리드를 여기로 모았다(그 파일들 참고, 마크업 1:1).

type ModalFooterButtonVariant =
  | "neutral"
  | "primary"
  | "destructive"
  | "destructive-outline";

type ModalFooterButton = {
  key?: string;
  label: ReactNode;
  onClick?: (() => void) | undefined;
  variant: ModalFooterButtonVariant;
  disabled?: boolean;
};

type ModalFooterProps = {
  buttons: ModalFooterButton[];
};

// disabled 되지 않은 상태의 배경/글자색 — variant 별 기존 클래스 그대로.
const VARIANT_CLASS: Record<ModalFooterButtonVariant, string> = {
  neutral: "bg-surface-footer text-ink-sub hover:bg-line/30",
  primary: "bg-primary text-white hover:opacity-90",
  destructive: "bg-error text-white hover:bg-error/90",
  "destructive-outline": "border border-error text-error hover:bg-error/10",
};

// Tailwind JIT는 리터럴 클래스 문자열만 스캔한다 — `grid-cols-${n}` 같은 동적
// 조합은 클래스가 생성되지 않는다. 버튼 1~4개까지 표로 고정한다.
// 4개(PaymentDetailModal — 닫기/환불 신청/영수증 보기/현금영수증 보기가 모두
// 뜨는 조합, QA 시트 행310)는 2x2로 접는다 — 나머지와 같은 grid-cols-N 한 줄
// 규칙을 유지하면 버튼이 지나치게 좁아진다.
const COLS_CLASS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-2",
};

export default function ModalFooter({ buttons }: ModalFooterProps) {
  return (
    <div
      className={`grid gap-2 px-6 py-5 ${COLS_CLASS[buttons.length] ?? "grid-cols-1"}`}
    >
      {buttons.map((btn, i) => (
        <button
          key={btn.key ?? i}
          type="button"
          onClick={btn.onClick}
          disabled={btn.disabled}
          className={`h-12 rounded-xl text-[0.875rem] font-semibold transition ${
            btn.disabled
              ? "cursor-not-allowed bg-line text-white"
              : VARIANT_CLASS[btn.variant]
          }`}
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
}
