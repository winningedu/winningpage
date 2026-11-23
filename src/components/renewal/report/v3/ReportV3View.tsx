import { type ReactNode, useEffect, useRef, useState } from "react";
import "@/styles/report-print.css";
import type { DiagnosisV3Pages } from "@/lib/diagnosis-v3/types";
import { buildPrintDocument } from "@/lib/report/buildPrintDocument";
import {
  downloadReportPdf,
  getReportAccessToken,
} from "@/lib/report/downloadReportPdf";
import { shouldUseServerPdf } from "@/lib/report/shouldUseServerPdf";
import { buildReportFileName } from "@/pages/renewal/reportFileName";
import CoverPage from "./CoverPage";
import Page01Summary from "./Page01Summary";
import Page02Goal from "./Page02Goal";
import Page03Grades from "./Page03Grades";
import Page04Cycle from "./Page04Cycle";
import Page05Obstacles from "./Page05Obstacles";
import Page06School from "./Page06School";
import { pageTitle } from "./parts/labels";

// Same A4 print rule as DiagnosisReportView (legacy view): the rule is a
// <style> that exists only while the report is mounted, so the global @page and
// the 3mm root font size (70rem sheet = 210mm) never leak into other printouts.
const REPORT_PAGE_RULE = `
  @media print {
    @page {
      size: A4 portrait;
      margin: 0;
    }

    html {
      font-size: 3mm !important;
    }

    #root > header,
    #root > footer {
      display: none !important;
    }
  }
`;

const PDF_TITLE_RESTORE_FALLBACK_MS = 5000;
const PDF_BUTTON_LABEL = "PDF 파일로 다운 받기";
const PDF_BUTTON_BUSY_LABEL = "PDF 만드는 중…";

type ReportV3ViewProps = {
  /** payload.pages; this view reads the cover and pages 1 to 6 only */
  pages: Pick<
    DiagnosisV3Pages,
    "cover" | "p1" | "p2" | "p3" | "p4" | "p5" | "p6"
  >;
  /** pages 7 to 16, rendered after page 6 (built by the later-pages view) */
  laterPages?: ReactNode;
  /** stored diagnosis time (ISO); the PDF file name uses its date (a server-set YYYY-MM-DD) */
  diagnosedAt?: string | null;
  /** overrides the cover student name in the PDF file name (profile name) */
  studentName?: string | null;
};

/**
 * v3 report: cover, then one A4 sheet per page, then the print / PDF button.
 * fd-print-area and fd-report-sheet are the report-print.css and server PDF
 * (buildPrintDocument) contracts, so the root and every sheet keep those classes.
 */
export default function ReportV3View({
  pages,
  laterPages,
  diagnosedAt,
  studentName,
}: ReportV3ViewProps) {
  const mainRef = useRef<HTMLElement>(null);
  const [isPreparingServerPdf, setIsPreparingServerPdf] = useState(false);
  const pdfButtonTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (pdfButtonTimerRef.current !== null) {
        window.clearTimeout(pdfButtonTimerRef.current);
      }
    },
    [],
  );

  // 22 r7: the toc lists every shown page; pages 1 to 6 are always shown.
  const tocTitle = (page: number) => {
    const entry = pages.cover.toc.find((item) => item.page === page);
    if (!entry) throw new Error(`v3 report toc has no page ${page}`);
    // The toc entry only proves the page is shown; titles are PDF layout labels.
    return pageTitle(entry.page);
  };

  const handleServerPdfDownload = (fileName: string) => {
    const root = mainRef.current;
    if (!root) return;
    // A form post has no completion event, so a fixed timer re-enables the button.
    setIsPreparingServerPdf(true);
    pdfButtonTimerRef.current = window.setTimeout(
      () => setIsPreparingServerPdf(false),
      3000,
    );
    void (async () => {
      const accessToken = await getReportAccessToken();
      if (!accessToken) return;
      const html = buildPrintDocument({ root, title: fileName });
      downloadReportPdf({ html, filename: fileName, accessToken });
    })();
  };

  const handlePdfDownload = () => {
    const fileName = buildReportFileName({
      studentName: studentName ?? pages.cover.studentName ?? null,
      diagnosedAt: diagnosedAt ?? null,
    });

    if (shouldUseServerPdf(window.navigator.userAgent)) {
      handleServerPdfDownload(fileName);
      return;
    }

    // The print dialog proposes document.title as the file name; restore it on
    // afterprint, with a timer for browsers that never fire the event.
    const originalTitle = document.title;
    document.title = fileName;
    let restored = false;
    const restoreTitle = () => {
      if (restored) return;
      restored = true;
      document.title = originalTitle;
      window.removeEventListener("afterprint", restoreTitle);
      window.clearTimeout(fallbackTimer);
    };
    const fallbackTimer = window.setTimeout(
      restoreTitle,
      PDF_TITLE_RESTORE_FALLBACK_MS,
    );
    window.addEventListener("afterprint", restoreTitle);
    window.print();
  };

  return (
    <main
      ref={mainRef}
      className="fd-print-area min-h-screen w-full bg-[#FBFAFA] pt-16"
    >
      <style>{REPORT_PAGE_RULE}</style>
      <div className="fd-sheet-stack flex flex-col items-center gap-8 px-4 py-10 lg:px-0 lg:py-25">
        <CoverPage cover={pages.cover} />
        <Page01Summary page={pages.p1} tocTitle={tocTitle(1)} />
        <Page02Goal page={pages.p2} tocTitle={tocTitle(2)} />
        <Page03Grades page={pages.p3} tocTitle={tocTitle(3)} />
        <Page04Cycle page={pages.p4} tocTitle={tocTitle(4)} />
        <Page05Obstacles page={pages.p5} tocTitle={tocTitle(5)} />
        <Page06School page={pages.p6} tocTitle={tocTitle(6)} />
        {laterPages}
        <div className="fd-no-print">
          <button
            type="button"
            onClick={handlePdfDownload}
            disabled={isPreparingServerPdf}
            className="flex h-perf-inset w-63.25 items-center justify-center rounded-[1.875rem] bg-primary px-10 py-5 text-[1.25rem] font-semibold text-white transition-colors duration-150 hover:bg-[#01427e] focus:outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPreparingServerPdf ? PDF_BUTTON_BUSY_LABEL : PDF_BUTTON_LABEL}
          </button>
        </div>
      </div>
    </main>
  );
}
