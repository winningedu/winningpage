import { Button } from "@/components/ui/button";
import type { GenerationAction, GenerationNotice } from "./generateView";

const LABELS: Record<GenerationAction, string> = {
  retry: "다시 시도",
  start: "시작 화면으로",
  pricing: "이용권 구입하기",
  report: "리포트 보기",
};

const TONE: Record<GenerationNotice["tone"], string> = {
  info: "border-accent bg-surface-03",
  error: "border-error/40 bg-white",
  success: "border-accent bg-surface-03",
};

export default function GenerationNoticeCard({
  notice,
  onAction,
}: {
  notice: GenerationNotice;
  onAction: (action: GenerationAction) => void;
}) {
  return (
    <section
      role={notice.tone === "error" ? "alert" : "status"}
      className={`rounded-xl border px-6 py-5 ${TONE[notice.tone]}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-app-card-title font-bold text-ink-strong">
            {notice.title}
          </p>
          <p className="mt-1 text-app-label text-ink-sub">{notice.body}</p>
          {notice.issues.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-app-label text-ink-sub">
              {notice.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
          {notice.attemptsLabel && (
            <p className="mt-2 text-app-caption font-semibold text-ink-strong">
              시도 {notice.attemptsLabel}
            </p>
          )}
        </div>
        {notice.action && (
          <Button
            type="button"
            size="lg"
            className="h-10 shrink-0 px-5 text-app-label"
            onClick={() => onAction(notice.action as GenerationAction)}
          >
            {LABELS[notice.action]}
          </Button>
        )}
      </div>
    </section>
  );
}
