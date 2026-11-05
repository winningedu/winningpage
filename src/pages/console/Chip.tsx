import { cn } from "@/lib/utils";

export type ChipTone =
  | "Info"
  | "Neutral"
  | "Danger"
  | "Warning"
  | "Success"
  | "Badge"
  | "Primary"
  | "Disabled"
  | "Outline"
  | "Caution";

const TONES: Record<ChipTone, string> = {
  Info: "bg-surface-info text-primary font-semibold",
  Neutral: "bg-surface-muted text-ink font-semibold",
  Danger: "bg-surface-danger text-ink-danger font-medium",
  Warning: "bg-surface-warning text-ink font-medium",
  Success: "bg-surface-success text-ink font-medium",
  Badge: "bg-surface-badge text-primary font-medium",
  Primary: "bg-primary text-primary-foreground font-medium",
  Disabled: "bg-surface-muted text-neutral-400 font-medium",
  Outline: "bg-background text-ink font-medium",
  Caution: "bg-surface-caution text-ink font-medium",
};

interface ChipProps {
  tone: ChipTone;
  size?: "Default" | "Lg";
  children: React.ReactNode;
}

export default function Chip({ tone, size = "Default", children }: ChipProps) {
  if (size === "Lg" && tone === "Caution") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-goal-insight-warn px-2.5 py-1 text-app-label font-semibold text-ink-strong">
        <span aria-hidden className="size-2 rounded-full bg-ink-strong" />
        {children}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-app-caption",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}
