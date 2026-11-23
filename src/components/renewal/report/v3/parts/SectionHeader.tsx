import CopyText from "./CopyText";
import { twoDigitPage } from "./labels";

type SectionHeaderProps = {
  /** fixed page number (judge-report R9) */
  page: number;
  /** the cover toc title of this page (22 r7) */
  tocTitle: string;
  /** page title copy (22 r9, r30, r38, ...) */
  title: string;
  lead?: string;
};

/** "01 진단 요약" eyebrow, page headline and lead, per the PDF page tops. */
export default function SectionHeader({
  page,
  tocTitle,
  title,
  lead,
}: SectionHeaderProps) {
  return (
    <header className="flex flex-col gap-3">
      <p className="text-sm text-ink-sub">
        <span className="mr-2 font-semibold text-ink-strong">
          {twoDigitPage(page)}
        </span>
        <span>{tocTitle}</span>
      </p>
      <h2 className="text-[1.75rem] leading-snug font-bold text-ink-title">
        <CopyText text={title} />
      </h2>
      {lead && (
        <p className="text-base leading-relaxed text-ink">
          <CopyText text={lead} />
        </p>
      )}
    </header>
  );
}
