import { useId } from "react";
import PerformanceReportSurface from "@/components/performance/report/PerformanceReportSurface";
import ReportModalShell, {
  REPORT_MODAL_FOOTER_BUTTON,
} from "@/components/performance/report/ReportModalShell";
import { buildPerformanceReportFileName } from "@/components/performance/report/reportFileName";
import SectionedReportView, {
  getVisibleSections,
  type ReportSection,
} from "@/components/performance/report/SectionedReportView";

// STEP5 평가 리포트 모달 — docs/수행평가-상세-명세.md §5.16(`3754:4512` 실측) / §8.5 렌더 계약.
//
// **껍데기는 `ReportModalShell`이 갖는다** — §7.3 표 L1456이 `4512`(평가)와 `4722`(설계)를
// 한 행으로 묶어 같은 치수(77.5rem×46.9375rem, 좌 2.5rem / 콘텐츠 70.5rem / 우 4.5rem,
// 푸터 1240×80)를 지정했다. 여기 남는 것은 §5.16 고유분뿐이다: 점수 카드, 7섹션, 푸터 버튼.
//
// ── 렌더 계약: **카드 1 + sections 7** (명세 L1787 단정)
// 「평가 리포트 = 카드 1 + sections 7. 프롬프트의 평가 형식은 8항목이지만 **렌더 계약은
// 8섹션이 아니다.**」 §5.16의 「섹션 목록」 8행은 *프롬프트 항목 번호* 기준 표기이고,
// 1번 `종합 평가 점수`는 `score`/`summary` 스칼라 2개로 승격돼 `sections`에서 빠진다.
// 서버가 그 계약대로 내려준다(`api/performance/evaluate.js buildEvaluationSections` +
// `api/_lib/performance/prompts.js EVALUATION_REPORT_SECTIONS` 7종):
//
//   화면 순서 1 | 종합 평가 점수            | **이 파일의 점수 카드**(score + summary)
//   화면 순서 2 | 평가 기준 충족도          | sections[0] blocks=keyValue 3행(잘한 점/아쉬운 점/보완할 점)
//   화면 순서 3 | 주제 적합성               | sections[1] 〃
//   화면 순서 4 | 내용 구성                 | sections[2] 〃
//   화면 순서 5 | 자료 활용                 | sections[3] 〃
//   화면 순서 6 | 진로 및 심화 탐구 연결성  | sections[4] 〃
//   화면 순서 7 | 표절 위험 문장            | sections[5] text(단문 1단락 — 3분할 아님)
//   화면 순서 8 | 누적 기록용 요약          | sections[6] blocks=keyValue 4행
//
// **순서·라벨을 이 파일이 정하지 않는다.** 서버 상수(`EVALUATION_REPORT_SECTIONS`)가 이미
// §5.16 실측 순서로 고정돼 있어 그대로 렌더한다 — 클라이언트가 다시 정렬하거나 라벨을
// 매핑하면 두 곳이 갈라진다(P10 `DesignReportModal`과 같은 원칙).
//
// ── 푸터 버튼 — §11-Q15(어느 쌍이 정본인지 불명)에 대한 판정
// §5.16은 푸터를 `중간 저장`(secondary) / `다음 단계 선택하기`(primary)로 실측했고, 같은
// 좌표(1107,1299)에 딤 뒤 캔버스의 `저장 리포트 목록 가기` / `PDF로 저장 / 인쇄`가 겹쳐 있다.
// 판정과 근거:
//   · primary `다음 단계 선택하기` — **채택.** §4 플로우가 `EvalReport --> NextChoice :
//     다음 단계 선택하기 (3754:4349)`로 이 버튼의 전이를 명시한다(명세 L333). 즉 모달을 닫고
//     §5.17 분기 3버튼을 드러내는 것이 이 버튼의 정의된 동작이라 `onClose`로 수렴시킨다.
//   · secondary `중간 저장` — **버린다.** `중간 저장`은 §5.14 제출폼의 버튼이고
//     (`중간 저장` + `제출하고 평가 리포트 받기` 쌍), 이 모달이 열리는 시점엔 제출이 이미
//     끝나 저장할 초안이 없다. 아무 일도 하지 않는 버튼을 두는 것이 없는 것보다 나쁘다.
//   · 그 자리에 `PDF로 저장 / 인쇄`(겹친 쌍의 원문 문구)를 secondary로 놓는다 — 리포트
//     열람 화면에서 실제로 할 일이 있는 유일한 보조 동작이고, P10이 §5.13에 이미 만든
//     인쇄 경로(`ReportModalShell`의 `@media print`)를 그대로 쓴다.
//   · `저장 리포트 목록 가기`는 **버린다.** §5.18 저장 리포트 목록 라우트가 이 슬라이스에
//     없어 눌러도 갈 곳이 없다. 그 화면이 생기면 그때 배선한다.
// 두 라벨 모두 시안 원문이며, **고른 것은 문구가 아니라 조합·위계**다.

/**
 * §5.16 헤더 — 시안 실측 표에 제목/부제 문구 원문이 없다(§5.13과 같은 누락). 제안이며
 * `DesignReportModal`의 `통합 설계 리포트`와 같은 형식(리포트 종류 1줄 + 주제 부제)을 쓴다.
 */
const MODAL_TITLE = "평가 리포트";
const PRINT_LABEL = "PDF로 저장 / 인쇄";
const NEXT_LABEL = "다음 단계 선택하기";
/** PDF 파일명의 "리포트이름" 조각(QA 행354, `reportFileName.ts`). `DesignReportModal`과
 * 같은 관례 — 고객 요청 원문 "평가리포트"를 그대로 쓴다. */
const REPORT_FILE_NAME_LABEL = "평가리포트";

/**
 * 점수 카드 라벨 2종. 서버 `EVALUATION_SCORE_CARD_LABELS`(prompts.js)와 같은 문자열이며,
 * §5.16 실측 헤더(`종합 평가 점수`)와 본문 하위 키(`총평:`) 원문이다.
 * ⚠ `api/_lib/*`는 서버 전용 모듈이라 프론트에서 import하지 않는다(저장소 전반의 관례 —
 * `src/lib/validators.js` 주석과 같은 이유). 두 곳이 갈라지지 않게 여기 근거를 남긴다.
 */
const SCORE_SECTION_LABEL = "종합 평가 점수";
const SUMMARY_ROW_LABEL = "총평";

/** 만점. 프롬프트 원문 `- 예상 점수: X점 / 100점`(`evaluate-text.js:120`)의 100이다. */
const MAX_SCORE = 100;

export type EvaluationReport = {
  score: number | null;
  summary: string;
  sections: ReportSection[];
};

type EvaluationReportModalProps = {
  open: boolean;
  /** `POST /api/performance/evaluate` 응답의 `report` 그대로. */
  report?: EvaluationReport | null;
  /** 확정 주제. 헤더 부제 + PDF 파일명 첫 조각. */
  topicTitle?: string | undefined;
  /** 로그인 학생 이름. PDF 파일명 둘째 조각(QA 행354). 없으면 그 조각만 빠진다. */
  studentName?: string | null;
  /** ESC·딤 클릭·`다음 단계 선택하기` 공통 핸들러. */
  onClose: () => void;
};

export default function EvaluationReportModal({
  open,
  report,
  topicTitle,
  studentName,
  onClose,
}: EvaluationReportModalProps) {
  // 훅 입력과 렌더 조건을 한 표현식에서 파생시킨다(`ReportModalShell` 호출부 계약).
  const isOpen = open && Boolean(report);
  const visibleSections = report ? getVisibleSections(report.sections) : [];
  const score = normalizeScore(report?.score);
  const summary =
    typeof report?.summary === "string" ? report.summary.trim() : "";
  const hasScoreCard = score !== null || summary !== "";
  const hasContent = hasScoreCard || visibleSections.length > 0;

  return (
    <ReportModalShell
      open={isOpen}
      title={MODAL_TITLE}
      {...(topicTitle !== undefined ? { subtitle: topicTitle } : {})}
      documentTitle={buildPerformanceReportFileName({
        topicTitle,
        studentName,
        reportName: REPORT_FILE_NAME_LABEL,
      })}
      scrollLabel="평가 리포트 본문"
      {...(studentName !== undefined ? { studentName } : {})}
      onClose={onClose}
      footer={({ print }) => (
        <>
          <button
            type="button"
            onClick={print}
            disabled={!hasContent}
            className={REPORT_MODAL_FOOTER_BUTTON.secondary}
          >
            {PRINT_LABEL}
          </button>
          <button
            type="button"
            onClick={onClose}
            className={REPORT_MODAL_FOOTER_BUTTON.primary}
          >
            {NEXT_LABEL}
          </button>
        </>
      )}
    >
      {hasContent ? (
        // 섹션 간 gap 2.5rem(§5.16 「본문 … 섹션 간 gap 2.5rem(40)」)은 `SectionedReportView`가
        // 자기 안에서 `gap-10`으로 갖는다. 점수 카드는 그 바깥의 형제라 같은 값을 여기서 한 번
        // 더 준다 — 그래야 카드↔첫 섹션 이음매가 섹션끼리의 간격과 같아진다.
        <PerformanceReportSurface className="flex flex-col gap-10">
          {hasScoreCard ? <ScoreCard score={score} summary={summary} /> : null}
          <SectionedReportView sections={visibleSections} />
        </PerformanceReportSurface>
      ) : (
        // 서버가 계약 위반 응답을 502로 막으므로(`evaluate.js validateEvaluationPayload`)
        // 정상 경로에서는 도달하지 않는다. 저장된 옛 리포트를 복원하는 경로를 위한 방어선이다.
        <p className="text-app-card-title font-medium leading-5.25 text-ink-sub">
          평가 리포트 내용을 불러오지 못했어요. 창을 닫고 다시 시도해 주세요.
        </p>
      )}
    </ReportModalShell>
  );
}

/**
 * §5.16 1번 항목 — `종합 평가 점수` 카드. `score`(`86/100`)와 `summary`(`총평:`) 2개뿐이며
 * **섹션 배열에 들어오지 않는다**(§8.5 승격).
 *
 * 껍데기(파란 라벨 `<h3>` + `aria-labelledby` + 라벨↔본문 0.5rem)는 `SectionedReportView`의
 * 섹션과 정확히 같은 규칙을 쓴다 — 화면에서는 1번 항목이 나머지 7개와 한 줄기로 읽혀야 하고,
 * 그 컴포넌트에 이 카드를 밀어 넣으면(가짜 섹션으로 위장) 점수 타이포와 `sr-only` 보강을
 * 표현할 방법이 없다.
 *
 * **점수 타이포**: §5.16이 「`86/100`의 텍스트 박스 높이가 31px인데 스타일은 1rem/1.3125rem
 * 으로 기록됨 — 실제 표시 크기 재확인 필요」라고 미결로 남겼다. 31px = 1.9375rem이고 이는
 * 저장소 타입 램프에서 **1.5rem/1.9375rem** 짝(§5.18 목록 헤더와 동일)이라, 실측 박스 높이를
 * 근거로 1.5rem을 채택했다(1rem/1.3125rem이면 박스가 21px이어야 한다). 화면상으로도 종합
 * 점수는 이 모달에서 가장 먼저 읽혀야 하는 값이다.
 */
function ScoreCard({
  score,
  summary,
}: {
  score: number | null;
  summary: string;
}) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3
        id={headingId}
        className="text-app-card-title font-semibold leading-5.25 text-performance-reportHeading"
      >
        {SCORE_SECTION_LABEL}
      </h3>

      {score !== null ? (
        <p className="text-app-stat font-semibold text-ink-strong">
          {/* `86/100`을 그대로 낭독하면 "86 슬래시 100"처럼 읽히거나 스크린리더·언어 설정에
              따라 분수로 읽힌다. 보이는 글자는 시안 그대로 두고 낭독만 문장으로 바꾼다. */}
          <span aria-hidden="true">
            {score}
            <span className="text-app-card-title font-medium leading-5.25 text-ink-sub">
              /{MAX_SCORE}
            </span>
          </span>
          <span className="sr-only">{`${MAX_SCORE}점 만점에 ${score}점`}</span>
        </p>
      ) : null}

      {summary ? (
        // `PerformanceReportSurface`의 `.admission-text-line b::after`(콜론 자동 부착)는
        // 블록 뷰가 낸 마크업 전용이다. 여기는 손으로 쓴 마크업이라 콜론도 손으로 쓴다 —
        // 표시 결과는 §5.16 실측 `총평:`과 같다.
        <p className="whitespace-pre-wrap wrap-break-word text-app-card-title font-medium leading-5.25 text-ink-sub">
          <b className="font-semibold">{SUMMARY_ROW_LABEL}:</b> {summary}
        </p>
      ) : null}
    </section>
  );
}

/**
 * 점수는 서버가 이미 0~100 정수로 파싱·검증해 내려준다(`parseEvaluationScore`). 여기서
 * 다시 재는 것은 **저장된 옛 리포트를 복원하는 경로**(봉투에서 그대로 읽어 온 값) 때문이다.
 * 범위를 벗어나거나 숫자가 아니면 카드에서 점수 줄만 뺀다 — 억지로 0으로 보정하면 화면이
 * "0점"이라는 사실이 아닌 단정을 한다.
 */
function normalizeScore(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 0 || rounded > MAX_SCORE) return null;
  return rounded;
}
