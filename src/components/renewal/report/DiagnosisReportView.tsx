import type { ComponentProps } from "react";
import { useRef, useState } from "react";
import "@/styles/report-print.css";
import "@/styles/report-responsive.css";
import ReportCoverPage from "@/components/report/ReportCoverPage";
import { site } from "@/config/site";
import { buildPrintDocument } from "@/lib/report/buildPrintDocument";
import {
  downloadReportPdf,
  getReportAccessToken,
} from "@/lib/report/downloadReportPdf";
import { shouldUseServerPdf } from "@/lib/report/shouldUseServerPdf";
import { buildReportFileName } from "@/pages/renewal/reportFileName";
import ReportPageOne from "./ReportPageOne";
import ReportPageTwo from "./ReportPageTwo";
import ReportScreenExtras, { hasReportExtras } from "./ReportScreenExtras";
import ReportSincerityBanner from "./ReportSincerityBanner";

// QA 행345 — afterprint가 오지 않는 예외 상황(다이얼로그 취소 실패·브라우저 미지원 등)에 대비한
// document.title 원복 폴백 지연. 인쇄 다이얼로그가 파일명을 읽어들이는 데 걸리는 시간보다
// 충분히 길게 잡되, 실제 문제(afterprint 미수신)가 있을 때 탭 제목이 바뀐 채로 남는 기간은
// 짧게 유지한다.
const PDF_TITLE_RESTORE_FALLBACK_MS = 5000;

// 2026-09-23 QA 행72: 전역 @page 누수 — `@page`는 클래스로 스코프가 안 되고
// report-print.css는 Vite 전역 번들에 실려 모든 인쇄(성장 리포트·수행평가 리포트 포함)에
// margin:0이 새는 원인이었다. 이 컴포넌트가 마운트된 동안에만 문서에 존재하는 <style>로
// 옮겨, 언마운트 시 React가 자동으로 걷어가게 한다(size/margin 0은 A4 풀블리드 설계라
// 이 리포트에만 필요하다).
//
// html font-size:3mm(rem 균등 축소 트릭 — 70rem 시트 → 210mm A4 폭)도 같은 이유로
// 이 <style>에 함께 둔다. 이 값 역시 body 전체에 걸리는 태그 셀렉터라 report-print.css의
// 전역 번들에 있으면, 같은 SPA 세션에서 학습진단 리포트를 한 번 연 뒤 성장·수행평가
// 리포트를 인쇄할 때 rem이 71%로 축소되는 사고가 난다.
//
// SiteLayout의 헤더·푸터(항상 #root의 직계 자식 — SiteLayout·RootLayout이 둘 다 Fragment라
// DOM에 별도 래퍼를 두지 않는다)를 인쇄에서 숨기는 규칙도 여기로 옮긴다. 기존
// report-print.css의 `header, footer` 태그 셀렉터는 SiteLayout 밖 화면(목표관리
// GoalPageHeader 등 중첩된 시맨틱 <header>)까지 전부 잡는 과대 셀렉터였다 — `#root >`로
// 좁혀 SiteLayout이 실제로 렌더하는 두 요소만 겨냥한다.
const DIAGNOSIS_REPORT_PAGE_RULE = `
  @media print {
    @page {
      size: A4 portrait;
      margin: 0;
    }

    html {
      font-size: 3mm !important; /* 70rem 시트 → 210mm(A4 폭) */
    }

    #root > header,
    #root > footer {
      display: none !important; /* SiteLayout 의 Header(fixed)·SiteFooter */
    }
  }
`;

export type DiagnosisReportData = ComponentProps<typeof ReportPageTwo>["data"] &
  ComponentProps<typeof ReportPageOne>["data"] & {
    notices?: { sincerityBanner?: string | null };
  };

type DiagnosisReportViewProps = {
  data: DiagnosisReportData;
  /**
   * PDF 파일명(reportFileName.ts)에 쓸 학생 이름. 생략하면 data.student?.name을
   * 그대로 쓴다 — 부모 열람 경로(ChildDiagnosisReport)는 별도 프로필 조회 없이
   * 이미 로드된 payload 값을 신뢰한다("학생 이름은 payload의 student 정보" 결정).
   * 자기 열람 경로(FreeDiagnosisReport)는 profiles.name 조회 결과를 명시적으로
   * 넘긴다 — 설문에 이름 수집 문항이 없어 data.student.name이 상시 null이라서다
   * (StudentInfoBlock.tsx 주석과 동일 사유).
   */
  studentName?: string | null;
};

/**
 * 학습진단 리포트 본문 — A4 시트 2장(ReportPageOne·Two) + 화면 전용 부록
 * (ReportScreenExtras) + 인쇄/PDF 버튼 + 모바일 안내 카드.
 *
 * FreeDiagnosisReport(자기 열람, 세션 경로·`:attemptId` 경로 공용)와
 * ChildDiagnosisReport(학부모 열람)가 이 컴포넌트를 공유한다 — 데이터 소스(세션
 * sessionStorage 조립 vs DB 조회)만 다르고 렌더는 완전히 같다.
 *
 * - A4 시트 2장(1120×1584.94 = 70rem×99.0588rem)에 부록(3·4페이지)이 있으면 이어
 *   붙어 총 4장이 된다 — 화면에서는 전부 세로로 쌓아 보여주고, "PDF 파일로 다운
 *   받기" 클릭 시 window.print() 로 브라우저 인쇄 다이얼로그를 띄운다(결정9 —
 *   전용 PDF 파일 생성은 2차). 총 페이지 수(totalPages)는 hasReportExtras()로 한
 *   번만 계산해 모든 페이지 라벨("N페이지 / 총페이지")에 같은 값을 내려보낸다.
 * - fd-print-area / fd-report-sheet / fd-no-print 클래스는 report-print.css 의
 *   계약이므로 섹션 컴포넌트가 들어와도 그대로 유지해야 한다.
 * - A4 출력물 컨셉(2026-08-20 확정) — 리포트는 A4 인쇄용 문서고 화면은 그
 *   프리뷰다. lg(1024px) 미만에서는 A4 시트를 화면에 렌더하지 않고 다운로드
 *   안내 카드만 보여준다(fd-mobile-notice). 인쇄는 뷰포트와 무관하게 항상 A4
 *   데스크톱 레이아웃이 나가야 하므로 fd-desktop-report 훅으로
 *   report-print.css 가 인쇄 시 강제 표시하고, fd-mobile-notice는 인쇄에서
 *   강제 숨김한다.
 */
export default function DiagnosisReportView({
  data,
  studentName,
}: DiagnosisReportViewProps) {
  const resolvedStudentName = studentName ?? data.student?.name ?? null;

  const totalPages = hasReportExtras(data) ? 4 : 2;

  // QA 행 103 → 2026-08-22 형식 교체, QA 행345 → afterprint 대기로 재수정 — 브라우저 인쇄
  // 다이얼로그가 제안하는 기본 파일명은 document.title을 따른다(PDF 저장 시 이 값이 그대로
  // 파일명이 된다). SPA라 페이지 자체를 이동하지 않으므로, 인쇄 직전에만 문서 제목을 바꾸고
  // 다이얼로그가 닫힌 뒤 원복한다.
  //
  // window.print() 직후 동기적으로 원복하면 안 된다 — Chrome처럼 print()가 호출 스레드를
  // 막는 브라우저에서는 문제없지만, Safari 등 논블로킹 브라우저는 print()가 즉시 반환되고
  // 다이얼로그가 비동기로 뜬다. 그 경우 원복이 다이얼로그가 파일명을 읽기도 전에 끝나
  // "위닝에듀"로 저장되는 문제가 있었다. 다이얼로그가 실제로 닫힐 때 발생하는 afterprint
  // 이벤트로 원복 시점을 옮기고, 이벤트가 오지 않는 예외 상황을 대비해 폴백 타이머를 둔다
  // (둘 중 먼저 온 쪽이 원복하고 나머지는 restored 플래그로 무시한다).
  // 서버 PDF 경로(QA 2차 시트 행39·56) — 카카오톡 인앱 등에서는 window.print()가
  // 무동작이라, api/report-pdf.ts가 Content-Disposition: attachment로 응답하는
  // 경로로 대신 보낸다. mainRef는 인쇄 대상(fd-print-area) 전체를 그대로 캡처한다.
  const mainRef = useRef<HTMLElement>(null);
  const [isPreparingServerPdf, setIsPreparingServerPdf] = useState(false);

  const handleServerPdfDownload = (fileName: string) => {
    if (!mainRef.current) return;
    // 폼 제출(최상위 내비게이션)은 완료 이벤트가 없어 고정 타이머로 버튼을 복구한다.
    setIsPreparingServerPdf(true);
    window.setTimeout(() => setIsPreparingServerPdf(false), 3000);

    const root = mainRef.current;
    void (async () => {
      const accessToken = await getReportAccessToken();
      if (!accessToken) return;
      const html = buildPrintDocument({ root, title: fileName });
      downloadReportPdf({ html, filename: fileName, accessToken });
    })();
  };

  const handlePdfDownload = () => {
    const fileName = buildReportFileName({
      studentName: resolvedStudentName,
      diagnosedAt: data.student?.diagnosedAt ?? null,
    });

    if (shouldUseServerPdf(window.navigator.userAgent)) {
      handleServerPdfDownload(fileName);
      return;
    }

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
      <style>{DIAGNOSIS_REPORT_PAGE_RULE}</style>
      {/* 데스크톱 A4 리포트 — A4 출력물 컨셉(2026-08-20)이므로 lg(1024px) 미만에서는 렌더하지
          않는다. fd-desktop-report 훅으로 report-print.css 가 인쇄 시(뷰포트 무관) 항상
          강제 표시한다. */}
      <div className="fd-sheet-stack fd-desktop-report hidden flex-col items-center gap-10 px-4 pt-10 pb-10 lg:flex lg:gap-25 lg:px-0 lg:pt-25 lg:pb-25">
        {/* 불성실 응답 경고는 시트 **위**에 둔다 — '결과가 다를 수 있다'는 안내가 리포트 2장을
            다 읽은 뒤에 나오면 기능을 못 한다. 시트 밖인 이유는 승인된 A4 레이아웃의 첫 요소를
            밀어내지 않기 위해서다. */}
        {/* 표지(QA 2차 시트 행37·51) — 화면·인쇄 모두 첫 시트다. 페이지 번호를 갖지
            않는다 — ReportSheetA4를 쓰지 않아 "N페이지 / 총페이지" 표기 자체가 없고,
            시트1·2의 표기(1페이지/2페이지 등)도 이 표지를 세지 않은 종전 값 그대로
            유지한다(팀장 지시 "기존 표기 규칙을 읽고 결정" — 표지 유무와 무관하게
            안정적인 번호를 유지하는 쪽을 택했다). variant="a4"라 `.fd-report-sheet`
            치수를 그대로 쓰고, `.fd-report-sheet + .fd-report-sheet` 인접 형제 규칙이
            표지→1페이지 사이 인쇄 개행도 자동으로 처리한다(report-print.css). 목표
            대학은 이 리포트 데이터에 없어(학습진단은 희망 진로/학과만 수집) 전달하지
            않는다. */}
        <ReportCoverPage
          variant="a4"
          serviceLabel="학습진단"
          title={`${site.brandName} 학습진단 리포트`}
          {...(resolvedStudentName !== null
            ? { studentName: resolvedStudentName }
            : {})}
          {...(data.student?.desiredMajorRaw
            ? { targetMajor: data.student.desiredMajorRaw }
            : {})}
          {...(data.student?.diagnosedAtRaw
            ? { dateLabel: data.student.diagnosedAtRaw }
            : {})}
        />

        {/* exactOptionalPropertyTypes 대응 — undefined면 키 자체를 생략(ReportSincerityBanner 미수정 범위). */}
        <ReportSincerityBanner
          {...(data.notices?.sincerityBanner !== undefined
            ? { message: data.notices.sincerityBanner }
            : {})}
        />

        <ReportPageOne data={data} totalPages={totalPages} />
        <ReportPageTwo data={data} totalPages={totalPages} />

        {/* 화면 전용 확장 영역(F-04 · F-05) — AREA_COPY 108문구·고지·긴급도가 사는 자리.
            PDF 버튼 **앞**이어야 한다: 버튼이 시트 직후에 있으면 '리포트는 여기서 끝'이라는
            종결 신호가 되어 이 섹션의 발견율이 급감한다. 3·4페이지(부록)까지 렌더할지는
            컴포넌트 내부에서 hasReportExtras()와 동일한 조건으로 다시 판정한다 —
            totalPages=2 인데 부록이 렌더되는 모순은 그래서 구조적으로 발생하지 않는다. */}
        <ReportScreenExtras data={data} totalPages={totalPages} />

        {/* PdfDownloadButton.jsx 미배정 — 결정9 스펙(253×60, r30, bg #013262)을 인라인 구현. */}
        <div className="fd-no-print">
          <button
            type="button"
            onClick={handlePdfDownload}
            disabled={isPreparingServerPdf}
            className="flex h-perf-inset w-63.25 items-center justify-center rounded-[1.875rem] bg-primary px-10 py-5 text-[1.25rem] font-semibold text-white transition-colors duration-150 hover:bg-[#01427e] focus:outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPreparingServerPdf ? "PDF 만드는 중…" : "PDF 파일로 다운 받기"}
          </button>
        </div>
      </div>

      {/* 모바일 안내 카드 — A4 시트 대신 다운로드 경로만 제공한다. fd-mobile-notice 훅으로
          report-print.css 가 인쇄에서 항상 숨긴다(모바일에서 인쇄해도 A4가 나가야 한다). */}
      <div className="fd-mobile-notice flex flex-col items-center gap-6 px-6 py-20 text-center lg:hidden">
        <p className="max-w-70 text-base leading-[1.6] text-ink-sub">
          학습진단 리포트는 A4 인쇄용 문서로 제공됩니다. PDF 파일로 다운로드해
          확인해 주세요.
        </p>
        <button
          type="button"
          onClick={handlePdfDownload}
          disabled={isPreparingServerPdf}
          className="flex h-perf-inset w-63.25 items-center justify-center rounded-[1.875rem] bg-primary px-10 py-5 text-[1.25rem] font-semibold text-white transition-colors duration-150 hover:bg-[#01427e] focus:outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPreparingServerPdf ? "PDF 만드는 중…" : "PDF 파일로 다운 받기"}
        </button>
      </div>
    </main>
  );
}
