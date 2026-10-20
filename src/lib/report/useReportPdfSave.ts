// 리포트 화면의 "PDF 저장" 공통 동작. 데스크톱은 react-to-print(iframe 인쇄),
// 모바일과 인앱 브라우저는 api/report-pdf.ts 서버 렌더 경로로 보낸다.
// 인쇄 대상은 반환하는 contentRef 를 단 요소 하나다. 버튼과 툴바는 그 밖에 둔다.
import { useEffect, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { useToast } from "@/context/ToastContext";
import { buildPrintDocument } from "./buildPrintDocument";
import { downloadReportPdf, getReportAccessToken } from "./downloadReportPdf";
import { inlineDocumentCss } from "./inlineDocumentCss";
import { REPORT_PRINT_PAGE_BASE_STYLE } from "./printPageStyle";
import { shouldUseServerPdf } from "./shouldUseServerPdf";

const INJECTED_CSS_SELECTOR = "style[data-report-print-css]";

export function useReportPdfSave(fileName: string) {
  const contentRef = useRef<HTMLDivElement>(null);
  // react-to-print 는 <link> URL 을 iframe 에 다시 받게 하는데, 배포로 해시가 바뀌면
  // 404 라 스타일 없이 인쇄된다. 전역 스타일 복사를 끄고, 클릭 시점에 읽은 로드된 CSS 를
  // 콘텐츠 안 <style> 로 심어 복제본에 실려 가게 한다(save 참고).
  const removeInjectedCss = () => {
    contentRef.current?.querySelector(INJECTED_CSS_SELECTOR)?.remove();
  };
  const print = useReactToPrint({
    contentRef,
    ignoreGlobalStyles: true,
    pageStyle: REPORT_PRINT_PAGE_BASE_STYLE,
    documentTitle: fileName,
    onAfterPrint: removeInjectedCss,
    onPrintError: removeInjectedCss,
  });
  const [isPreparing, setIsPreparing] = useState(false);
  const toast = useToast();
  const resetTimer = useRef<number | null>(null);

  const clearResetTimer = () => {
    if (resetTimer.current === null) return;
    window.clearTimeout(resetTimer.current);
    resetTimer.current = null;
  };
  // 언마운트 뒤에 타이머가 상태를 건드리지 않도록 정리한다.
  useEffect(
    () => () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  const save = () => {
    const root = contentRef.current;
    if (!shouldUseServerPdf(window.navigator.userAgent)) {
      if (!root) return;
      // print() 는 동기로 콘텐츠를 복제하므로 그 전에 심은 <style> 이 복제본에 들어간다.
      // 콘텐츠 안 <style> 은 iframe head 의 pageStyle 보다 뒤라서, 베이스 인쇄 스타일을
      // 맨 끝에 다시 붙여 앱 CSS 의 @page 등에 덮이지 않게 한다.
      removeInjectedCss();
      const style = document.createElement("style");
      style.setAttribute("data-report-print-css", "");
      style.textContent = `${inlineDocumentCss(document)}\n${REPORT_PRINT_PAGE_BASE_STYLE}`;
      root.prepend(style);
      print();
      return;
    }
    if (!root) return;
    // 폼 제출(최상위 내비게이션)은 완료 이벤트가 없어 고정 타이머로 버튼을 복구한다.
    setIsPreparing(true);
    clearResetTimer();
    resetTimer.current = window.setTimeout(() => {
      resetTimer.current = null;
      setIsPreparing(false);
    }, 3000);
    void (async () => {
      try {
        const accessToken = await getReportAccessToken();
        if (!accessToken) return;
        const html = buildPrintDocument({
          root,
          title: fileName,
          extraCss: REPORT_PRINT_PAGE_BASE_STYLE,
        });
        downloadReportPdf({ html, filename: fileName, accessToken });
      } catch (error) {
        console.error("[report] PDF 저장 실패:", error);
        clearResetTimer();
        setIsPreparing(false);
        toast.error("PDF를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.");
      }
    })();
  };

  return { contentRef, save, isPreparing };
}
