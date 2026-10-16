import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { buttonVariants } from "@/components/ui/button";
import type { PlanBody, ProgramHandoff } from "@/lib/growth/api";
import { cn } from "@/lib/utils";
import { GROWTH_PATHS } from "../growthPaths";
import HandoffModal from "./HandoffModal";
import PlanItemCard from "./PlanItemCard";
import {
  carriedSection,
  groupPeriodLabel,
  handoffDestination,
  parseAvoidRepeats,
  storeHandoff,
} from "./planLogic";
import { AvoidRepeatsCard, ChangeCard } from "./SidePanels";
import { usePlanActions } from "./usePlanActions";

const CARD = "rounded-xl border border-border bg-white";

function safeSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export default function PlanView({
  plan,
  userId,
}: {
  plan: PlanBody;
  userId: string | null;
}) {
  const navigate = useNavigate();
  const { pendingIds, notice, recalculated, check, setDeadline } =
    usePlanActions(userId);
  const [handoffId, setHandoffId] = useState<string | null>(null);
  const [carriedOpen, setCarriedOpen] = useState(false);

  const carried = carriedSection(plan);
  const activeHandoff: ProgramHandoff | null = handoffId
    ? (plan.handoffs[handoffId] ?? null)
    : null;

  const card = (item: PlanBody["carried"][number]) => (
    <PlanItemCard
      key={item.id}
      item={item}
      handoffs={plan.handoffs}
      pending={pendingIds.has(item.id)}
      onCheck={check}
      onDeadline={setDeadline}
      onHandoff={setHandoffId}
    />
  );

  const confirmHandoff = (handoff: ProgramHandoff) => {
    storeHandoff(handoff, safeSessionStorage());
    setHandoffId(null);
    navigate(handoffDestination(handoff.program));
  };

  return (
    <div className="flex flex-col gap-6">
      {notice ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-app-label text-red-700"
        >
          {notice}
        </p>
      ) : null}

      <section aria-label="진행 상황" className={cn(CARD, "px-6 py-5")}>
        <div className="flex items-center justify-between">
          <p className="text-app-body font-semibold text-ink-strong">
            제안 활동 {plan.progress.total}건 중 {plan.progress.done}건 완료
          </p>
          <p className="text-app-body font-semibold text-ink-strong">
            {plan.progress.percent}%
          </p>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={plan.progress.percent}
          aria-label="실행계획 진행률"
          className="mt-3 h-2 overflow-hidden rounded-full bg-surface-04"
        >
          <div
            className="h-full rounded-full bg-ink-strong transition-[width]"
            style={{ width: `${plan.progress.percent}%` }}
          />
        </div>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)_21rem] items-start gap-6">
        <div className="flex flex-col gap-6">
          {carried ? (
            <section aria-label="이월 과제" className={cn(CARD, "p-6")}>
              <button
                type="button"
                aria-expanded={carriedOpen}
                onClick={() => setCarriedOpen((v) => !v)}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="text-app-section font-semibold text-ink-strong">
                  이전 회차에서 이어진 과제 {carried.count}건
                </span>
                <span className="text-app-label text-ink-sub">
                  {carriedOpen ? "접기" : "펼치기"}
                </span>
              </button>
              {carriedOpen ? (
                <>
                  <p className="mt-1 text-app-label text-ink-sub">
                    지난 회차에서 끝내지 못한 과제예요.
                  </p>
                  <ul className="mt-4 flex flex-col gap-3">
                    {carried.items.map(card)}
                  </ul>
                  <p className="mt-3 text-app-caption text-ink-sub">
                    지난 회차에서 완료한 과제는 그 리포트에 그대로 남아 있어요.
                  </p>
                </>
              ) : null}
            </section>
          ) : null}

          {plan.groups.map((group) => {
            const periodLabel = groupPeriodLabel(group);
            return (
              <section
                key={group.period}
                aria-label={group.label}
                className={cn(CARD, "p-6")}
              >
                <h2 className="flex flex-wrap items-baseline gap-2">
                  <span className="text-app-section font-semibold text-ink-strong">
                    {group.label}
                  </span>
                  {periodLabel ? (
                    <span className="text-app-label text-ink-sub">
                      {periodLabel}
                    </span>
                  ) : null}
                </h2>
                <ul className="mt-4 flex flex-col gap-3">
                  {group.items.map(card)}
                </ul>
              </section>
            );
          })}
        </div>

        <aside className="flex flex-col gap-4">
          <ChangeCard metrics={plan.metrics} recalculated={recalculated} />
          <AvoidRepeatsCard texts={parseAvoidRepeats(plan.avoidRepeats)} />
        </aside>
      </div>

      <div className="flex justify-end">
        <Link
          to={GROWTH_PATHS.report(plan.reportId)}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-10 px-5 text-app-label",
          )}
        >
          리포트 다시 보기
        </Link>
      </div>

      <HandoffModal
        handoff={activeHandoff}
        issuedAt={plan.issuedAt}
        onClose={() => setHandoffId(null)}
        onConfirm={confirmHandoff}
      />
    </div>
  );
}
