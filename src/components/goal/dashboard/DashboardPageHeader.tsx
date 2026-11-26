// 대시보드 페이지 헤더 — part-07 #20 "세로 흐름(메인)" 실측 정본(y=100~193, 헤딩 하단 기준).
// 순서: 조언 뱃지(y100, 372,100/134×32) → 같은 행 우측에 날짜 기준 텍스트(y105, 518,105/158×21)
// → 아래 헤딩 행(y151, 스파클 아이콘 + 헤딩, 372~1065×42). "오늘의 조언" 카드(y=700)와는 완전히
// 별개 블록이므로 뱃지를 그쪽 카드에 넣지 않는다(직전 작업 정정, 2026-08-10).
//
// part-06 #17/#18: 두 프레임은 뱃지 문구만 다른 동일 화면("일일 분석 조언" 115×32 / "AI 입시
// 분석 조언" 134×32) — #18 구현 노트가 명시한 대로 컴포넌트 하나 + `adviceType` prop으로 분기하고,
// 뱃지 폭은 문구 길이에 따른 hug(파란 pill, 좌우 패딩 고정)로 하드코딩하지 않는다.
import type { ReactNode } from "react";

const BADGE_LABEL: Record<string, string> = {
  daily: "일일 분석 조언",
  ai: "입시분석 조언",
};

// 스파클 아이콘(part-07 §128 "파란 스파클 아이콘 벡터 23.3×23.3 + 10×10" 근사) — 시안은 벡터 2개
// 조합이지만 별도 에셋 없이 인라인 SVG 단일 path로 재현한다. (추정)
function SparkleIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M12 2c.6 3.7 2.3 5.4 6 6-3.7.6-5.4 2.3-6 6-.6-3.7-2.3-5.4-6-6 3.7-.6 5.4-2.3 6-6z"
        fill="#3799FF"
      />
    </svg>
  );
}

// adviceType: 'daily' | 'ai' — 뱃지 문구만 갈린다. dateLabel/headline은 목업에서 주입(고정 카피 아님).
// className: 부모(Dashboard)가 그리드 배치(col/row-start)를 주입할 수 있도록 허용.
type DashboardPageHeaderProps = {
  adviceType?: "daily" | "ai";
  dateLabel?: ReactNode;
  headline?: ReactNode;
  className?: string;
};

export default function DashboardPageHeader({
  adviceType = "ai",
  dateLabel,
  headline,
  className = "",
}: DashboardPageHeaderProps) {
  const badgeLabel = BADGE_LABEL[adviceType] ?? BADGE_LABEL.ai;

  return (
    <header className={`flex flex-col gap-4.75 ${className}`.trim()}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex h-8 w-fit shrink-0 items-center rounded-full bg-action px-4 text-app-label font-semibold leading-[1.2] text-white">
          {badgeLabel}
        </span>
        <span className="text-app-body font-medium leading-[1.4] text-ink-sub">
          {dateLabel}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <SparkleIcon />
        <h1 className="text-app-title font-bold text-ink-strong">{headline}</h1>
      </div>
    </header>
  );
}
