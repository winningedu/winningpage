// Pages 12 to 15: weekly planner (22_리포트요소 r109-r113).
import type { PlannerPage as PlannerData } from "@/lib/diagnosis-v3/types";
import { Bullets, PageTitle, Para } from "./LaterShared";
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
        <PageTitle>{page.goal}</PageTitle>
        <p className="text-sm font-bold text-ink">{page.badge}</p>
        <Para>{page.redx}</Para>
      </header>
      {/* 22 r110 */}
      <Bullets items={page.done} />
      {/* 22 r111: the completion date column stays blank for the student to fill */}
      <table className="w-full border-collapse text-sm">
        <tbody>
          {page.tasks.map((t) => (
            <tr key={`${t.area}-${t.task}`}>
              <td className="border border-[#e5e5e5] p-2 text-ink">{t.area}</td>
              <td className="border border-[#e5e5e5] p-2 text-[#808080]">
                {t.task}
              </td>
              <td className="border border-[#e5e5e5] p-2 text-[#808080]">
                {t.due}
              </td>
              <td className="w-24 border border-[#e5e5e5] p-2 text-[#808080]">
                {t.done}
              </td>
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
            <p className="text-sm font-bold text-ink">{d.date}</p>
            {d.tasks.map((task) => (
              <p key={task} className="text-xs text-[#808080]">
                {task}
              </p>
            ))}
            <span
              aria-hidden="true"
              className="mt-auto block border-b border-[#808080]"
            />
            <span
              aria-hidden="true"
              className="block border-b border-[#808080]"
            />
          </li>
        ))}
      </ol>
      {/* 22 r113 */}
      <Bullets items={page.slip} />
    </ReportSheet>
  );
}
