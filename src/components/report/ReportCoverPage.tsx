// 리포트 공용 표지 — QA 2차 시트 행37·51("최종 리포트에 표지를 붙여 달라", 고객사
// "매우중요"). 학습진단(A4 시트)·목표관리 성장 리포트(react-to-print 문서 흐름)·
// 수행평가 리포트(react-to-print 모달, 인쇄 전용)가 이 컴포넌트 하나를 공유한다.
//
// 고객사 참고 샘플(경쟁사 리로스쿨)은 구성만 참조하고 그대로 베끼지 않는다(지시 원문
// "샘플은 참조만, 동일하게 만들면 안 된다") — 3D 오브젝트 일러스트 대신 브랜드 색
// 추상 기하 도형(원·회전 사각형·곡선)을 쓴다. 외부 이미지 파일을 추가하지 않고 인라인
// SVG로만 그린다(요구사항 — 새 에셋 없음).
//
// 값이 없는 항목은 렌더하지 않는다(폴백 상수 금지 — no-fallback-constants) — 학생 이름·
// 목표대학·목표학과·날짜는 전부 선택 prop이고, 없으면 그 줄 자체가 빠진다.
//
// variant="a4" — 학습진단 리포트 전용. `fd-report-sheet` 치수 클래스를 그대로 재사용해
// 시트 1·2와 같은 크기로 렌더하고, `report-print.css`의 `.fd-report-sheet + .fd-report-sheet`
// 인접 형제 규칙이 표지→1페이지 사이에도 그대로 걸려 인쇄 시 페이지가 나뉜다(별도 훅 불필요).
// 이 표지는 페이지 번호를 갖지 않는다 — "N페이지 / 총페이지" 표기에서 제외한다(호출부
// DiagnosisReportView.tsx 주석 참고).
//
// variant="flow"(기본) — 목표관리 성장 리포트·수행평가 리포트 전용. A4 고정 치수 계약이
// 없는 두 화면(react-to-print 문서 흐름 인쇄)에 맞춰 화면에서는 카드형 높이로, 인쇄에서만
// 한 페이지를 채우고 `break-after: page`로 다음 내용과 분리한다.

import { site } from "@/config/site";
import { cn } from "@/lib/utils";

export type ReportCoverPageVariant = "a4" | "flow";

export type ReportCoverPageProps = {
  /** 표지 상단 라벨(예: "학습진단", "월간 성장 리포트"). */
  serviceLabel: string;
  /** 큰 제목. 2~3줄 분량을 가정하고 폭을 제한한다. */
  title: string;
  studentName?: string | null;
  targetMajor?: string | null;
  targetUniversity?: string | null;
  dateLabel?: string | null;
  variant?: ReportCoverPageVariant;
  className?: string;
};

// A4 시트 치수 — ReportSheetA4.tsx의 `.fd-report-sheet` 클래스와 완전히 동일한 값을
// 재사용한다(표지도 시트 1·2와 같은 크기여야 한다는 요구사항). `relative flex flex-col`을
// 더해 자식 요소(라벨→제목→목표줄→일러스트 영역→푸터)를 세로로 쌓고 푸터를 `mt-auto`로
// 바닥에 고정한다 — `min-height`만으로는 퍼센트 높이 자식이 안 늘어나지만, flex 정렬
// 속성(`margin-top:auto`)은 컨테이너의 `min-height`를 그대로 반영해 동작한다.
const A4_SHEET_CLASS =
  "fd-report-sheet relative flex w-full min-w-0 shrink-0 flex-col overflow-hidden break-keep rounded-2xl bg-white p-6 shadow-[0_0_1.25rem_rgba(0,0,0,0.06)] lg:w-280 lg:min-h-[99.0588rem] lg:rounded-none lg:p-perf-inset";

// flow 변형 — 화면에서는 카드 하나 분량(모달·목표관리 화면 스케일과 어울리는 rem 값),
// 인쇄에서는 아래 FLOW_COVER_PRINT_RULE이 한 페이지(A4 - @page 15mm×2 여백)를 채운다.
const FLOW_SHEET_CLASS =
  "fd-report-cover-flow relative flex w-full flex-col overflow-hidden rounded-2xl bg-white p-10 shadow-[0_0_1.25rem_rgba(0,0,0,0.06)] lg:min-h-[30rem] lg:p-16";

// react-to-print(iframe 격리) 두 화면(목표관리 성장 리포트·수행평가 리포트 모달)이 공유하는
// 베이스(`REPORT_PRINT_PAGE_BASE_STYLE`, `@page 15mm`)를 전제로 한 페이지 안쪽 여유
// (297mm - 15mm*2 = 267mm)를 채운다. `break-after: page`로 다음 내용(본문 첫 섹션)을
// 항상 새 페이지에서 시작시킨다 — 화면 클래스(`lg:min-h-[30rem]`)에는 영향을 주지 않도록
// `@media print` 안에서만 선언한다(PerformanceReportSurface.tsx의 인쇄 전용 `<style>` 관례).
const FLOW_COVER_PRINT_RULE = `
  @media print {
    .fd-report-cover-flow {
      min-height: 267mm;
      break-after: page;
      page-break-after: always;
    }
  }
`;

export default function ReportCoverPage({
  serviceLabel,
  title,
  studentName,
  targetMajor,
  targetUniversity,
  dateLabel,
  variant = "flow",
  className,
}: ReportCoverPageProps) {
  const targetLine = [targetUniversity, targetMajor]
    .filter((value): value is string => Boolean(value))
    .join(" ");
  const isA4 = variant === "a4";

  return (
    <section
      aria-label={`${serviceLabel} 리포트 표지`}
      className={cn(isA4 ? A4_SHEET_CLASS : FLOW_SHEET_CLASS, className)}
    >
      {!isA4 && <style>{FLOW_COVER_PRINT_RULE}</style>}

      <p className="text-base font-semibold text-accent">{serviceLabel}</p>

      <h1 className="mt-4 max-w-125 break-keep text-[1.75rem] font-bold leading-[1.35] text-primary lg:mt-6 lg:max-w-150 lg:text-[2.25rem]">
        {title}
      </h1>

      {targetLine && (
        <p className="mt-4 break-keep text-base font-medium leading-[1.4] text-ink-sub lg:mt-5">
          목표 {targetLine}
        </p>
      )}

      {/* 일러스트 영역 — flex-1로 남는 세로 공간을 전부 차지하고, 도형은 그 영역의
          우하단에 배치한다(고객사 참고 샘플의 "우하단 3D 오브젝트" 구성만 참조, 실제
          도형은 3D 오브젝트가 아닌 추상 기하 구성). */}
      <div className="relative mt-8 min-h-30 flex-1 lg:mt-12 lg:min-h-50">
        <CoverIllustration />
      </div>

      <footer className="fd-report-cover-footer mt-auto flex items-end justify-between gap-4 pt-8">
        <img
          src={site.logo.horizontal}
          alt={site.brandName}
          className="h-5.5 w-auto object-contain lg:h-6.5"
        />
        {(studentName || dateLabel) && (
          <div className="flex flex-col items-end gap-1 text-right text-sm text-ink-sub">
            {studentName && <p className="font-medium">{studentName} 학생</p>}
            {dateLabel && <p>{dateLabel}</p>}
          </div>
        )}
      </footer>
    </section>
  );
}

// 추상 기하 일러스트 — 브랜드 primary(#013262) 계열 + accent(#0b84fd) 반투명 도형
// 조합(원·회전 사각형·곡선). 컨테이너에 맞춰 늘어나도록 `preserveAspectRatio="xMaxYMax slice"`
// 로 우하단 기준 정렬한다. viewBox 내부 좌표는 report-print.css 상단 주석이 명시한 예외
// (SVG viewBox는 컨테이너 종속 좌표라 rem 제약 대상이 아니다)에 해당한다.
function CoverIllustration() {
  return (
    <svg
      role="presentation"
      aria-hidden="true"
      viewBox="0 0 400 260"
      preserveAspectRatio="xMaxYMax slice"
      className="absolute inset-0 h-full w-full print:[print-color-adjust:exact]"
    >
      <circle cx="330" cy="190" r="120" fill="#013262" opacity="0.08" />
      <circle cx="250" cy="230" r="60" fill="#0b84fd" opacity="0.12" />
      <rect
        x="290"
        y="90"
        width="90"
        height="90"
        rx="16"
        fill="#013262"
        opacity="0.1"
        transform="rotate(18 335 135)"
      />
      <path
        d="M180 260 C 230 200, 300 210, 400 150"
        stroke="#0b84fd"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        opacity="0.35"
      />
    </svg>
  );
}
