// Page 10: temperament based admission design (22_리포트요소 r96-r99).
import type { Page10 } from "@/lib/diagnosis-v3/types";
import { Bullets, PageSheet, PageTitle, Para } from "./LaterShared";

export default function Page10TempAdmission({ page }: { page: Page10 }) {
  const { admission } = page;
  return (
    <PageSheet no={10}>
      {/* 22 r96 */}
      <PageTitle>{page.title}</PageTitle>
      <Para>{page.intro}</Para>
      {/* 22 r97 rules, 22 r98 hidden notice */}
      {admission.kind === "rules" ? (
        <div className="flex flex-col gap-3">
          {admission.areas.map((area) => (
            <section key={area.area}>
              <Bullets items={area.texts} />
            </section>
          ))}
        </div>
      ) : (
        <Para>{admission.text}</Para>
      )}
      {/* 22 r99 */}
      <Bullets items={page.methods} />
    </PageSheet>
  );
}
