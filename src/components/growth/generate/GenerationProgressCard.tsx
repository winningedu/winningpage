import { Check, Loader2 } from "lucide-react";
import { CARD, CARD_TITLE } from "../start/cardStyles";
import { completedCount, type StepBadge, stepBadge } from "./generateView";
import type { GenerationState } from "./generationEngine";
import { STEP_COUNT, STEP_LABELS } from "./stepLabels";

const BADGE_STYLE: Record<StepBadge, string> = {
  완료: "bg-surface-04 text-ink-sub",
  "진행 중": "bg-surface-02 text-ink-strong",
  대기: "bg-surface-04 text-ink-natural",
  실패: "bg-error/10 text-error",
};

function StepMark({ badge }: { badge: StepBadge }) {
  if (badge === "완료") {
    return (
      <span
        aria-hidden="true"
        className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
      >
        <Check className="size-3" strokeWidth={3} />
      </span>
    );
  }
  if (badge === "진행 중") {
    return (
      <Loader2
        aria-hidden="true"
        className="size-5 animate-spin text-primary"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`size-5 rounded-full border-2 ${badge === "실패" ? "border-error" : "border-line"}`}
    />
  );
}

export default function GenerationProgressCard({
  state,
}: {
  state: GenerationState;
}) {
  const done = completedCount(state.progress);
  const steps = Array.from({ length: STEP_COUNT }, (_, i) => i + 1);

  return (
    <section className={CARD}>
      <div className="flex items-center justify-between gap-4">
        <h2 className={CARD_TITLE}>진행 상황</h2>
        <p className="text-app-label font-semibold text-ink-strong">
          {done} / {STEP_COUNT} 단계 완료
        </p>
      </div>
      <div
        role="progressbar"
        aria-label="리포트 생성 진행률"
        aria-valuemin={0}
        aria-valuemax={STEP_COUNT}
        aria-valuenow={done}
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-04"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${(done / STEP_COUNT) * 100}%` }}
        />
      </div>
      <ol className="mt-4 flex flex-col gap-1">
        {steps.map((step) => {
          const badge = stepBadge(state, step);
          return (
            <li
              key={step}
              aria-current={badge === "진행 중" ? "step" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-3 ${badge === "진행 중" ? "bg-surface-03" : ""}`}
            >
              <StepMark badge={badge} />
              <span className="flex-1 text-app-body text-ink-strong">
                {step}. {STEP_LABELS[step]}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-app-caption font-semibold ${BADGE_STYLE[badge]}`}
              >
                {badge}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
