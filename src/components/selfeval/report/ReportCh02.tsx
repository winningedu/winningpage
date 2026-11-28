import type {
  ReportCh02,
  ReportCh02Row,
  ReportCh02Subject,
  ReportRecordKind,
} from "@/lib/selfeval/reportTypes";
import { circledList } from "./reportFormat";

const KIND_LABEL: Record<ReportRecordKind, string> = {
  performance: "수행",
  deep: "심화",
  activity: "활동",
};

const KIND_STYLE: Record<ReportRecordKind, string> = {
  performance: "bg-[#1e6fd9] text-white",
  deep: "bg-[#ff6b4e] text-white",
  activity: "bg-[#7b6cf0] text-white",
};

const KINDS: readonly ReportRecordKind[] = ["performance", "deep", "activity"];

/** 예: 수행 2, 심화 2(진행 중 1), 반영 문장 8개 */
function subjectCountLine(subject: ReportCh02Subject): string {
  const parts = KINDS.filter((kind) => subject.counts[kind] > 0).map((kind) => {
    const inProgress = subject.inProgress[kind];
    const suffix = inProgress > 0 ? `(진행 중 ${inProgress})` : "";
    return `${KIND_LABEL[kind]} ${subject.counts[kind]}${suffix}`;
  });
  parts.push(
    subject.reflectedSentenceCount > 0
      ? `반영 문장 ${subject.reflectedSentenceCount}개`
      : "반영 문장 없음",
  );
  return parts.join(", ");
}

function dotsText(dots: number): string {
  return "●".repeat(dots) + "○".repeat(5 - dots);
}

function RecordRow({ row }: { row: ReportCh02Row }) {
  const muted = row.role === "in_progress" || row.role === "unreflected";
  const unreflected = row.role === "unreflected";
  const roleLine = unreflected
    ? [row.roleLabel, row.reasonLabel, row.recommendation]
        .filter(Boolean)
        .join(", ")
    : row.roleLabel;
  const date = row.inProgress
    ? "진행 중"
    : row.submittedOn
      ? `${row.submittedOn} 제출`
      : null;
  return (
    <li
      data-testid={`ch02-row-${row.tag}`}
      data-muted={muted}
      className={`grid grid-cols-[3rem_1fr] gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[3rem_1fr_auto] ${
        muted ? "opacity-55" : ""
      }`}
    >
      <div className="flex flex-col items-start gap-1">
        <span className="text-app-label font-bold text-ink-strong">
          {row.tag}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-bold leading-none ${
            muted ? "bg-surface-04 text-ink-sub" : KIND_STYLE[row.kind]
          }`}
        >
          {KIND_LABEL[row.kind]}
        </span>
      </div>
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2">
          {row.title && (
            <span className="text-app-body font-bold text-ink-strong">
              {row.title}
            </span>
          )}
          {date && (
            <span className="text-app-caption text-ink-natural">{date}</span>
          )}
        </p>
        {row.summary && (
          <p className="mt-1 text-app-label text-ink-sub">{row.summary}</p>
        )}
        {row.reasonText && (
          <p className="mt-1 text-app-label text-ink-sub">{row.reasonText}</p>
        )}
      </div>
      <div className="col-start-2 flex flex-col items-start gap-1 text-app-caption sm:col-start-3 sm:items-end">
        <span
          data-testid="dots"
          role="img"
          aria-label={`반영도 ${row.dots}/5`}
          className="tracking-[0.15em] text-[#0b2545]"
        >
          {dotsText(row.dots)}
        </span>
        <span className="text-ink-sub">{roleLine}</span>
        {row.sentenceNumbers.length > 0 && (
          <span className="rounded-full border border-line px-2 py-0.5 text-ink-strong">
            {circledList(row.sentenceNumbers)}
          </span>
        )}
      </div>
    </li>
  );
}

export default function Ch02View({ ch }: { ch: ReportCh02 }) {
  return (
    <div className="flex flex-col gap-4">
      {ch.subjects.map((subject) => (
        <section
          key={subject.label}
          data-testid={`subject-${subject.label}`}
          className="overflow-hidden rounded-2xl border border-line"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2 bg-surface-04 px-4 py-3">
            <h3 className="text-app-card-title font-bold text-ink-strong">
              {subject.label}
            </h3>
            <p className="text-app-caption text-ink-sub">
              {subjectCountLine(subject)}
            </p>
          </header>
          <ul className="divide-y divide-line">
            {subject.rows.map((row) => (
              <RecordRow key={row.tag} row={row} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
