import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";
import RecordCooldownSummary from "@/components/goal/dashboard/RecordCooldownSummary";
import GoalCard from "@/components/goal/GoalCard";
import GoalProgressBar from "@/components/goal/GoalProgressBar";
import {
  type GoalRecordCooldown,
  type GoalRecordSummary,
  type GoalTomorrowTargets,
  submitDailyRecord,
} from "@/lib/goalApi";
import { formatCooldownUnlockLabel } from "@/lib/goalPlanUtils";

// 대시보드 "오늘의 목표" 카드 — part-07 #20(카드 배경 정본, 1076×409 = 67.25rem×25.5625rem).
// #21의 "카드 배경 1076×12 축소"는 시안 편집 사고로 판단해 채택하지 않는다(작업 지시 §확정사항 6).
//
// 게이지 채움 폭은 GoalProgressBar가 value/max로 계산한다(px 하드코딩 금지).
//
// QA3 행305 — 버튼 문구 "기록 수정"은 제거했다(12시간 쿨다운 도입으로 "수정" 개념
// 자체가 없다 — 잠금이 아니면 항상 "기록 저장", 잠금 중이면 폼 자체가 사라지고
// 이 카드도 RecordCooldownSummary 요약 패널로 바뀐다).
type GoalRateRowProps = {
  label: string;
  value: number;
  dotClassName: string;
  fillClassName: string;
  achievedHours: number;
  targetHours: number;
};

// 0.1h 단위 반올림 표시(임무 지시) — round1(src/lib/goalGrades.ts)과 같은 계산이지만
// 이 카드는 grades 도메인과 무관해 이 파일 안에 별도로 둔다(house 패턴, api/goal/grades.ts
// 헤더 주석과 동일 이유).
function formatHours(hours: number) {
  return (Math.round(hours * 10) / 10).toFixed(1);
}

function GoalRateRow({
  label,
  value,
  dotClassName,
  fillClassName,
  achievedHours,
  targetHours,
}: GoalRateRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 md:flex-nowrap">
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${dotClassName}`}
      />
      <span className="flex-1 text-app-label text-ink md:w-38 md:flex-none md:shrink-0">
        {label}
      </span>
      {/* md 미만: 퍼센트가 1줄 오른쪽 끝, 진행바+시간이 2줄(order-last). md 이상: DOM 순서대로 한 줄. */}
      <div className="order-last flex basis-full items-center gap-3 md:order-none md:flex-1 md:basis-auto">
        <GoalProgressBar
          value={value}
          max={100}
          thickness="0.75rem"
          fillClassName={fillClassName}
          className="flex-1"
        />
        {/* QA 행304, 달성률 %만으로는 실제 몇 시간을 채웠는지/목표가 몇 시간인지 알 수
            없었다. "달성 h / 목표 h"를 %와 함께 보여준다. */}
        <span className="shrink-0 whitespace-nowrap text-right text-app-label text-ink-sub md:w-24">
          {formatHours(achievedHours)}h / {formatHours(targetHours)}h
        </span>
      </div>
      <span className="shrink-0 text-right text-app-body font-bold leading-[1.4] text-ink-strong md:w-12">
        {value}%
      </span>
    </div>
  );
}

function quickAddLabel(hours: number) {
  return hours < 1 ? `+ ${hours * 60}분` : `+ ${hours}시간`;
}

function clampHours(hours: number) {
  return Math.min(24, Math.max(0, Math.round(hours * 10) / 10));
}

// 부모 Dashboard가 채운 표시용 데이터 — Dashboard.jsx의 mapTodayGoal() 결과.
type TodayGoalData = {
  studyHours: number;
  quickAddOptions: number[];
  upperGoalRate: number;
  lowerGoalRate: number;
  upperTargetHours: number;
  lowerTargetHours: number;
  // QA3 행305 — 12시간 쿨다운 배선. cooldown이 null이면 잠금 없음(한 번도
  // 제출한 적 없는 학생 포함).
  cooldown: GoalRecordCooldown | null;
  summary: GoalRecordSummary | null;
  tomorrowTargets: GoalTomorrowTargets;
};

type TodayGoalCardProps = {
  data: TodayGoalData;
  /** 저장 성공 시 호출. Dashboard의 기존 데이터 훅을 다시 실행해 게이지(upperGoalRate/
   *  lowerGoalRate)·확률을 최신화하는 역할은 이 카드가 아니라 상위 리로드 콜백이 진다
   *  (단일 진실 공급원을 Dashboard 쪽에 유지). */
  onSaved?: () => void;
};

export default function TodayGoalCard({ data, onSaved }: TodayGoalCardProps) {
  // 아직 저장하지 않은 입력값. 서버 확정값(data.studyHours)이 바뀌면(최초 로드·저장 성공 후
  // 리로드) 그 값으로 다시 맞춘다 — 사용자가 입력 중인데 리로드가 덮어쓰는 경우는 저장 자체가
  // 그 값으로 완료된 직후뿐이라 충돌하지 않는다.
  const [pendingHours, setPendingHours] = useState(data.studyHours);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPendingHours(data.studyHours);
  }, [data.studyHours]);

  const handleHoursChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    if (raw === "") {
      setPendingHours(0);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    setPendingHours(clampHours(parsed));
  };

  const handleQuickAdd = (hours) => {
    setPendingHours((prev) => clampHours(prev + hours));
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError("");

    const result = await submitDailyRecord({ studyHours: pendingHours });

    setSubmitting(false);

    if (result.kind === "success") {
      onSaved?.();
      return;
    }

    // QA3 행305 — 경쟁 상태 방어(다른 탭·페이지에서 먼저 제출해 쿨다운이
    // 걸린 경우). onSaved()로 부모(Dashboard)를 재조회시켜 data.cooldown이
    // 최신화되면 이 카드는 자연히 요약 패널로 전환된다.
    if (result.kind === "cooldown") {
      onSaved?.();
      setError(
        result.unlocksAt
          ? `이미 오늘 기록을 제출했어요. 다시 기록 가능: ${formatCooldownUnlockLabel(result.unlocksAt)}`
          : "이미 오늘 기록을 제출했어요.",
      );
      return;
    }

    const messages: Record<string, string> = {
      "no-study-time": "순공 시간은 0보다 커야 해요.",
      "no-session": "로그인이 필요합니다.",
      "not-allowed": "이용권이 필요한 서비스입니다.",
      "not-active": "목표관리 온보딩을 먼저 완료해 주세요.",
    };
    setError(
      messages[result.kind] || "저장에 실패했어요. 잠시 후 다시 시도해 주세요.",
    );
  };

  return (
    <GoalCard
      tone="neutral"
      className="flex h-102.25 flex-col gap-6 px-8 py-7.5"
    >
      <div>
        <h2 className="text-app-section font-bold text-ink-strong">
          오늘의 목표
        </h2>
        <p className="mt-1 text-app-body leading-[1.4] text-ink-sub">
          기록하면 즉시 달성률에 반영돼요
        </p>
      </div>

      {data.cooldown?.active ? (
        // QA3 행305 — 12시간 쿨다운 중에는 입력 UI 대신 요약 패널만 보여준다
        // (DailyRecord.tsx와 같은 컴포넌트·같은 규칙 공유).
        <RecordCooldownSummary
          cooldown={data.cooldown}
          summary={data.summary}
          tomorrowTargets={data.tomorrowTargets}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-4 rounded-xl bg-surface-04 px-7.5 py-6">
          <span className="shrink-0 text-app-body font-semibold leading-[1.4] text-ink-strong">
            오늘 순공 시간
          </span>
          <div className="flex h-12.5 w-48 shrink-0 items-center justify-end gap-1 rounded-lg border border-line bg-white px-4">
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              max="24"
              value={pendingHours}
              onChange={handleHoursChange}
              aria-label="오늘 순공 시간(시간)"
              className="w-16 border-none bg-transparent text-right text-app-section font-bold leading-[1.2] text-ink-strong focus:outline-hidden"
            />
            <span className="text-app-label text-ink-sub">시간</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data.quickAddOptions.map((hours) => (
              <button
                key={hours}
                type="button"
                onClick={() => handleQuickAdd(hours)}
                className="h-8 shrink-0 rounded-full border border-line px-3 text-app-label leading-[1.2] text-ink transition-colors hover:border-ink-strong"
              >
                {quickAddLabel(hours)}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={submitting || pendingHours <= 0}
            onClick={handleSubmit}
            className="ml-auto h-12.5 shrink-0 rounded-lg bg-primary px-6 text-app-body font-semibold leading-[1.2] text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "저장 중…" : "기록 저장"}
          </button>
          {error && (
            <p className="w-full text-app-label text-red-600">{error}</p>
          )}
        </div>
      )}

      {/* QA3 행305 — 잠금 중에는 RecordCooldownSummary가 이미 이상/최소 달성률을
          보여주므로 아래 행을 중복 렌더하지 않는다. */}
      {!data.cooldown?.active && (
        <div className="flex flex-col gap-4">
          <GoalRateRow
            label="이상 목표 학습 시간"
            value={data.upperGoalRate}
            dotClassName="bg-[#5AA6F0]"
            fillClassName="bg-[#CCE4F7]"
            achievedHours={data.studyHours}
            targetHours={data.upperTargetHours}
          />
          <GoalRateRow
            label="최소 목표 학습 시간"
            value={data.lowerGoalRate}
            dotClassName="bg-[#6FC98A]"
            fillClassName="bg-[#ABDFBA]"
            achievedHours={data.studyHours}
            targetHours={data.lowerTargetHours}
          />
        </div>
      )}
    </GoalCard>
  );
}
