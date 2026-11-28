import type { ReactNode } from "react";
import type { AreaState } from "@/lib/diagnosis-v3/types";

// 15 r17: WEAK red, LOW orange, MID grey, TOP blue.
const STATE_BADGE_CLASS: Record<AreaState, string> = {
  WEAK: "bg-error/10 text-error",
  LOW: "bg-amber-100 text-amber-700",
  MID: "bg-surface-muted text-ink-sub",
  TOP: "bg-surface-info text-primary-soft",
};

export const STATE_FILL_CLASS: Record<AreaState, string> = {
  WEAK: "bg-error",
  LOW: "bg-amber-500",
  MID: "bg-ink-natural",
  TOP: "bg-action",
};

type StatusBadgeProps = {
  /** area state code of the payload score; colors the chip (15 r17) */
  state?: AreaState;
  /** emphasis for the weak side when no state applies; the text itself comes from the payload */
  tone?: "default" | "alert";
  children: ReactNode;
};

/** Small state chip next to a score (06 r20-r23 state labels). */
export default function StatusBadge({
  state,
  tone = "default",
  children,
}: StatusBadgeProps) {
  const toneClass = state
    ? STATE_BADGE_CLASS[state]
    : tone === "alert"
      ? "bg-error/10 text-error"
      : "bg-surface-muted text-ink-sub";
  return (
    <span
      data-state={state}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${toneClass}`}
    >
      {children}
    </span>
  );
}
