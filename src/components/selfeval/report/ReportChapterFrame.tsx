import type { ReactNode } from "react";
import { site } from "@/config/site";

type Props = {
  no: string;
  title: string;
  intro: ReactNode;
  /** 쪽수. 표지가 1쪽이라 01장은 2쪽이다. */
  page: number;
  /** 바닥글 왼쪽. 예: QA학생, 수학 자기평가서 */
  footer: string;
  titleExtra?: ReactNode;
  children: ReactNode;
};

// 장 하나 = 인쇄 A4 한 쪽. 머리말(로고, SELF EVALUATION REPORT)과 바닥글(학생명, 과목, 쪽수)은 장마다 단다(명세 No.171).
// mm 는 rem 규칙의 의도된 예외다. 인쇄 페이지가 물리 크기 A4(여백 15mm 제외 267mm)이므로.
export default function ReportChapterFrame({
  no,
  title,
  intro,
  page,
  footer,
  titleExtra,
  children,
}: Props) {
  return (
    <section
      aria-label={`${no} ${title}`}
      className="flex flex-col rounded-2xl border border-line bg-white p-4 break-keep sm:p-8 print:min-h-[266mm] print:break-before-page print:rounded-none print:border-0 print:p-0"
    >
      <header className="flex items-center justify-between border-b border-line pb-3">
        <img
          src={site.logo.horizontal}
          alt={site.brandName}
          className="h-5 w-auto"
        />
        <p className="text-app-caption uppercase tracking-[0.2em] text-ink-natural">
          SELF EVALUATION REPORT
        </p>
      </header>
      <div className="mt-6 flex flex-1 flex-col gap-4">
        <div>
          <p className="text-app-label font-bold text-[#1e6fd9]">{no}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h2 className="text-app-title font-extrabold text-ink-strong">
              {title}
            </h2>
            {titleExtra}
          </div>
          <p className="mt-2 text-app-label text-ink-sub">{intro}</p>
        </div>
        {children}
      </div>
      <footer className="mt-8 flex items-center justify-between border-t border-line pt-3 text-app-caption text-ink-natural">
        <span>{footer}</span>
        <span>{String(page).padStart(2, "0")}</span>
      </footer>
    </section>
  );
}
