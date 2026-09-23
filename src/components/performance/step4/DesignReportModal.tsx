import PerformanceReportSurface from "@/components/performance/report/PerformanceReportSurface";
import ReportModalShell, {
  REPORT_MODAL_FOOTER_BUTTON,
} from "@/components/performance/report/ReportModalShell";
import { buildPerformanceReportFileName } from "@/components/performance/report/reportFileName";
import SectionedReportView, {
  getVisibleSections,
} from "@/components/performance/report/SectionedReportView";

// STEP4 설계 리포트 전체보기 모달 — docs/수행평가-상세-명세.md §5.13(`3754:4722` 실측) /
// §10.2 P10 「대형 모달, PDF/인쇄(`@media print`)」.
//
// **껍데기는 `ReportModalShell`이 갖는다**(포털·딤·치수·헤더·스크롤 영역·푸터·인쇄 크롬).
// P11에서 §5.16 평가 리포트 모달이 §7.3 표 L1456에 **같은 행으로 묶인 같은 치수**로
// 들어오면서, 이 파일에 있던 껍데기를 그대로 들어올려 공유했다 — 동작·마크업은 바뀌지
// 않았다. 이 파일에 남은 것은 §5.13 고유분 3개뿐이다: 헤더 문구, 본문(섹션 렌더),
// 푸터 버튼 2개.
//
// ── 본문 구조가 §5.11과 다르다
// §5.11은 「라벨 + 평문 단락」 2요소지만 §5.13은 **키-값 + 중첩 목록**이다(§5.13 「본문 내부
// 하위 구조」). 그래서 섹션 껍데기는 같은 `SectionedReportView`를 쓰되 본문은 `blocks`
// 변형으로 넘어가고, 그 안쪽 마크업은 `renderBlock` + 블록 뷰가, 룩은
// `PerformanceReportSurface`가 갖는다(역할 경계는 `SectionedReportView` 상단 주석).
//
// ── 닫기 수단
// §5.11과 마찬가지로 시안에 X 버튼이 없고 닫기 수단은 `창 닫고 작성하기` 하나다. ESC·딤
// 클릭·그 버튼을 전부 같은 `onClose`로 수렴시킨다.

/** §5.13 헤더 — 시안에 문구 원문이 없다(제목/부제 텍스트가 실측 표에 빠져 있음). 제안. */
const MODAL_TITLE = "통합 설계 리포트";
/** 인쇄 버튼 라벨. §5.13 primary 원문 그대로(가운데 공백 포함). */
const PRINT_LABEL = "PDF로 저장 / 인쇄";
const CLOSE_LABEL = "창 닫고 작성하기";
/** PDF 파일명의 "리포트이름" 조각(QA 행354, `reportFileName.ts`). 모달 제목(`MODAL_TITLE`)과
 * 별개다 — 파일명 관례는 고객 요청 원문 "구성설계리포트"를 그대로 쓴다. */
const REPORT_FILE_NAME_LABEL = "구성설계리포트";

type DesignReportSection = {
  id?: string;
  label: string;
  blocks?: Record<string, unknown>[];
  text?: string;
};

export type DesignReport = {
  sections: DesignReportSection[];
};

type DesignReportModalProps = {
  open: boolean;
  /** `design-report` 응답. 섹션 순서는 서버가 `DESIGN_REPORT_SECTIONS`로 이미 정렬해 내려준다. */
  report?: DesignReport | null;
  /** 확정한 주제 제목. 헤더 부제 + PDF 파일명 첫 조각으로 쓴다. */
  topicTitle?: string | undefined;
  /** 로그인 학생 이름. PDF 파일명 둘째 조각(QA 행354). 없으면 그 조각만 빠진다. */
  studentName?: string | null;
  /** ESC·딤 클릭·`창 닫고 작성하기` 공통 핸들러. */
  onClose: () => void;
};

export default function DesignReportModal({
  open,
  report,
  topicTitle,
  studentName,
  onClose,
}: DesignReportModalProps) {
  // `open`과 `report`를 한 표현식에서 파생시킨다 — 훅 입력과 렌더 조건이 갈리면
  // `open=true, report=null` 조합에서 body 스크롤이 잠기고 ESC 리스너가 붙는데 아무것도
  // 렌더되지 않는 무음 실패에 빠진다(`ReportModalShell` 호출부 계약).
  const isOpen = open && Boolean(report);
  const visibleSections = report ? getVisibleSections(report.sections) : [];
  const hasContent = visibleSections.length > 0;

  return (
    <ReportModalShell
      open={isOpen}
      title={MODAL_TITLE}
      // 부제는 확정한 주제 제목이다. §5.13 헤더는 39.125rem×3.1875rem VERTICAL gap 0.25rem
      // 2줄 구조인데 **문구 원문이 실측 표에 없다** — 리포트 전체가 어느 주제의 것인지가
      // 이 자리에서 가장 필요한 정보라 주제명을 넣었다(제안). 주제가 없으면 줄을 통째로
      // 뺀다(가짜 문구를 지어내지 않는다).
      {...(topicTitle !== undefined ? { subtitle: topicTitle } : {})}
      documentTitle={buildPerformanceReportFileName({
        topicTitle,
        studentName,
        reportName: REPORT_FILE_NAME_LABEL,
      })}
      scrollLabel="설계 리포트 본문"
      {...(studentName !== undefined ? { studentName } : {})}
      onClose={onClose}
      footer={({ print }) => (
        <>
          <button
            type="button"
            onClick={onClose}
            className={REPORT_MODAL_FOOTER_BUTTON.secondary}
          >
            {CLOSE_LABEL}
          </button>
          <button
            type="button"
            // react-to-print(iframe 격리)를 쓴다 — "PDF로 저장"도 그 인쇄 다이얼로그의 대상
            // 선택이라 별도 PDF 생성 라이브러리가 필요 없다(`ReportModalShell`이 소유).
            // 본문이 비면 인쇄할 것이 없으므로 비활성.
            onClick={print}
            disabled={!hasContent}
            className={REPORT_MODAL_FOOTER_BUTTON.primary}
          >
            {PRINT_LABEL}
          </button>
        </>
      )}
    >
      {hasContent ? (
        <PerformanceReportSurface>
          <SectionedReportView sections={visibleSections} />
        </PerformanceReportSurface>
      ) : (
        // 서버가 빈 섹션을 걸러 내려주므로(`buildSections`의 마지막 filter) 정상 경로에서는
        // 도달하지 않는다. 저장된 옛 리포트를 복원하는 경로(`toClientReport`가 `sections`를
        // 그대로 통과시킨다)를 위한 방어선이다 — 이때 인쇄 버튼도 비활성이다.
        <p className="text-app-card-title font-medium leading-5.25 text-ink-sub">
          설계 리포트 내용을 불러오지 못했어요. 창을 닫고 다시 시도해 주세요.
        </p>
      )}
    </ReportModalShell>
  );
}
