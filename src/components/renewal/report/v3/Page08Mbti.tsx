// Page 8: MBTI (22_리포트요소 r79-r84).
import type { Page8 } from "@/lib/diagnosis-v3/types";
import { Bullets, Note, Para, SectionTitle } from "./LaterShared";
import ReportSheet from "./parts/ReportSheet";

export default function Page08Mbti({ page }: { page: Page8 }) {
  const { mbti } = page;
  return (
    <ReportSheet page={8}>
      {mbti.kind === "type" ? (
        <>
          {/* 22 r79 */}
          <section className="flex flex-col gap-1 rounded-lg border border-[#e5e5e5] p-4">
            <p className="text-3xl font-bold text-ink">{mbti.card.type}</p>
            <SectionTitle>{mbti.card.nick}</SectionTitle>
            <Para>{mbti.card.style}</Para>
            <Note>{mbti.card.share}</Note>
          </section>
          {/* 22 r80 */}
          <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {mbti.poles.map((pole) => (
              <article
                key={pole.letter}
                className="flex flex-col gap-1 rounded-lg border border-[#e5e5e5] p-3"
              >
                <p className="text-sm font-bold text-ink">{pole.name}</p>
                <Para>{pole.habit}</Para>
                <Para>{pole.tip}</Para>
              </article>
            ))}
          </section>
          {/* 22 r81 */}
          <section className="flex flex-col gap-2">
            <Para>{mbti.factors.text}</Para>
            <Bullets items={mbti.factors.habits} />
            {mbti.factors.smallSample ? (
              <Note>{mbti.factors.smallSample}</Note>
            ) : null}
          </section>
          {/* 22 r82 */}
          <Bullets items={mbti.links} />
        </>
      ) : (
        <section className="flex flex-col gap-2">
          {/* 22 r83 */}
          <Para>{mbti.text}</Para>
          <Bullets items={mbti.habits} />
        </section>
      )}
      {/* 22 r84 */}
      <Note>{page.disclaimer}</Note>
    </ReportSheet>
  );
}
