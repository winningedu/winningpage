// Page 11: 4 week plan (22_리포트요소 r101-r107).
import type { Page11 } from "@/lib/diagnosis-v3/types";
import { Bullets, Note, PageEyebrow, PageTitle, Para } from "./LaterShared";
import CopyText from "./parts/CopyText";
import ReportSheet from "./parts/ReportSheet";

export default function Page11Plan({ page }: { page: Page11 }) {
  const { events, table, numbers } = page;
  return (
    <ReportSheet page={11}>
      {/* 22 r101 */}
      <PageEyebrow page={11} />
      <PageTitle>{page.title}</PageTitle>
      <Para>{page.lead}</Para>
      {/* 22 r102 */}
      <section className="rounded-lg border border-[#e5e5e5] p-3">
        <p className="text-sm font-bold text-ink">
          <CopyText text={page.urgency.label} />
        </p>
        <Para>{page.urgency.text}</Para>
      </section>
      {/* 22 r103 */}
      {events.kind === "events" ? (
        <section className="flex flex-col gap-2">
          <Bullets items={events.within} />
          {events.after ? <Para>{events.after}</Para> : null}
        </section>
      ) : (
        <Para>{events.text}</Para>
      )}
      {/* 22 r104 */}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className="w-16 border border-[#e5e5e5] p-2" />
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
                {w.week}
                {w.reduced ? (
                  <span
                    data-testid="reduced-week"
                    className="ms-1 inline-block size-2 rounded-full bg-[#e5484d]"
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
      {table.reduceNote ? <Note>{table.reduceNote}</Note> : null}
      <Note>{table.ruleNote}</Note>
      {/* 22 r105 */}
      <section className="flex flex-col gap-1">
        <p className="text-xl font-bold text-ink">{numbers.logMinutes}</p>
        <ul className="flex gap-4">
          {numbers.rates.map((rate) => (
            <li key={rate} className="text-xl font-bold text-ink">
              {rate}
            </li>
          ))}
        </ul>
        <Para>{numbers.minLoad}</Para>
      </section>
      {/* 22 r106 */}
      {page.styleTips ? <Bullets items={page.styleTips} /> : null}
      {/* 22 r107 */}
      <Bullets items={page.checkpoints} />
    </ReportSheet>
  );
}
