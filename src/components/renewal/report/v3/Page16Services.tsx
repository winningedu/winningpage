// Page 16: services (22_리포트요소 r115-r121).
import { site } from "@/config/site";
import type { Page16 } from "@/lib/diagnosis-v3/types";
import {
  Bullets,
  Note,
  PageEyebrow,
  PageTitle,
  Para,
  SectionTitle,
} from "./LaterShared";
import CopyText from "./parts/CopyText";
import ReportSheet from "./parts/ReportSheet";

/**
 * Sites with callmentor closed (site.features.callmentor false) hide the
 * callmentor card at render and show the legacy notice instead of the scope
 * note (judge R1; src/lib/diagnosisReport.ts CALLMENTOR_CLOSED_NOTICE). These two
 * strings are the only text decided outside 22/copy; other scopes get none.
 */
const CLOSED_SITE_NOTICE: Partial<
  Record<NonNullable<Page16["scope"]>, string>
> = {
  M3: "중학교 3학년은 목표관리가 추천 대상입니다. 나머지 서비스는 고등학교 활동을 전제로 하므로 진학 이후에 안내드립니다.",
  G3LATE:
    "고등학교 3학년 6월 이후에는 남은 기간 안에 바로 실행할 수 있는 목표관리를 우선 안내드립니다.",
};

export default function Page16Services({ page }: { page: Page16 }) {
  const callmentorOpen = site.features.callmentor;
  const services = callmentorOpen
    ? page.services
    : page.services.filter((svc) => svc.code !== "CALL");
  const scopeNote = callmentorOpen
    ? page.scopeNote
    : page.scope && CLOSED_SITE_NOTICE[page.scope];
  return (
    <ReportSheet page={16}>
      {/* 22 r115 */}
      <PageEyebrow page={16} />
      <PageTitle>{page.title}</PageTitle>
      {/* 17 SVC_LEAD */}
      <Para>{page.lead}</Para>
      {/* 22 r116 */}
      <ul className="flex flex-wrap gap-2">
        {page.preferences.map((chip) => (
          <li
            key={chip}
            className="rounded-full border border-[#e5e5e5] px-3 py-1 text-sm text-ink"
          >
            <CopyText text={chip} />
          </li>
        ))}
      </ul>
      {/* 22 r117 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {services.map((svc) => (
          <article
            key={svc.code}
            className="flex flex-col gap-2 rounded-lg border border-[#e5e5e5] p-4"
          >
            <p className="text-sm font-bold text-ink">
              <CopyText text={svc.prefix} />
            </p>
            <SectionTitle>{svc.name}</SectionTitle>
            <Para>{svc.text}</Para>
            <ul className="flex flex-wrap gap-2">
              {svc.tags.map((tag) => (
                <li key={tag} className="text-xs text-[#808080]">
                  <CopyText text={tag} />
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      {/* 22 r118 */}
      {scopeNote ? <Note>{scopeNote}</Note> : null}
      {/* 22 r119 */}
      <ol className="flex list-decimal flex-col gap-2 ps-4.5">
        {page.agenda.map((item) => (
          <li key={item} className="text-base text-[#808080]">
            <CopyText text={item} />
          </li>
        ))}
      </ol>
      {/* 22 r120 */}
      <Bullets items={page.reading} />
      {/* 22 r121 */}
      {page.footer.map((text) => (
        <Note key={text}>{text}</Note>
      ))}
    </ReportSheet>
  );
}
