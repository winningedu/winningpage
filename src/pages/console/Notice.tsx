import { cn } from "@/lib/utils";

interface NoticeProps {
  tone: "Info" | "Danger";
  children: React.ReactNode;
}

export default function Notice({ tone, children }: NoticeProps) {
  return (
    <div
      className={cn(
        "rounded-lg px-4 py-3 text-app-label",
        tone === "Info"
          ? "bg-surface-muted text-ink-sub"
          : "bg-surface-danger text-ink-danger",
      )}
    >
      {children}
    </div>
  );
}
