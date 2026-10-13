// 리포트 화면의 "PDF 저장" 공통 동작. 데스크톱은 react-to-print(iframe 인쇄),
// 모바일과 인앱 브라우저는 api/report-pdf.ts 서버 렌더 경로로 보낸다.
// 인쇄 대상은 반환하는 contentRef 를 단 요소 하나다. 버튼과 툴바는 그 밖에 둔다.
import { useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { buildPrintDocument } from "./buildPrintDocument";
import { downloadReportPdf, getReportAccessToken } from "./downloadReportPdf";
import { REPORT_PRINT_PAGE_BASE_STYLE } from "./printPageStyle";
import { shouldUseServerPdf } from "./shouldUseServerPdf";

export function useReportPdfSave(fileName: string) {
  const contentRef = useRef<HTMLDivElement>(null);
  const print = useReactToPrint({
    contentRef,
    pageStyle: REPORT_PRINT_PAGE_BASE_STYLE,
    documentTitle: fileName,
  });
  const [isPreparing, setIsPreparing] = useState(false);

  const save = () => {
    if (!shouldUseServerPdf(window.navigator.userAgent)) {
      print();
      return;
    }
    const root = contentRef.current;
    if (!root) return;
    // 폼 제출(최상위 내비게이션)은 완료 이벤트가 없어 고정 타이머로 버튼을 복구한다.
    setIsPreparing(true);
    window.setTimeout(() => setIsPreparing(false), 3000);
    void (async () => {
      const accessToken = await getReportAccessToken();
      if (!accessToken) return;
      const html = buildPrintDocument({
        root,
        title: fileName,
        extraCss: REPORT_PRINT_PAGE_BASE_STYLE,
      });
      downloadReportPdf({ html, filename: fileName, accessToken });
    })();
  };

  return { contentRef, save, isPreparing };
}
