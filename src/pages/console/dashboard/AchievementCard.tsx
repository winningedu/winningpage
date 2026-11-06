// 목표시간 달성율 카드(교 #31, #155). 이용 학생을 40% 미만, 40~69%, 70% 이상 세 단계로 나눈 인원.

import { Skeleton } from "@/components/ui/skeleton";
import { percent } from "./format";
import type { DashboardStats } from "./useDashboard";

const TILES = [
  { key: "low", label: "40% 미만", dot: "bg-level-low" },
  { key: "mid", label: "40~69%", dot: "bg-level-mid" },
  { key: "high", label: "70% 이상", dot: "bg-level-high" },
] as const;

interface AchievementCardProps {
  /** null 이면 불러오는 중(뼈대). */
  goal: DashboardStats["goal"] | null;
}

export default function AchievementCard({ goal }: AchievementCardProps) {
  return (
    <section
      aria-label="목표시간 달성율"
      className="flex flex-col gap-5 rounded-2xl bg-goal-cardTone-neutral px-4 py-7 md:px-8"
    >
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
        <h2 className="text-app-card-title font-bold text-ink-strong">
          목표시간 달성율
        </h2>
        {goal && goal.userCount > 0 && (
          <>
            <span className="ml-auto text-app-body font-semibold text-ink-strong">
              {`평균 ${goal.average}%`}
            </span>
            <span className="text-app-label text-ink-sub">
              {`목표관리 이용 ${goal.userCount}명`}
            </span>
          </>
        )}
      </div>
      {!goal && <Skeleton className="h-28 w-full rounded-xl bg-neutral-200" />}
      {goal && goal.userCount === 0 && (
        <p className="rounded-xl bg-background px-5 py-8 text-center text-app-body text-ink-sub">
          이용 학생 없음
        </p>
      )}
      {goal && goal.userCount > 0 && (
        <ul className="flex flex-col gap-4 md:flex-row">
          {TILES.map((tile) => (
            <li
              key={tile.key}
              className="flex flex-1 items-center gap-2 rounded-xl bg-background p-5 max-md:flex-wrap md:flex-col md:items-start"
            >
              <span className="flex items-center gap-2 text-app-label text-ink-sub">
                <span
                  aria-hidden
                  className={`size-2 rounded-full ${tile.dot}`}
                />
                {tile.label}
              </span>
              <span className="flex items-baseline gap-1 md:mt-0">
                <span className="text-[1.75rem] leading-[1.4] font-bold text-ink-strong">
                  {goal.buckets[tile.key]}
                </span>
                <span className="text-app-label text-ink-sub">명</span>
              </span>
              <span className="text-app-caption text-ink-sub max-md:ml-auto">
                {`이용 학생의 ${percent(goal.buckets[tile.key], goal.userCount)}%`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
