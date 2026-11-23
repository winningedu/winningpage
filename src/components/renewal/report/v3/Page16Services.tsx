// Page 16: services (22_리포트요소 r115-r121).
import type { Page16 } from "@/lib/diagnosis-v3/types";
import {
  Bullets,
  Note,
  PageSheet,
  PageTitle,
  Para,
  SectionTitle,
} from "./LaterShared";

export default function Page16Services({ page }: { page: Page16 }) {
  return (
    <PageSheet no={16}>
      {/* 22 r115 */}
      <PageTitle>{page.title}</PageTitle>
      {/* 22 r116 */}
      <ul className="flex flex-wrap gap-2">
        {page.preferences.map((chip) => (
          <li
            key={chip}
            className="rounded-full border border-[#e5e5e5] px-3 py-1 text-sm text-ink"
          >
            {chip}
          </li>
        ))}
      </ul>
      {/* 22 r117 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {page.services.map((svc) => (
          <article
            key={svc.code}
            className="flex flex-col gap-2 rounded-lg border border-[#e5e5e5] p-4"
          >
            <p className="text-sm font-bold text-ink">{svc.prefix}</p>
            <SectionTitle>{svc.name}</SectionTitle>
            <Para>{svc.text}</Para>
            <ul className="flex flex-wrap gap-2">
              {svc.tags.map((tag) => (
                <li key={tag} className="text-xs text-[#808080]">
                  {tag}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      {/* 22 r118 */}
      {page.scopeNote ? <Note>{page.scopeNote}</Note> : null}
      {/* 22 r119 */}
      <ol className="flex list-decimal flex-col gap-2 ps-4.5">
        {page.agenda.map((item) => (
          <li key={item} className="text-base text-[#808080]">
            {item}
          </li>
        ))}
      </ol>
      {/* 22 r120 */}
      <Bullets items={page.reading} />
      {/* 22 r121 */}
      {page.footer.map((text) => (
        <Note key={text}>{text}</Note>
      ))}
    </PageSheet>
  );
}
