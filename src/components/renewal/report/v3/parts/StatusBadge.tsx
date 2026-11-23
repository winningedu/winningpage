import type { ReactNode } from "react";

type StatusBadgeProps = {
  /** emphasis for the weak side (break, 보완); the text itself comes from the payload */
  tone?: "default" | "alert";
  children: ReactNode;
};

/** Small state chip next to a score (06 r20-r23 state labels). */
export default function StatusBadge({
  tone = "default",
  children,
}: StatusBadgeProps) {
  const toneClass =
    tone === "alert"
      ? "bg-error/10 text-error"
      : "bg-surface-muted text-ink-sub";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${toneClass}`}
    >
      {children}
    </span>
  );
}
