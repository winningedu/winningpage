import type { CoverPage as CoverPageData } from "@/lib/diagnosis-v3/types";
import CopyText from "./parts/CopyText";
import { pageTitle, REPORT_LABELS, twoDigitPage } from "./parts/labels";
import ReportSheet from "./parts/ReportSheet";

/** Cover: 22 r6 (student facts), r7 (toc), judge-report R6 (headline, stages, basis). */
export default function CoverPage({ cover }: { cover: CoverPageData }) {
  return (
    <ReportSheet footerNote={cover.basis}>
      <h1 className="text-[2.5rem] font-bold text-ink-title">
        {REPORT_LABELS.reportName}
      </h1>
      <section className="flex flex-col gap-4 border-t border-ink-title pt-6">
        <h2 className="text-sm text-ink-sub">{REPORT_LABELS.coverHeadline}</h2>
        <p className="text-xl font-semibold">
          <CopyText text={cover.headline} />
        </p>
        <ol className="grid grid-cols-7 gap-2">
          {cover.stages.map((stage) => (
            <li
              key={stage.code}
              className="flex flex-col gap-1 border-t-2 border-line pt-2"
            >
              <span className="text-xs text-ink-sub">{stage.label}</span>
              <span className="text-xl font-semibold tabular-nums">
                {stage.score}
              </span>
            </li>
          ))}
        </ol>
      </section>
      <nav aria-label={REPORT_LABELS.coverToc} className="flex flex-col gap-3">
        <h2 className="text-sm text-ink-sub">{REPORT_LABELS.coverToc}</h2>
        <ol className="grid grid-cols-2 gap-x-8">
          {cover.toc.map((entry) => (
            <li
              key={entry.page}
              className="flex gap-4 border-b border-line py-2 text-sm"
            >
              <span className="text-ink-sub tabular-nums">
                {twoDigitPage(entry.page)}
              </span>
              <span>{pageTitle(entry.page)}</span>
            </li>
          ))}
        </ol>
      </nav>
      <dl className="grid grid-cols-[1fr_2fr_1fr] border-t border-line pt-4">
        {cover.studentName && (
          <div className="flex flex-col gap-1">
            <dt className="text-xs text-ink-sub">
              {REPORT_LABELS.coverStudent}
            </dt>
            <dd className="text-lg font-semibold">{cover.studentName}</dd>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-ink-sub">
            {REPORT_LABELS.coverGradeSchool}
          </dt>
          <dd className="text-lg font-semibold">
            {cover.gradeLabel}
            {REPORT_LABELS.joiner}
            {cover.schoolTypeLabel}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-ink-sub">{REPORT_LABELS.coverDate}</dt>
          <dd className="text-lg font-semibold">{cover.diagnosedAt}</dd>
        </div>
      </dl>
    </ReportSheet>
  );
}
