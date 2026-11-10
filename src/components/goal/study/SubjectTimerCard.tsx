import { Pencil } from "lucide-react";
import { useState } from "react";
import GoalProgressBar from "@/components/goal/GoalProgressBar";
import { getSubjectStrongClass } from "@/components/goal/subjectTokens";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// HH:MM:SS 표기 — part-09 §120~123 (`00:50:12` 등). 초 단위 경과값을 그대로 조판한다.
export function formatClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = safeSeconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// 열공 타이머(#25) 과목 카드(420×241 = 26.25rem×15.0625rem). part-09 §66~76 내부 스펙,
// §132~134 상태/인터랙션(진행 중=진한 숫자+`일시정지`, 그 외=옅은 숫자+`시작`).
//
// 진행바 채움은 반드시 elapsed/target 비례로 계산한다 — 시안은 4카드 모두 83/340(24.4%)로
// 목표·경과가 다 다른데도 동일해 "시안 미갱신"으로 판단했다(part-09 §78, 작업 지시 확정 사항 §2).
//
// elapsedSeconds·running·targetHours는 전부 서버(api/_routes/goal/timer.js)가 준 값을 부모(Timer.jsx)가
// 조립한 것이다 — 이 컴포넌트 자체는 클라이언트 초 계산을 하지 않는다(초 단위 표시 갱신은
// 부모의 1초 틱이 elapsedSeconds를 다시 계산해 내려주는 방식).
//
// 리셋 버튼은 제거했다(판단 지점) — 옛 목업엔 있었으나 서버 세션 모델(goal_timer_sessions)에는
// "누적값을 0으로 되돌리는" 액션이 없다(시작/종료/전환/자정분할/타임아웃 4종 end_reason뿐).
// 되돌리려면 오늘 마감된 세션들을 지우거나 음수 보정 세션을 만들어야 하는데 감사 기록을
// 훼손한다 — 이번 범위에서는 만들지 않았다.
//
// 목표 시간 인라인 편집(연필 아이콘) — 학생이 과목별 목표를 자율 설정한다(임무 지시 확정).
// isDefaultTarget이 true면 아직 저장된 값이 없어 "요일 목표 총합÷과목 수" 파생값을 보여주는
// 중이라는 뜻 — 라벨에 `(기본값)`을 붙여 저장된 값과 구분한다.
type SubjectTimerCardProps = {
  label: string;
  colorKey: string;
  targetHours: number;
  isDefaultTarget?: boolean;
  elapsedSeconds: number;
  running: boolean;
  onToggle?: () => void;
  onTargetChange?: (hours: number) => void;
};

export default function SubjectTimerCard({
  label,
  colorKey,
  targetHours,
  isDefaultTarget = false,
  elapsedSeconds,
  running,
  onToggle,
  onTargetChange,
}: SubjectTimerCardProps) {
  const [editing, setEditing] = useState(false);
  const [draftHours, setDraftHours] = useState(String(targetHours ?? 0));

  const targetSeconds = targetHours * 3600;
  // 도트·진행바 채움은 배경(칩)용 파스텔이 아니라 진한 2단계 톤을 쓴다(코드 검수 §2) —
  // surface-01/surface-04 위에서 파스텔이 거의 안 보이던 문제.
  const dotClass = getSubjectStrongClass(colorKey);

  const openEditor = () => {
    setDraftHours(String(targetHours ?? 0));
    setEditing(true);
  };

  const saveTarget = () => {
    const parsed = Number(draftHours);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 24) {
      onTargetChange?.(parsed);
    }
    setEditing(false);
  };

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-line/60 bg-white px-7 py-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 rounded-full ${dotClass}`}
          />
          <span className="text-app-card-title font-bold text-ink-strong">
            {label}
          </span>
        </div>

        {editing ? (
          <div className="flex shrink-0 items-center gap-1">
            <input
              type="number"
              min="0"
              max="24"
              step="0.5"
              value={draftHours}
              onChange={(event) => setDraftHours(event.target.value)}
              className="h-7 w-14 rounded-sm border border-line px-2 text-right text-app-label tabular-nums"
              aria-label={`${label} 목표 시간(시간)`}
            />
            <span className="text-app-label text-ink-sub">h</span>
            <button
              type="button"
              onClick={saveTarget}
              className="rounded-sm px-1.5 text-app-caption font-semibold text-primary"
            >
              저장
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-sm px-1 text-app-caption text-ink-sub"
            >
              취소
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={openEditor}
            className="flex shrink-0 items-center gap-1 text-app-label text-ink-sub hover:text-ink-strong"
          >
            목표 {targetHours}h
            {isDefaultTarget && <span className="text-ink-sub">(기본값)</span>}
            <Pencil size={12} aria-hidden="true" />
          </button>
        )}
      </div>

      <p
        className={`text-app-title font-bold leading-[1.2] tabular-nums ${
          running ? "text-ink-strong" : "text-ink-sub"
        }`}
      >
        {formatClock(elapsedSeconds)}
      </p>

      <GoalProgressBar
        value={Math.min(elapsedSeconds, targetSeconds)}
        max={targetSeconds}
        thickness="0.75rem"
        fillClassName={dotClass}
      />

      <button
        type="button"
        onClick={onToggle}
        className={`h-9.75 w-full rounded-lg text-app-body font-semibold leading-[1.2] transition-colors ${
          running
            ? "border border-line bg-white text-ink-strong"
            : "bg-primary text-white"
        }`}
      >
        {running ? "일시정지" : "시작"}
      </button>
    </div>
  );
}
