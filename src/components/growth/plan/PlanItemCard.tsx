import type { PlanItemView, ProgramHandoff } from "@/lib/growth/api";
import { cn } from "@/lib/utils";
import {
  axisLabel,
  canSetDeadline,
  doneBadge,
  handoffButtonLabel,
  isUncheckLocked,
  PRIORITY_LABELS,
  PROGRAM_LABELS,
  progressNote,
  showHandoffButton,
} from "./planLogic";

const BADGE = "rounded-full px-2 py-0.5 text-app-badge font-medium";

type Props = {
  item: PlanItemView;
  handoffs: Record<string, ProgramHandoff>;
  pending: boolean;
  onCheck: (itemId: string, done: boolean) => void;
  onDeadline: (itemId: string, value: string) => void;
  onHandoff: (itemId: string) => void;
};

export default function PlanItemCard({
  item,
  handoffs,
  pending,
  onCheck,
  onDeadline,
  onHandoff,
}: Props) {
  const locked = isUncheckLocked(item);
  const hasHandoff = item.id in handoffs;
  const badge = doneBadge(item);
  const axis = axisLabel(item.axis);
  const buttonLabel = handoffButtonLabel(item.program);
  const overdue = item.urgent && !item.done;

  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-xl border bg-white p-4",
        overdue ? "border-red-500" : "border-border",
        item.done && "opacity-60",
      )}
    >
      <input
        type="checkbox"
        aria-label={item.title}
        checked={item.done}
        disabled={pending || locked}
        onChange={() => onCheck(item.id, !item.done)}
        className="mt-1 size-5 shrink-0 cursor-pointer accent-ink-strong disabled:cursor-not-allowed"
      />
      <div className="min-w-0 flex-1">
        <h3 className="text-app-body font-semibold text-ink-strong">
          {item.title}
        </h3>
        {item.description ? (
          <p className="mt-1 text-app-label text-ink-sub">{item.description}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {item.carried ? (
            <span className={cn(BADGE, "bg-amber-100 text-amber-900")}>
              이월
            </span>
          ) : null}
          <span
            className={cn(
              BADGE,
              item.program === "school"
                ? "bg-surface-04 text-ink-sub"
                : "bg-sky-100 text-sky-800",
            )}
          >
            {PROGRAM_LABELS[item.program]}
          </span>
          <span
            className={cn(
              BADGE,
              item.priority === "required"
                ? "bg-ink-strong text-white"
                : "bg-surface-04 text-ink-sub",
            )}
          >
            {PRIORITY_LABELS[item.priority]}
          </span>
          {axis ? (
            <span className={cn(BADGE, "bg-surface-04 text-ink-sub")}>
              {axis}
            </span>
          ) : null}
          {item.category ? (
            <span className={cn(BADGE, "bg-surface-04 text-ink-sub")}>
              {item.category}
            </span>
          ) : null}
          {item.deadlineLabel ? (
            <span
              className={cn(
                BADGE,
                overdue
                  ? "bg-red-500 font-semibold text-white"
                  : "bg-surface-04 text-ink-sub",
              )}
            >
              {item.deadlineLabel}
            </span>
          ) : null}
          {badge ? (
            <span className={cn(BADGE, "bg-emerald-100 text-emerald-800")}>
              {badge}
            </span>
          ) : null}
        </div>
        {canSetDeadline(item) ? (
          <label className="mt-2 flex items-center gap-2 text-app-caption text-ink-sub">
            마감일
            <input
              type="date"
              aria-label={`${item.title} 마감일`}
              value={item.deadline?.slice(0, 10) ?? ""}
              disabled={pending}
              onChange={(e) => onDeadline(item.id, e.target.value)}
              className="h-8 rounded-md border border-border bg-white px-2 text-app-label text-ink-strong"
            />
          </label>
        ) : null}
        <p className="mt-2 text-app-caption text-ink-sub">
          {progressNote(item, hasHandoff)}
        </p>
      </div>
      {buttonLabel && showHandoffButton(item, handoffs) ? (
        <button
          type="button"
          onClick={() => onHandoff(item.id)}
          className="h-9 shrink-0 self-center rounded-lg border border-border bg-white px-4 text-app-label font-medium text-ink-strong transition-colors hover:bg-surface-04"
        >
          {buttonLabel}
        </button>
      ) : null}
    </li>
  );
}
