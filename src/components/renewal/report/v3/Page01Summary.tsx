import type { Page1 } from "@/lib/diagnosis-v3/types";
import CopyText from "./parts/CopyText";
import { REPORT_LABELS as L } from "./parts/labels";
import RadarChart7 from "./parts/RadarChart7";
import ReportCard from "./parts/ReportCard";
import ReportSheet from "./parts/ReportSheet";
import SectionHeader from "./parts/SectionHeader";

const PAGE = 1;

type Page01SummaryProps = { page: Page1; tocTitle: string };

/** 1p summary, 22 r9-r27. */
export default function Page01Summary({ page, tocTitle }: Page01SummaryProps) {
  const { profile } = page;
  const profileRows = [
    [L.profileTarget, profile.target],
    [L.profileGpa, profile.gpa],
    [L.profileTrend, profile.trend],
    [L.profilePeriod, profile.period],
    [L.profileTemperament, profile.temperament],
    [L.profileReliability, profile.reliability],
  ] as const;

  return (
    <ReportSheet page={PAGE}>
      <SectionHeader
        page={PAGE}
        tocTitle={tocTitle}
        title={page.title}
        lead={page.lead}
      />
      <div className="grid grid-cols-2 gap-4">
        {/* 22 r12-r18 */}
        <ReportCard title={L.profile}>
          <dl className="grid grid-cols-[6rem_1fr] gap-y-2">
            <dt className="text-ink-sub">{L.profileGradeSchool}</dt>
            <dd>
              <span>{profile.grade}</span>
              {L.joiner}
              <span>{profile.school}</span>
            </dd>
            {profileRows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-ink-sub">{label}</dt>
                <dd>
                  <CopyText text={value} />
                </dd>
              </div>
            ))}
          </dl>
        </ReportCard>
        {/* 22 r19 */}
        <ReportCard
          title={L.cycleRadar}
          meta={`${L.total} ${page.radar.total}${L.points}`}
        >
          <RadarChart7 axes={page.radar.stages} target={page.radar.target} />
          <p className="text-right text-xs text-ink-sub">
            {L.targetLegend} {page.radar.target}
            {L.points}
          </p>
        </ReportCard>
      </div>
      {/* 22 r20-r22 */}
      <div className="grid grid-cols-3 gap-4">
        <ReportCard title={page.kpi1.label}>
          <p className="text-xl font-bold">
            {page.kpi1.area.label} {page.kpi1.area.score}
            {L.points}
          </p>
          <p className="text-ink-sub">{page.kpi1.subtitle}</p>
        </ReportCard>
        <ReportCard title={page.kpi2.label}>
          <p className="text-xl font-bold">
            <span>{page.kpi2.total}</span>
            {L.points}
          </p>
          <p className="text-ink-sub">{page.kpi2.sub}</p>
        </ReportCard>
        <ReportCard title={page.kpi3.label}>
          <p className="text-xl font-bold">
            {page.kpi3.area.label} {page.kpi3.area.score}
            {L.points}
          </p>
          <p className="text-ink-sub">{page.kpi3.sub}</p>
        </ReportCard>
      </div>
      {/* 22 r10, absent when SIMPLE */}
      {page.typeSummary && (
        <section className="rounded-xl bg-surface-card p-4 text-sm">
          <h3 className="font-bold">
            {L.studentType}
            {L.joiner}
            {page.typeSummary.name}
          </h3>
          <p className="mt-1">
            <CopyText text={page.typeSummary.body} />
          </p>
        </section>
      )}
      {/* 22 r23-r26 */}
      <ReportCard title={L.traits}>
        <p className="text-ink-sub">
          <CopyText text={page.traitIntro} />
        </p>
        <div className="grid grid-cols-3 gap-4">
          {page.traits.map((trait) => (
            <section key={trait.heading} className="flex flex-col gap-1">
              <h4 className="font-semibold">
                <CopyText text={trait.heading} />
              </h4>
              <p className="text-ink">
                <CopyText text={trait.body} />
              </p>
            </section>
          ))}
        </div>
      </ReportCard>
      {/* 22 r27 */}
      <section className="flex gap-6 rounded-xl bg-navy-ink p-6 text-white">
        <h3 className="w-24 shrink-0 text-sm">{page.one.title}</h3>
        <ul className="flex flex-col gap-1 text-base font-semibold">
          {page.one.actions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ul>
      </section>
    </ReportSheet>
  );
}
