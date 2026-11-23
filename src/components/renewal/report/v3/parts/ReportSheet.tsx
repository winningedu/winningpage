import type { ReactNode } from "react";
import { site } from "@/config/site";
import CopyText from "./CopyText";
import { REPORT_LABELS, TOTAL_PAGES } from "./labels";

type ReportSheetProps = {
  /** Fixed page number 1..16; the cover has none. */
  page?: number;
  /** Left footer text when the sheet has no page number (cover basis line). */
  footerNote?: string;
  children: ReactNode;
};

/**
 * One A4 sheet of the v3 report. fd-report-sheet is the report-print.css
 * contract (page break between sheets, A4 width in print); keep the class.
 */
export default function ReportSheet({
  page,
  footerNote,
  children,
}: ReportSheetProps) {
  const pageText = page === undefined ? undefined : `${page} / ${TOTAL_PAGES}`;
  const sheetLabel = [site.brandName, REPORT_LABELS.reportName, pageText]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      aria-label={sheetLabel}
      className="fd-report-sheet flex w-full min-w-0 shrink-0 flex-col break-keep rounded-2xl bg-white p-6 text-ink-strong shadow-[0_0_1.25rem_rgba(0,0,0,0.06)] lg:min-h-[99.0588rem] lg:w-280 lg:rounded-none lg:p-perf-inset"
    >
      <header className="flex items-center justify-between border-b border-line pb-4 text-sm text-ink-sub">
        <span className="font-semibold text-ink-strong">{site.brandName}</span>
        <span>
          {site.brandName} {REPORT_LABELS.reportName}
        </span>
      </header>
      <div className="mt-8 flex flex-1 flex-col gap-6">{children}</div>
      <footer className="mt-10 flex items-center justify-between border-t border-line pt-4 text-xs text-ink-sub">
        <span>
          {pageText ?? (footerNote && <CopyText text={footerNote} />)}
        </span>
        <span>
          {site.brandName} {REPORT_LABELS.studentOnly}
        </span>
      </footer>
    </section>
  );
}
