import { formatKoreanDate } from "@/components/growth/reports/reportsLogic";
import type { ReportDetail } from "@/lib/growth/api";
import {
  BADGE_LABELS,
  FORMAT_LABELS,
  groupSectionsByPart,
  normalizeNarrative,
  normalizeOverview,
  normalizeSections,
  omittedNotice,
  REPORT_NOTICES,
  type SectionView,
} from "./reportLogic";
import SectionBodyView from "./SectionBodyView";
import { normalizeBody } from "./sectionBody";

const CARD = "rounded-xl border border-border bg-white p-6";

function SectionCard({ section }: { section: SectionView }) {
  return (
    <section aria-label={`${section.id} ${section.title}`} className={CARD}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-app-label font-semibold text-ink-sub">
          {section.id}
        </span>
        <h3 className="text-app-card-title font-semibold text-ink-strong">
          {section.title}
        </h3>
        {section.format && (
          <span className="rounded-full bg-surface-04 px-2 py-0.5 text-app-badge text-ink-sub">
            {FORMAT_LABELS[section.format]}
          </span>
        )}
        {section.badge && (
          <span className="rounded-full bg-surface-04 px-2 py-0.5 text-app-badge font-semibold text-ink-strong">
            {BADGE_LABELS[section.badge]}
          </span>
        )}
        {section.evidenceCount > 0 && (
          <span className="text-app-caption text-ink-sub">
            근거 {section.evidenceCount}건
          </span>
        )}
      </div>
      <SectionBodyView body={normalizeBody(section)} />
    </section>
  );
}

type Props = { detail: ReportDetail; parentView?: boolean };

/** 리포트 본문. 학생 화면(ReportPage)과 학부모 열람이 같이 쓴다. */
export default function ReportBody({ detail, parentView = false }: Props) {
  const { report } = detail;
  const narrative = normalizeNarrative(report.narrative);
  const overview = normalizeOverview(report.overview);
  const groups = groupSectionsByPart(normalizeSections(report.sections));
  const notice = omittedNotice({
    omitted: report.omitted,
    excludedSectionIds: report.excludedSectionIds,
    parentView,
  });
  const previousDate = narrative?.previous
    ? formatKoreanDate(narrative.previous.issuedAt)
    : "";

  return (
    <div className="flex flex-col gap-6">
      {notice && (
        <section aria-label="제외 항목 안내" className={CARD}>
          <p className="text-app-body text-ink-strong">{notice.message}</p>
          <p className="mt-1 text-app-label text-ink-sub">
            제외된 항목 {notice.ids.join(", ")}
          </p>
        </section>
      )}

      {narrative && (
        <section aria-label="이 학생의 대주제" className={CARD}>
          <p className="text-app-label text-ink-sub">이 학생의 대주제</p>
          <p className="mt-1 text-app-section font-bold text-ink-strong">
            {narrative.theme}
          </p>
          {narrative.subthemes.length > 0 && (
            <ul className="mt-4 grid grid-cols-3 gap-3">
              {narrative.subthemes.map((s) => (
                <li key={s.label} className="rounded-lg bg-surface-04 p-3">
                  <p className="text-app-label font-semibold text-ink-strong">
                    {s.label}
                  </p>
                  <p className="mt-1 text-app-label text-ink-sub">{s.text}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {narrative?.previous && (
        <section aria-label="진로 변경 안내" className={CARD}>
          <p className="text-app-body text-ink-strong">
            이전 대주제 {narrative.previous.theme}
            {previousDate ? ` (${previousDate} 리포트)` : ""}에서 바뀌었어요.
          </p>
        </section>
      )}

      {overview.length > 0 && (
        <section aria-label="한눈에">
          <h2 className="mb-3 text-app-section font-bold text-ink-strong">
            한눈에
          </h2>
          <ul className="grid grid-cols-3 gap-3">
            {overview.map((c) => (
              <li key={c.key} className={CARD}>
                <p className="text-app-label text-ink-sub">{c.label}</p>
                <p className="mt-1 text-app-stat font-bold text-ink-strong">
                  {c.value}
                </p>
                {c.sub && (
                  <p className="mt-1 text-app-caption text-ink-sub">{c.sub}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {groups.map((g) => (
        <div key={g.part} className="flex flex-col gap-4">
          <h2 className="text-app-section font-bold text-ink-strong">
            {g.title} ({g.sections.length}항목)
          </h2>
          {g.sections.map((s) => (
            <SectionCard key={s.id} section={s} />
          ))}
        </div>
      ))}

      <section aria-label="꼭 알아 두세요" className={CARD}>
        <p className="text-app-label font-semibold text-ink-strong">
          꼭 알아 두세요
        </p>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-app-label text-ink-sub">
          {REPORT_NOTICES.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
