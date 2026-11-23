// Page 7: admission comparison (22_리포트요소 r71-r77). Absent for M3 (r70), handled by LaterPages.
import type { Page7 } from "@/lib/diagnosis-v3/types";
import {
  Bullets,
  Note,
  PageEyebrow,
  PageTitle,
  Para,
  SectionTitle,
} from "./LaterShared";
import ReportSheet from "./parts/ReportSheet";

export default function Page07Admission({ page }: { page: Page7 }) {
  const { result } = page;
  return (
    <ReportSheet page={7}>
      <PageEyebrow page={7} />
      <PageTitle>{page.title}</PageTitle>
      {result.kind === "computed" ? (
        <section className="flex flex-col gap-3">
          {/* 22 r72 */}
          <dl className="grid grid-cols-1 gap-2 lg:grid-cols-3">
            {[
              result.comparison.cut50,
              result.comparison.cut70,
              result.comparison.mine,
            ]
              .filter((row) => row !== undefined)
              .map((row) => (
                <div
                  key={row.label}
                  className="rounded-lg border border-[#e5e5e5] p-3"
                >
                  <dt className="text-sm text-[#808080]">{row.label}</dt>
                  <dd className="text-xl font-bold text-ink">{row.value}</dd>
                </div>
              ))}
          </dl>
          <Para>{result.comparison.diff}</Para>
          <Note>{result.comparison.source}</Note>
          {/* 22 r73 */}
          <SectionTitle>{result.band.headline}</SectionTitle>
          <Para>{result.band.text}</Para>
          {result.band.precision ? <Note>{result.band.precision}</Note> : null}
        </section>
      ) : (
        <section className="flex flex-col gap-2">
          {/* 22 r74 */}
          {result.universityName ? <Para>{result.universityName}</Para> : null}
          {result.unitName ? <Para>{result.unitName}</Para> : null}
          <Para>{result.text}</Para>
        </section>
      )}
      {/* 22 r75 */}
      {page.cards?.length ? (
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {page.cards.map((card) => (
            <article
              key={card.question}
              className="rounded-lg border border-[#e5e5e5] p-3"
            >
              <p className="text-sm font-bold text-ink">{card.question}</p>
              <p className="text-sm text-ink">{card.answer}</p>
              <Para>{card.text}</Para>
            </article>
          ))}
        </section>
      ) : null}
      {/* 22 r76 */}
      <section className="flex flex-col gap-2">
        <SectionTitle>{page.roadmap.title}</SectionTitle>
        <ol className="flex flex-col gap-2">
          {page.roadmap.steps.map((step) => (
            <li key={step.when} className="flex gap-3">
              <span className="w-24 shrink-0 text-sm font-bold text-ink">
                {step.when}
              </span>
              <span className="text-base text-[#808080]">{step.text}</span>
            </li>
          ))}
        </ol>
      </section>
      {/* 22 r77 */}
      <Bullets items={page.notes} />
    </ReportSheet>
  );
}
