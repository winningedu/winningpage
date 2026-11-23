import type { ReactNode } from "react";
import "@/styles/report-print.css";
import type { DiagnosisV3Pages } from "@/lib/diagnosis-v3/types";
import CoverPage from "./CoverPage";
import Page01Summary from "./Page01Summary";
import Page02Goal from "./Page02Goal";
import Page03Grades from "./Page03Grades";
import Page04Cycle from "./Page04Cycle";
import Page05Obstacles from "./Page05Obstacles";
import Page06School from "./Page06School";

type ReportV3ViewProps = {
  /** payload.pages; this view reads the cover and pages 1 to 6 only */
  pages: Pick<
    DiagnosisV3Pages,
    "cover" | "p1" | "p2" | "p3" | "p4" | "p5" | "p6"
  >;
  /** pages 7 to 16, rendered after page 6 (built by the later-pages view) */
  laterPages?: ReactNode;
};

/**
 * v3 report: cover, then one A4 sheet per page. fd-print-area and
 * fd-report-sheet are the report-print.css and server PDF (buildPrintDocument)
 * contracts, so the root and every sheet keep those classes.
 */
export default function ReportV3View({ pages, laterPages }: ReportV3ViewProps) {
  // 22 r7: the toc lists every shown page; pages 1 to 6 are always shown.
  const tocTitle = (page: number) => {
    const entry = pages.cover.toc.find((item) => item.page === page);
    if (!entry) throw new Error(`v3 report toc has no page ${page}`);
    return entry.title;
  };

  return (
    <div className="fd-print-area fd-sheet-stack flex flex-col items-center gap-8">
      <CoverPage cover={pages.cover} />
      <Page01Summary page={pages.p1} tocTitle={tocTitle(1)} />
      <Page02Goal page={pages.p2} tocTitle={tocTitle(2)} />
      <Page03Grades page={pages.p3} tocTitle={tocTitle(3)} />
      <Page04Cycle page={pages.p4} tocTitle={tocTitle(4)} />
      <Page05Obstacles page={pages.p5} tocTitle={tocTitle(5)} />
      <Page06School page={pages.p6} tocTitle={tocTitle(6)} />
      {laterPages}
    </div>
  );
}
