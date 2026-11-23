// Page 9: temperament profile (22_리포트요소 r86-r94).
import type { Page9 } from "@/lib/diagnosis-v3/types";
import {
  Bullets,
  Note,
  PageEyebrow,
  PageTitle,
  Para,
  SectionTitle,
} from "./LaterShared";
import ReportSheet from "./parts/ReportSheet";

export default function Page09Temperament({ page }: { page: Page9 }) {
  return (
    <ReportSheet page={9}>
      {/* 22 r86, r87 */}
      <PageEyebrow page={9} />
      <PageTitle>{page.title}</PageTitle>
      <Para>{page.lead}</Para>
      <Note>{page.scaleNote}</Note>
      {/* 22 r88 */}
      <section className="flex flex-col gap-1 rounded-lg border border-[#e5e5e5] p-4">
        <SectionTitle>{page.hero.name}</SectionTitle>
        <p className="text-sm font-bold text-ink">{page.hero.sub}</p>
        <Para>{page.hero.body}</Para>
      </section>
      {/* 22 r89 */}
      <ul className="flex flex-col gap-2">
        {page.dims.map((d) => (
          <li key={d.dim} className="flex gap-3">
            <span className="w-48 shrink-0 text-sm font-bold text-ink">
              {`${d.label} ${d.dim} ${d.score} ${d.levelLabel}`}
            </span>
            <span className="text-base text-[#808080]">{d.text}</span>
          </li>
        ))}
      </ul>
      {/* 22 r90 */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Bullets items={page.study.strengths} />
        <Bullets items={page.study.cautions} />
      </section>
      {/* 22 r91 */}
      <Bullets items={page.crossCheck} />
      {/* 22 r92 */}
      <section className="flex flex-col gap-2">
        {page.factors.items.map((item) => (
          <div key={item.factor} className="flex flex-col gap-1">
            <SectionTitle>{item.heading}</SectionTitle>
            <Para>{item.text}</Para>
          </div>
        ))}
        <Para>{page.factors.swayCause}</Para>
      </section>
      {/* 22 r93 */}
      {page.lowReliability ? <Note>{page.lowReliability}</Note> : null}
      {/* 22 r94 */}
      <Note>{page.protect}</Note>
    </ReportSheet>
  );
}
