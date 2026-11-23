import type { ReportCh03 } from "@/lib/selfeval/reportTypes";
import TagChip from "./TagChip";

const KIND_LABEL = {
  performance: "수행",
  deep: "심화",
  activity: "활동",
} as const;

export default function Ch03View({ ch }: { ch: ReportCh03 }) {
  return (
    <ul className="flex flex-col gap-3">
      {ch.rows.map((row) => (
        <li
          key={row.tag}
          data-testid={`ch03-row-${row.tag}`}
          className="grid grid-cols-1 gap-3 sm:grid-cols-[14rem_5.5rem_1fr] sm:items-center"
        >
          <div className="rounded-2xl bg-surface-04 p-4">
            <p className="flex items-center gap-1.5">
              <TagChip tag={row.tag} />
              <span className="text-app-caption font-bold text-ink-strong">
                {KIND_LABEL[row.kind]}
                {row.subject ? `, ${row.subject}` : ""}
              </span>
            </p>
            {row.title && (
              <p className="mt-2 text-app-label font-bold text-ink-strong">
                {row.title}
              </p>
            )}
            {row.submittedOn && (
              <p className="mt-1 text-app-caption text-ink-natural">
                {row.submittedOn}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 text-center sm:flex-col sm:gap-0.5">
            <span
              data-testid="relation"
              className="text-app-label font-bold text-[#1e6fd9]"
            >
              {row.relationLabel}
            </span>
            {row.strengthLabel && (
              <span className="border-t border-[#1e6fd9] pt-0.5 text-[0.6875rem] text-ink-sub">
                {row.strengthLabel}
              </span>
            )}
          </div>
          <p
            data-testid="explanation"
            className="min-h-16 rounded-2xl border border-line p-4 text-app-label leading-[1.7] text-ink-strong"
          >
            {row.explanation}
          </p>
        </li>
      ))}
    </ul>
  );
}
