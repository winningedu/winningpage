// 주간 목표시간 달성율. 퍼센트와 막대(단계 색). 목표를 쓰지 않는 학생은 "-".

import { cn } from "@/lib/utils";
import type { StudentRow } from "./types";

// 달성율 3단계 색(교 #31). 단계는 서버가 정한다.
const LEVEL_COLOR = {
  low: "bg-[#f2a7a7]",
  mid: "bg-[#ff8a65]",
  high: "bg-[#81c784]",
} as const;

export default function RateCell({ row }: { row: StudentRow }) {
  if (row.weeklyGoalRate === null || row.weeklyGoalLevel === null) {
    return (
      <span data-testid="rate-empty" className="text-app-label text-ink-sub">
        -
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <span className="text-app-label font-semibold text-ink-strong">{`${row.weeklyGoalRate}%`}</span>
      <span className="h-2 w-[6.875rem] rounded-full bg-surface-muted">
        <span
          className={cn(
            "block h-full rounded-full",
            LEVEL_COLOR[row.weeklyGoalLevel],
          )}
          style={{ width: `${Math.min(row.weeklyGoalRate, 100)}%` }}
        />
      </span>
    </span>
  );
}
