// Page 10: temperament based admission design (22_리포트요소 r96-r99).
import type { Page10 } from "@/lib/diagnosis-v3/types";
import {
  Bullets,
  Note,
  PageEyebrow,
  PageTitle,
  Para,
  SectionTitle,
} from "./LaterShared";
import { REPORT_LABELS as L } from "./parts/labels";
import ReportSheet from "./parts/ReportSheet";

export default function Page10TempAdmission({ page }: { page: Page10 }) {
  const { admission } = page;
  return (
    <ReportSheet page={10}>
      {/* 22 r96 */}
      <PageEyebrow page={10} />
      <PageTitle>{page.title}</PageTitle>
      <Para>{page.intro}</Para>
      {/* 22 r97 rules, 22 r98 hidden notice */}
      {admission.kind === "rules" ? (
        <div className="flex flex-col gap-3">
          {admission.areas.map((area) => (
            <section key={area.area} className="flex flex-col gap-1">
              <SectionTitle>{area.name}</SectionTitle>
              {/* 22 r97 D basis; no copy id holds a heading word for it */}
              {area.basis.length > 0 ? (
                <Note>
                  {area.basis.map((value, i) => (
                    <span key={value.label}>
                      {i > 0 ? L.joiner : null}
                      <span>{`${value.label} ${value.score}`}</span>
                    </span>
                  ))}
                </Note>
              ) : null}
              <Bullets items={area.texts} />
            </section>
          ))}
        </div>
      ) : (
        <Para>{admission.text}</Para>
      )}
      {/* 22 r99 */}
      <Bullets items={page.methods} />
    </ReportSheet>
  );
}
