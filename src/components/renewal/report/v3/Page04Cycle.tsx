import type { Page4 } from "@/lib/diagnosis-v3/types";
import CopyText from "./parts/CopyText";
import { REPORT_LABELS as L } from "./parts/labels";
import PrescriptionTable from "./parts/PrescriptionTable";
import RadarChart7 from "./parts/RadarChart7";
import ReportCard from "./parts/ReportCard";
import ReportSheet from "./parts/ReportSheet";
import SectionHeader from "./parts/SectionHeader";

const PAGE = 4;

type Page04CycleProps = { page: Page4; tocTitle: string };

/** 4p 7-stage cycle, 22 r48-r53. */
export default function Page04Cycle({ page, tocTitle }: Page04CycleProps) {
  const { cycle } = page;
  return (
    <ReportSheet page={PAGE}>
      <SectionHeader
        page={PAGE}
        tocTitle={tocTitle}
        title={page.title}
        lead={page.lead}
      />
      <div className="grid grid-cols-2 gap-4">
        {/* 22 r49-r50: break marks come from the payload (45 미만) */}
        <ReportCard title={L.myCycle}>
          <RadarChart7 axes={cycle.stages} />
          <p className="text-center">
            <span className="text-sm text-ink-sub">{L.total} </span>
            <span className="text-2xl font-bold">{cycle.total}</span>
          </p>
          <p className="text-center font-semibold">
            <CopyText text={cycle.gradeText} />
          </p>
          <p className="text-center text-xs text-ink-sub">
            <CopyText text={cycle.caption} />
          </p>
          <p className="text-center text-xs text-ink-sub">
            <CopyText text={page.scoreNote} />
          </p>
        </ReportCard>
        {/* 22 r51-r52 */}
        <ReportCard title={L.breakPoints}>
          {page.breaks.map((item) => (
            <section key={item.heading} className="flex flex-col gap-1">
              <h3 className="font-semibold text-error">
                <CopyText text={item.heading} />
              </h3>
              <p>
                <CopyText text={item.body} />
              </p>
            </section>
          ))}
          {page.why && (
            <section className="rounded-lg bg-surface-card p-3">
              <h3 className="font-semibold">
                <CopyText text={page.why.heading} />
              </h3>
              <p className="text-ink">
                <CopyText text={page.why.body} />
              </p>
            </section>
          )}
        </ReportCard>
      </div>
      {/* 22 r53 */}
      <PrescriptionTable rx={page.rx} />
    </ReportSheet>
  );
}
