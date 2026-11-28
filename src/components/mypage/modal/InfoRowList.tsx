import { Fragment, type ReactNode } from "react";

// 마이페이지 결제 탭 모달의 라벨-값 정보 행 리스트 — 원래 PaymentDetailModal ≡
// StudentRequestDetailModal이 각자 그리던 dt/dd 마크업(border-b border-line/60
// py-3.75)을 공용화한 것이다. 2026-09-01 형식 통일로 후자는 PaymentDetailModal의
// asStudent 모드로 흡수됐지만, 행 하나만 렌더하는 이 컴포넌트의 역할은 그대로다.
//
// 자체 <dl> 래퍼를 렌더하지 않는다 — 호출부(PaymentDetailModal)가 이 행들과
// OrderAmountBreakdown을 같은 <dl> 안에 함께 넣어야 해서, 래퍼는 호출부가
// 소유하고 여기서는 행(dt/dd 쌍)만 내려준다.

type InfoRow = {
  key?: string;
  label: string;
  value: ReactNode;
};

type InfoRowListProps = {
  rows: InfoRow[];
};

export default function InfoRowList({ rows }: InfoRowListProps) {
  return (
    <Fragment>
      {rows.map((row, i) => (
        <div
          key={row.key ?? `${row.label}-${i}`}
          className="flex items-center justify-between gap-4 border-b border-line/60 py-3.75"
        >
          <dt className="shrink-0 text-[0.875rem] text-ink-sub">{row.label}</dt>
          <dd
            className="truncate text-right text-[0.875rem] text-ink-strong"
            title={typeof row.value === "string" ? row.value : undefined}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </Fragment>
  );
}
