// A4 리포트 시트 공용 셸 — 페이지 표기 라벨 + 시트 내부 컨텐츠 래퍼.
// fd-report-sheet 클래스는 report-print.css 인쇄 계약이므로 반드시 유지한다.
// R3(2026-08-11) — lg(1024px) 미만은 A4 고정 폭·높이(70rem/99.0588rem)를 걷어내고 뷰포트
// 폭에 맞춘 단일 컬럼 카드로 리플로우한다. min-height 도 함께 제거해 실제 컨텐츠 높이만큼만
// 차지하게 한다(강제로 A4 비율을 유지할 이유가 화면에는 없다 — 그 비율은 인쇄 전용 요구다).
// totalPages 기본값 2를 걷어냈다(2026-08-21, 사용자 지시) — 문서 총 페이지 수는 부록 렌더
// 여부(4 vs 2)에 따라 달라지는 값이라 이 컴포넌트가 임의로 추정하면 안 된다. 호출부
// (FreeDiagnosisReport)가 hasReportExtras() 로 한 번 계산해 모든 시트·부록 페이지에
// 동일한 값을 내려보낸다 — 페이지 라벨이 시트마다 다른 총page수를 말하는 사고를 막는다.
//
// 라벨→첫 콘텐츠 간격 소유권 이관(2026-08-21, 사용자 지시 — 스크린샷 3장 근거) — 종전엔
// 페이지마다 첫 요소가 제각각 자기 mt를 갖고 있어(헤드라인 mt-6 lg:mt-11.5 · 준비도/입결
// mt-12 · 부록 대제목 마진 없음) 라벨 밑 간격이 29~48px, 부록은 0px으로 들쭉날쭉했다.
// 시안(A4-3: 라벨 y59+h22=81 → 헤드라인 y127, 갭 46px)을 canonical 값으로 확정해 이
// 컴포넌트가 소유한다 — 자식 전체를 mt-[2.875rem](46px) 래퍼로 감싸고, `[&>*:first-child]`
// 로 실제 렌더된 첫 자식(조건부 렌더라 페이지마다 다를 수 있다 — 부록 4페이지는 restGroups
// 유무에 따라 details·해석 한계·reportBasis 중 하나가 첫 자식이 된다)의 자체 마진을
// 0으로 덮어써 이중 마진을 막는다. 헤드라인(ReportPageOne)·준비도/입결 비교
// (ReadinessOverview·AdmissionSection, page2 첫 줄)는 손자 요소라 이 선택자가 안 닿아
// 각 컴포넌트에서 직접 자체 마진을 걷어냈다(완료 보고 참고).
import type { ReactNode } from "react";
import { site } from "@/config/site";
import { SAMPLE_REPORT_COPY } from "@/data/diagnosisScreenCopy";

type ReportSheetA4Props = {
  page: number;
  totalPages: number;
  children?: ReactNode;
};

export default function ReportSheetA4({
  page,
  totalPages,
  children,
}: ReportSheetA4Props) {
  const pageLabel = `${site.brandName} 학습진단 리포트 ${page}페이지 / ${totalPages}페이지`;

  return (
    <section
      // break-keep — 리포트 전 문구(diagnosisCopy 산하 전부)를 어절 단위로만 줄바꿈한다
      // (사용자 확정 2026-08-21). 시트 루트에서 상속시켜 개별 문단마다 붙이지 않는다.
      className="fd-report-sheet w-full min-w-0 shrink-0 break-keep rounded-2xl bg-white p-6 shadow-[0_0_1.25rem_rgba(0,0,0,0.06)] lg:w-280 lg:min-h-[99.0588rem] lg:rounded-none lg:p-perf-inset"
      aria-label={pageLabel}
      // G-3(NIT 5) — 워터마크 문구의 정의처는 SAMPLE_REPORT_COPY.WATERMARK 하나다. 이 속성은
      // report-print.css 의 `.fd-report-sample .fd-report-sheet::after { content: attr(data-watermark) }`
      // 가 읽는다 — .fd-report-sample 조상 클래스가 없으면(실제 응답 리포트) 그 선택자 자체가
      // 매치하지 않아 속성이 있어도 아무것도 그려지지 않는다.
      data-watermark={SAMPLE_REPORT_COPY.WATERMARK}
    >
      {/* fd-page-label — 인쇄에서 report-print.css 가 이 훅으로 lg: 값(1rem/#808080)을
          강제 복원한다(인쇄는 항상 데스크톱 레이아웃). */}
      <p className="fd-page-label text-sm font-normal leading-[1.3] text-ink lg:text-base lg:text-[#808080]">
        {pageLabel}
      </p>
      <div className="mt-[2.875rem] [&>*:first-child]:mt-0">{children}</div>
    </section>
  );
}
