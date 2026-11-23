// Pages 12 to 15: weekly planner (22_리포트요소 r109-r113).
import type { PlannerPage as PlannerData } from "@/lib/diagnosis-v3/types";
import { Bullets, PageEyebrow, PageTitle, Para } from "./LaterShared";
import CopyText from "./parts/CopyText";
import { PLANNER_LABELS as PL } from "./parts/labels";
import ReportSheet from "./parts/ReportSheet";

export default function PlannerPage({
  page,
  no,
}: {
  page: PlannerData;
  no: number;
}) {
  return (
    <ReportSheet page={no}>
      {/* 22 r109 */}
      <header className="flex flex-col gap-1">
        <PageEyebrow page={no} />
        <PageTitle>{page.goal}</PageTitle>
        <p className="text-sm font-bold text-ink">
          <CopyText text={page.badge} />
        </p>
        <Para>{page.redx}</Para>
      </header>
      {/* 22 r110 */}
      <Bullets items={page.done} />
      {/* 22 r111: the completion date column stays blank for the student to fill */}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {PL.columns.map((column) => (
              <th
                key={column}
                scope="col"
                className="border border-[#e5e5e5] p-2 text-left font-bold text-ink"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {page.tasks.map((t) => (
            <tr key={`${t.area}-${t.task}`}>
              <td className="border border-[#e5e5e5] p-2 text-ink">
                <CopyText text={t.area} />
              </td>
              <td className="border border-[#e5e5e5] p-2 text-[#808080]">
                <CopyText text={t.task} />
              </td>
              <td className="border border-[#e5e5e5] p-2 text-[#808080]">
                <CopyText text={t.due} />
              </td>
              <td className="border border-[#e5e5e5] p-2 text-[#808080]">
                {t.done && <CopyText text={t.done} />}
              </td>
              <td className="w-24 border border-[#e5e5e5] p-2" />
            </tr>
          ))}
        </tbody>
      </table>
      {/* 22 r112: 7 day cells, each with blank plan and actual minute lines to write on */}
      <ol className="grid grid-cols-1 gap-2 lg:grid-cols-7">
        {page.days.map((d) => (
          <li
            key={d.date}
            data-testid="day-cell"
            data-highlight={d.highlight}
            className={`flex min-h-28 flex-col gap-1 rounded-lg border p-2 ${d.highlight ? "border-ink bg-[#f5f5f5]" : "border-[#e5e5e5]"}`}
          >
            <p className="text-sm font-bold text-ink">
              <CopyText text={d.date} />
            </p>
            {d.tasks.map((task) => (
              <p key={task} className="text-xs text-[#808080]">
                <CopyText text={task} />
              </p>
            ))}
            <p className="mt-auto text-xs text-ink">{PL.planMinutes}</p>
            <p className="text-xs text-ink">{PL.actualMinutes}</p>
          </li>
        ))}
      </ol>
      {/* spec row 122: weekend check box */}
      <section
        aria-labelledby={`weekend-check-${no}`}
        className="flex flex-col gap-2 rounded-lg border border-[#e5e5e5] p-3"
      >
        <h3 id={`weekend-check-${no}`} className="text-sm font-bold text-ink">
          {PL.weekendCheck}
        </h3>
        <dl className="grid grid-cols-1 gap-2 lg:grid-cols-3">
          {PL.weekendItems.map((item) => (
            <div key={item} className="flex flex-col gap-1">
              <dt className="text-xs text-[#808080]">{item}</dt>
              <dd
                aria-hidden="true"
                className="h-6 border-b border-[#808080]"
              />
            </div>
          ))}
        </dl>
      </section>
      {/* 22 r113 */}
      <Bullets items={page.slip} />
    </ReportSheet>
  );
}
