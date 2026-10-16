import { useEffect, useState } from "react";
import GoalProgressBar from "@/components/goal/GoalProgressBar";
import { type SaveState, saveStatusLabel } from "./surveySave";

const TICK_MS = 30_000;

type SurveyProgressCardProps = {
  answered: number;
  total: number;
  saveState: SaveState;
  onRetry: () => void;
};

export default function SurveyProgressCard({
  answered,
  total,
  saveState,
  onRetry,
}: SurveyProgressCardProps) {
  // "방금", "N분 전" 이 오래 머물지 않도록 주기적으로 다시 그린다.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const status = saveStatusLabel(saveState, now);

  return (
    <section
      aria-label="진행 상황"
      className="rounded-xl border border-line bg-white px-5 py-4"
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-app-card-title font-bold text-ink-strong">
          {total}문항 중 {answered}문항 답함
        </p>
        {status &&
          (saveState.phase === "error" ? (
            <button
              type="button"
              onClick={onRetry}
              className="text-app-label font-medium text-destructive underline-offset-2 hover:underline"
            >
              {status}
            </button>
          ) : (
            <p role="status" className="text-app-label text-ink-sub">
              {status}
            </p>
          ))}
      </div>
      <GoalProgressBar
        value={answered}
        max={total}
        thickness="0.375rem"
        className="mt-3"
      />
    </section>
  );
}
