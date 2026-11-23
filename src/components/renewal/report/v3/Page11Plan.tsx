// Page 11: 4 week plan (22_리포트요소 r101-r107), labelled like the improved report PDF p12.
import type { Page11 } from "@/lib/diagnosis-v3/types";
import { withDedupedKeys } from "@/lib/reactKeys";
import { Bullets, Note, PageEyebrow, PageTitle, Para } from "./LaterShared";
import CopyText from "./parts/CopyText";
import { REPORT_LABELS as L, PLAN_LABELS as PL } from "./parts/labels";
import ReportSheet from "./parts/ReportSheet";

const WEEK_CHECKS = 4;
const REDUCED_DOT = "inline-block size-2 rounded-full bg-[#e5484d]";

/** 22 r107 order: the last day of weeks 1 to 4, the re-diagnosis day, then Day 29..42 events. */
const checkpointLabel = (index: number) => {
  if (index < WEEK_CHECKS) return `${index + 1}${PL.checkSuffix}`;
  if (index === WEEK_CHECKS) return L.redx;
  return PL.afterLabel;
};

export default function Page11Plan({ page }: { page: Page11 }) {
  const { urgency, events, table, numbers } = page;
  const hasReducedWeek = table.weeks.some((w) => w.reduced);
  return (
    <ReportSheet page={11}>
      {/* 22 r101 */}
      <PageEyebrow page={11} />
      <PageTitle>{page.title}</PageTitle>
      <Para>{page.lead}</Para>
      {/* 22 r102 */}
      <section className="flex flex-col gap-1 rounded-lg border border-[#e5e5e5] p-3">
        <p className="text-sm text-ink">
          <span className="font-bold">
            <CopyText text={urgency.title} />
          </span>{" "}
          <span className="font-bold">{`${urgency.points}${L.points}`}</span>
          {L.joiner}
          <span>
            <CopyText text={urgency.label} />
          </span>
        </p>
        <Para>{urgency.text}</Para>
      </section>
      {/* 22 r103 */}
      {events.kind === "events" ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {events.within.length > 0 ? (
            <section className="flex flex-col gap-2 rounded-lg border border-[#e5e5e5] p-3">
              <h3 className="text-sm font-bold text-ink">{PL.eventsWithin}</h3>
              <Bullets items={events.within} />
            </section>
          ) : null}
          {events.after ? (
            <section className="flex flex-col gap-2 rounded-lg border border-[#e5e5e5] p-3">
              <h3 className="text-sm font-bold text-ink">{PL.eventsAfter}</h3>
              <Para>{events.after}</Para>
            </section>
          ) : null}
        </div>
      ) : (
        <Para>{events.text}</Para>
      )}
      {/* 22 r104: reduced weeks already carry PLAN_REDUCE in their cells */}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th
              scope="col"
              className="w-16 border border-[#e5e5e5] p-2 text-ink"
            >
              {PL.week}
            </th>
            {table.columns.map((c) => (
              <th
                key={c}
                scope="col"
                className="border border-[#e5e5e5] p-2 text-ink"
              >
                <CopyText text={c} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.weeks.map((w) => (
            <tr key={w.week}>
              <th scope="row" className="border border-[#e5e5e5] p-2 text-ink">
                {`${w.week}${PL.weekSuffix}`}
                {w.reduced ? (
                  <span
                    data-testid="reduced-week"
                    role="img"
                    aria-label={PL.reducedWeek}
                    className={`ms-1 ${REDUCED_DOT}`}
                  />
                ) : null}
              </th>
              {w.cells.map((cell) => (
                <td
                  key={cell}
                  className="border border-[#e5e5e5] p-2 text-[#808080]"
                >
                  <CopyText text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {hasReducedWeek ? (
        <p className="flex items-center gap-1 text-sm text-[#808080]">
          <span aria-hidden className={REDUCED_DOT} />
          {PL.reducedWeek}
        </p>
      ) : null}
      <Note>{table.ruleNote}</Note>
      {/* 22 r105 */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="flex flex-col gap-1">
          <p className="text-xl font-bold text-ink">{`${numbers.logMinutes}${PL.minutes}`}</p>
          <p className="text-sm text-[#808080]">{PL.logCaption}</p>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-xl font-bold text-ink">
            {`${numbers.rates[0]}${PL.arrow}${numbers.rates.at(-1)}${PL.percent}`}
          </p>
          <p className="text-sm text-[#808080]">{PL.rateCaption}</p>
        </div>
        <p className="text-base font-bold text-ink">
          <CopyText text={numbers.minLoad} />
        </p>
      </section>
      {/* 22 r106 */}
      {page.styleTips ? <Bullets items={page.styleTips} /> : null}
      {/* 22 r107 */}
      <ol className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {withDedupedKeys([...page.checkpoints]).map(({ item, key }, index) => (
          <li key={key} className="flex flex-col gap-1">
            <span className="text-base font-bold text-ink">
              <CopyText text={item} />
            </span>
            <span className="text-sm text-[#808080]">
              {checkpointLabel(index)}
            </span>
          </li>
        ))}
      </ol>
    </ReportSheet>
  );
}
