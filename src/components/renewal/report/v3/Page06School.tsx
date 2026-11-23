import type { Page6, TextBlock } from "@/lib/diagnosis-v3/types";
import CopyText from "./parts/CopyText";
import { REPORT_LABELS as L } from "./parts/labels";
import PrescriptionTable from "./parts/PrescriptionTable";
import ReportCard from "./parts/ReportCard";
import ReportSheet from "./parts/ReportSheet";
import ScoreBars from "./parts/ScoreBars";
import SectionHeader from "./parts/SectionHeader";

const PAGE = 6;

type Page06SchoolProps = { page: Page6; tocTitle: string };

/** 6p school readiness, 22 r63-r69. */
export default function Page06School({ page, tocTitle }: Page06SchoolProps) {
  return (
    <ReportSheet page={PAGE}>
      <SectionHeader
        page={PAGE}
        tocTitle={tocTitle}
        title={page.title}
        lead={page.lead}
      />
      <div className="grid grid-cols-2 gap-4">
        {/* 22 r65: already low to high in the payload */}
        <ReportCard title={tocTitle}>
          <p>
            <span className="text-sm text-ink-sub">{L.total} </span>
            <span className="text-xl font-bold">{page.bars.total}</span>
          </p>
          <ScoreBars bars={page.bars.areas} />
          <p className="text-xs text-ink-sub">
            <CopyText text={page.bars.gradeText} />
          </p>
        </ReportCard>
        {/* 22 r66-r67 */}
        <ReportCard title={L.hardest}>
          {page.hardest && (
            <ul className="flex flex-col gap-1">
              {page.hardest.map((item) => (
                <li key={item.option}>
                  <CopyText text={item.option} />
                  {L.joiner}
                  <CopyText text={item.area} />
                </li>
              ))}
            </ul>
          )}
          <p className="rounded-lg bg-surface-card p-3">
            <CopyText text={page.overlap} />
          </p>
        </ReportCard>
      </div>
      {/* 22 r68 */}
      <div className="grid grid-cols-2 gap-4">
        <ReportCard title={L.strengths}>
          <TextBlockList blocks={page.strengths} />
          {page.strengthNote && (
            <p className="text-ink-sub">
              <CopyText text={page.strengthNote} />
            </p>
          )}
        </ReportCard>
        <ReportCard title={L.weaknesses}>
          <TextBlockList blocks={page.weaknesses} />
        </ReportCard>
      </div>
      {/* 22 r69 */}
      <PrescriptionTable rx={page.rx} />
    </ReportSheet>
  );
}

function TextBlockList({ blocks }: { blocks: readonly TextBlock[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-4">
      {blocks.map((block) => (
        <li key={block.heading}>
          <span className="font-semibold">
            <CopyText text={block.heading} />
          </span>
          {L.joiner}
          <CopyText text={block.body} />
        </li>
      ))}
    </ul>
  );
}
