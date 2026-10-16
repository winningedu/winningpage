import type { OpenReport } from "@/lib/growth/api";
import {
  formatSavedAt,
  formatStartedDate,
  progressPercent,
} from "./startLogic";

export default function OpenReportBanner({
  openReport,
}: {
  openReport: OpenReport;
}) {
  const started = formatStartedDate(openReport.card.startedAt);
  const saved = formatSavedAt(openReport.card.lastSavedAt);
  const stepLabel = openReport.card.stepLabel.trim();
  const percent = progressPercent(openReport.answered, openReport.total);

  const details = [
    started ? `${started} 시작` : null,
    stepLabel === "" ? null : stepLabel,
    openReport.total > 0
      ? `${openReport.total}문항 중 ${openReport.answered}문항 답함`
      : null,
    saved ? `마지막 저장 ${saved}` : null,
  ].filter((v): v is string => v !== null);

  return (
    <section className="rounded-xl border border-accent bg-white px-6 py-5">
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-surface-03 px-2.5 py-0.5 text-app-caption font-semibold text-ink-strong">
          작성 중
        </span>
        <p className="text-app-card-title font-bold text-ink-strong">
          작성 중인 회차가 있어요
        </p>
      </div>
      {details.length > 0 && (
        <p className="mt-2 text-app-label text-ink-sub">{details.join(", ")}</p>
      )}
      <div
        role="progressbar"
        aria-label="설문 진행률"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-04"
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${percent}%` }}
        />
      </div>
    </section>
  );
}
