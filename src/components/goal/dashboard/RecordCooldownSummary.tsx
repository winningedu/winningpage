import GoalProgressBar from "@/components/goal/GoalProgressBar";
import type {
  GoalRecordCooldown,
  GoalRecordSummary,
  GoalTomorrowTargets,
} from "@/lib/goalApi";
import { formatCooldownUnlockLabel } from "@/lib/goalPlanUtils";

// QA3 행305 — 12시간 쿨다운 중(cooldown.active) 입력 폼 대신 보여주는 요약 패널.
// "오늘의 공부 기록" 페이지(DailyRecord.tsx)와 대시보드 "오늘의 목표" 카드
// (TodayGoalCard.tsx) 둘 다 같은 GET /api/goal/daily-record 응답(cooldown/
// summary/tomorrowTargets)을 쓰므로 컴포넌트를 공유한다 — 잠금 문구·수식이
// 두 곳에서 어긋나지 않게 한다.

function formatHours(hours: number) {
  return (Math.round(hours * 10) / 10).toFixed(1);
}

/** 확률 변화 — null(정시 미산출 등)은 렌더하지 않는다(설계 문서 §5(c) 규칙). */
function formatDeltaPct(value: number | null) {
  if (value === null) return null;
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%p`;
}

type RecordCooldownSummaryProps = {
  cooldown: GoalRecordCooldown;
  summary: GoalRecordSummary | null;
  tomorrowTargets: GoalTomorrowTargets;
  /** 학생 시간대(GET /api/goal/student timeZone). */
  timeZone: string;
  className?: string;
};

export default function RecordCooldownSummary({
  cooldown,
  summary,
  tomorrowTargets,
  timeZone,
  className = "",
}: RecordCooldownSummaryProps) {
  const idealDeltaLabel = summary
    ? formatDeltaPct(summary.deltaIdealSusi)
    : null;
  const minDeltaLabel = summary ? formatDeltaPct(summary.deltaMinSusi) : null;
  const idealJungsiDeltaLabel = summary
    ? formatDeltaPct(summary.deltaIdealJungsi)
    : null;
  const minJungsiDeltaLabel = summary
    ? formatDeltaPct(summary.deltaMinJungsi)
    : null;

  return (
    <div
      className={`flex flex-col gap-4 rounded-xl bg-surface-04 px-7.5 py-6 ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-app-body font-semibold leading-[1.4] text-ink-strong">
          오늘 순공 시간
        </span>
        <span className="text-app-section font-bold leading-[1.2] text-ink-strong">
          {formatHours(summary?.studyHours ?? 0)}시간
        </span>
      </div>

      {summary && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full bg-[#5AA6F0]"
            />
            <span className="w-30 shrink-0 text-app-label text-ink">
              이상 목표 달성률
            </span>
            <GoalProgressBar
              value={summary.idealRate}
              max={100}
              thickness="0.5rem"
              fillClassName="bg-[#CCE4F7]"
              className="flex-1"
            />
            <span className="w-11 shrink-0 text-right text-app-body font-bold leading-[1.4] text-ink-strong">
              {summary.idealRate}%
            </span>
            {idealDeltaLabel && (
              <span className="shrink-0 text-app-label text-primary">
                {idealDeltaLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full bg-[#6FC98A]"
            />
            <span className="w-30 shrink-0 text-app-label text-ink">
              최소 목표 달성률
            </span>
            <GoalProgressBar
              value={summary.minRate}
              max={100}
              thickness="0.5rem"
              fillClassName="bg-[#ABDFBA]"
              className="flex-1"
            />
            <span className="w-11 shrink-0 text-right text-app-body font-bold leading-[1.4] text-ink-strong">
              {summary.minRate}%
            </span>
            {minDeltaLabel && (
              <span className="shrink-0 text-app-label text-primary">
                {minDeltaLabel}
              </span>
            )}
          </div>
          {(idealJungsiDeltaLabel || minJungsiDeltaLabel) && (
            <p className="text-app-label text-ink-sub">
              정시 확률 변화{" "}
              {idealJungsiDeltaLabel && `이상 ${idealJungsiDeltaLabel}`}
              {idealJungsiDeltaLabel && minJungsiDeltaLabel && " · "}
              {minJungsiDeltaLabel && `최소 ${minJungsiDeltaLabel}`}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <span className="text-app-label text-ink-sub">내일 목표 시간</span>
        <span className="text-app-body font-semibold leading-[1.4] text-ink-strong">
          이상 {formatHours(tomorrowTargets.idealHours)}h · 최소{" "}
          {formatHours(tomorrowTargets.minHours)}h
        </span>
      </div>

      {cooldown.unlocksAt && (
        <p className="text-center text-app-label text-ink-sub">
          다시 기록 가능:{" "}
          {formatCooldownUnlockLabel(cooldown.unlocksAt, timeZone)}
        </p>
      )}
    </div>
  );
}
