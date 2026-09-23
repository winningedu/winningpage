import type { ReactNode } from "react";
import { useRef } from "react";
import { useReactToPrint } from "react-to-print";
import GoalTabs from "@/components/goal/GoalTabs";
import ReportCoverPage from "@/components/report/ReportCoverPage";
import { REPORT_PRINT_PAGE_BASE_STYLE } from "@/lib/report/printPageStyle";
import AdmissionChanceCard from "./AdmissionChanceCard";
import ConditionListCard from "./ConditionListCard";
import ConditionTileCard from "./ConditionTileCard";
import CoreItemsCard from "./CoreItemsCard";
import DistractionCard from "./DistractionCard";
import ExpectedEffectCard from "./ExpectedEffectCard";
import GoalAchievementCard from "./GoalAchievementCard";
import { buildGoalReportFileName } from "./goalReportFileName";
import LearningTypeCard from "./LearningTypeCard";
import MentorCommentCard from "./MentorCommentCard";
import ReportHeroCard from "./ReportHeroCard";
import ReportSection from "./ReportSection";
import StrategyListCard from "./StrategyListCard";
import StudyTimeBarChartCard from "./StudyTimeBarChartCard";
import SubjectShareCard from "./SubjectShareCard";
import TimeSlotEfficiencyCard from "./TimeSlotEfficiencyCard";

const PERIOD_TABS = [
  { value: "weekly", label: "주간" },
  { value: "monthly", label: "월간" },
];

// 자식 카드가 그대로 요구하는 shape 그대로 재사용한다(각 카드 .tsx의 Props 타입 참고) —
// api/goal/report.js buildGrowthReport() 반환값이 이 모양과 이미 일치한다는 전제(임무 지시
// "mock 제거" 절)를 그대로 타입으로 옮긴다.
type StatRow = { label: string; value: number; unit?: string };
type CardTip = { variant?: string; text?: ReactNode } | null;
type AdmissionRate = {
  delta: { direction: "up" | "down"; value: string };
  rate: number;
};
type AdmissionBlock = {
  university: string;
  susi: AdmissionRate;
  jeongsi: AdmissionRate;
};

export type GrowthReport = {
  heading?: string;
  periodLabel?: string;
  hero: {
    narrative?: string;
    kpis: Array<{ label: string; value: ReactNode }>;
  };
  overview: {
    label?: string;
    subLabel?: string;
    achievement: {
      title?: string;
      rows: Array<{ label: string; value: number; max?: number }>;
      weeks?: Array<{ label: string; min: number; upper: number }>;
    };
    studyTime: {
      title?: string;
      bars: Array<{ label: string; value: number }>;
      unit?: string;
    };
    condition: {
      title?: string;
      rows: Array<{ label: string; emoji?: ReactNode; value?: ReactNode }>;
    };
  };
  execution: {
    label?: string;
    subLabel?: string;
    subjectShare: {
      title?: string;
      empty?: boolean;
      emptyMessage?: ReactNode;
      rows?: StatRow[];
      tip?: CardTip;
    };
    timeSlot: { title?: string; rows: StatRow[]; tip?: CardTip };
    distraction: { title?: string; rows: StatRow[]; tip?: CardTip };
  };
  outcome: {
    label?: string;
    subLabel?: string;
    coreItems: { title?: string; rows: StatRow[]; tip?: CardTip };
    conditionTiles: {
      title?: string;
      tiles: Array<{
        emoji?: ReactNode;
        label: string;
        value?: ReactNode;
        avg?: ReactNode;
      }>;
      tip?: CardTip;
    };
    admission: { title?: string };
  };
  strategy?: {
    label?: string;
    subLabel?: string;
    learningType: { title?: string; badge?: string; body?: string };
    plan: {
      title?: ReactNode;
      rows: Array<{ label: string; value?: ReactNode }>;
    };
    expectedEffect: { title?: ReactNode; pills: string[]; caption?: ReactNode };
  } | null;
  mentorComment?: { dateLabel?: ReactNode; body?: ReactNode } | null;
  admission: { upper: AdmissionBlock; lower: AdmissionBlock };
};

type GrowthReportBodyProps = {
  period: "weekly" | "monthly";
  onPeriodChange: (period: "weekly" | "monthly") => void;
  report: GrowthReport;
  /** 로그인 학생 이름(자기 열람) 또는 자녀 이름(학부모 열람, ChildReport.tsx의
   * child.student_name). 자기 열람 경로(GrowthReport.tsx)는 이 리포트 조회 API에
   * 학생 이름이 내려오지 않아 생략한다 — 값이 없으면 표지에서 그 줄이 통째로 빠진다
   * (폴백 문구를 지어내지 않는다). */
  studentName?: string | null;
};

// 성장 리포트 본문(#33 주간 / #34 월간) — parent-view-spec.md §1-3/§4 원칙에 따라 셸과 완전히
// 분리된 재사용 컴포넌트다. 이번 범위는 학생 뷰(GoalAppLayout)만 이 컴포넌트를 감싸지만, 나중에
// 학부모 뷰 셸(GoalViewerLayout, parent-view-spec.md §2)이 동일한 `period`/`onPeriodChange`만
// 넘기면 그대로 재사용 가능하도록 이 파일 안에 `if (isParent)` 류의 뷰어 분기를 절대 두지 않는다.
//
// mock 제거(I단계 실배선) — 데이터는 더 이상 이 컴포넌트가 소유하지 않는다. fetch 훅은
// pages/goal/GrowthReport.jsx가 갖고, `report`는 api/goal/report.js buildGrowthReport()가
// 만드는 그대로다(합격 가능성 변화 데이터도 report.admission으로 함께 온다 — 예전엔
// 옛 목업 두 파일(mockAdmissionChance/monthlyAdmissionChance)에서 따로 import했었다).
// 순수 프레젠테이션 컴포넌트로만 남긴다 — 데이터 유무 판단(빈 상태 등)은
// 전부 report 필드 자체(예: execution.subjectShare.empty)로 표현되고, 이 컴포넌트는
// 그 값을 그대로 자식에게 흘린다.
//
// 주간/월간 차이는 오직 데이터 단위뿐이다(요일 7 ↔ 주차 4, Row1 카드①의 확장 여부, Row4 존재
// 여부) — 컴포넌트 트리는 동일하게 두고 데이터로만 분기한다(작업 지시 준수).
//
// 헤더 구조(탭 → 타이틀 순, `GoalPageHeader` 미사용)는 학습방향 리포트(DirectionReportBody, 타이틀
// → 탭 순)와 다르다. 판정: 시안 자체가 다르다 — part-11.md #33 세로 구조표는 `1. 탭 y=106` →
// `2. 페이지 타이틀 y=271` 순으로 탭이 타이틀보다 위에 있는 반면, part-13.md #37은 `100 페이지
// 타이틀` → `216 탭` 순으로 반대다. 두 화면은 사이드바 메뉴도 서로 다른 항목(성장 리포트 ↔
// 학습방향 리포트)이라 시안 확인 결과 이 차이는 구현 버그가 아니라 원본 시안의 의도적 차이로
// 판단해 각자 자기 시안 순서를 그대로 유지한다(작업 지시 "시안이 서로 다르면 시안을 따르되 그
// 사실을 주석으로 남길 것" 적용 — 강제 통일하지 않음).
export default function GrowthReportBody({
  period,
  onPeriodChange,
  report,
  studentName,
}: GrowthReportBodyProps) {
  const { overview, execution, outcome, strategy, mentorComment, admission } =
    report;

  // 표지(QA 2차 시트 행37·51) 목표 대학/학과 — 이 리포트는 별도 "목표 대학" 필드를
  // 내려주지 않는다. aggregate.ts computeAdmissionDelta가 이미
  // `[대학, 학과].filter(Boolean).join(" ")`로 합쳐 admission.upper.university에
  // 담아 두므로(목표관리 "이상 목표" 대학·학과) 그 값을 그대로 targetUniversity로
  // 재사용한다 — 별도로 학과만 떼어낼 필드가 없어 targetMajor는 쓰지 않는다.
  const coverTargetUniversity = admission.upper.university || undefined;

  // PDF 저장(QA 행319) — 수행평가 리포트 모달과 같은 react-to-print(iframe 격리) 패턴을
  // 재사용한다(`ReportModalShell.tsx`). 이 페이지는 모달이 아니라 전체 페이지라 딤·포털이
  // 필요 없고, 인쇄 대상만 `contentRef`로 감싼다 — 탭/버튼 툴바는 그 밖에 두어 인쇄에서
  // 자연히 빠진다(사이드바는 애초에 이 컴포넌트의 형제 노드라 별도 처리가 필요 없다,
  // `GoalAppLayout.tsx`). 베이스 인쇄 스타일(`@page` 여백 + 색 보존)은 두 화면이 공유하는
  // `REPORT_PRINT_PAGE_BASE_STYLE`을 그대로 쓴다 — 모달 크롬 규칙이 없어 이 페이지는
  // 추가로 이어붙일 규칙도 없다(카드들은 전부 div 기반 CSS 바/게이지라 SVG/canvas 대체
  // 문제 자체가 없다).
  const contentRef = useRef<HTMLDivElement>(null);
  const print = useReactToPrint({
    contentRef,
    pageStyle: REPORT_PRINT_PAGE_BASE_STYLE,
    documentTitle: buildGoalReportFileName({
      period,
      periodLabel: report.periodLabel,
    }),
  });

  return (
    <div className="max-w-goal-content px-4 pb-24 pt-perf-inset md:px-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <GoalTabs
          tabs={PERIOD_TABS}
          value={period}
          onChange={onPeriodChange}
          ariaLabel="리포트 기간"
          gap="1.875rem"
        />
        <button
          type="button"
          onClick={print}
          className="flex h-9 shrink-0 items-center rounded-lg border border-line px-4 text-app-label font-semibold leading-[1.2] text-ink-strong transition-colors hover:bg-surface-04"
        >
          PDF 저장
        </button>
      </div>

      <div ref={contentRef}>
        {/* 표지(QA 2차 시트 행37·51) — "화면 최상단"은 이 본문(contentRef) 영역의
            최상단으로 해석한다: 위 탭·PDF 버튼 툴바는 화면 제어용이라 인쇄 대상
            (contentRef) 밖에 있고, 표지는 인쇄 첫 페이지여야도 하므로 반드시
            contentRef 안이어야 한다. variant="flow"의 인쇄 전용 규칙
            (`FLOW_COVER_PRINT_RULE`)이 인쇄에서만 한 페이지를 채우고
            break-after:page로 다음 내용과 분리한다 — 화면에서는 리포트 본문 맨
            위 카드 하나로 보인다. */}
        <ReportCoverPage
          serviceLabel="목표관리"
          title={report.heading ?? ""}
          {...(studentName ? { studentName } : {})}
          {...(coverTargetUniversity
            ? { targetUniversity: coverTargetUniversity }
            : {})}
          {...(report.periodLabel ? { dateLabel: report.periodLabel } : {})}
        />

        <div className="mt-6 flex flex-wrap items-baseline gap-3">
          {/* 30px — 타입 스케일 밖 값(app-title 1.75rem보다 큼), 디자인 결정 대기 중 */}
          <h1 className="text-[1.875rem] font-bold leading-[1.4] text-ink-strong">
            {report.heading}
          </h1>
          <span className="text-app-body font-medium leading-[1.4] text-ink-sub">
            {report.periodLabel}
          </span>
        </div>

        <div className="mt-6">
          <ReportHeroCard
            narrative={report.hero.narrative}
            kpis={report.hero.kpis}
          />
        </div>

        <div className="mt-10 flex flex-col gap-10">
          <ReportSection label={overview.label} subLabel={overview.subLabel}>
            {/* Row1 — 비균등 3열. 시안 실측 372/720/196을 그대로 고정폭 쓰지 않고 가운데 칸을
              fr로 흘려보내 콘텐츠 우측 끝까지 재배분한다(결함8: 월간 Row1 우측 끝 1414 미정렬 수정). */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[23.25rem_1fr_12.25rem]">
              <GoalAchievementCard
                title={overview.achievement.title}
                variant={period}
                rows={overview.achievement.rows}
                weeks={overview.achievement.weeks}
              />
              <StudyTimeBarChartCard
                title={overview.studyTime.title}
                bars={overview.studyTime.bars}
                unit={overview.studyTime.unit}
              />
              <ConditionListCard
                title={overview.condition.title}
                rows={overview.condition.rows}
              />
            </div>
          </ReportSection>

          <ReportSection label={execution.label} subLabel={execution.subLabel}>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <SubjectShareCard {...execution.subjectShare} />
              <TimeSlotEfficiencyCard
                title={execution.timeSlot.title}
                rows={execution.timeSlot.rows}
                tip={execution.timeSlot.tip}
              />
              <DistractionCard
                title={execution.distraction.title}
                rows={execution.distraction.rows}
                tip={execution.distraction.tip}
              />
            </div>
          </ReportSection>

          <ReportSection label={outcome.label} subLabel={outcome.subLabel}>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <CoreItemsCard
                title={outcome.coreItems.title}
                rows={outcome.coreItems.rows}
                tip={outcome.coreItems.tip}
              />
              <ConditionTileCard
                title={outcome.conditionTiles.title}
                tiles={outcome.conditionTiles.tiles}
                tip={outcome.conditionTiles.tip}
              />
              <AdmissionChanceCard
                title={outcome.admission.title}
                data={admission}
              />
            </div>
          </ReportSection>

          {period === "monthly" && strategy && (
            <ReportSection label={strategy.label} subLabel={strategy.subLabel}>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-[15rem_1fr_27rem]">
                <LearningTypeCard {...strategy.learningType} />
                <StrategyListCard {...strategy.plan} />
                <ExpectedEffectCard {...strategy.expectedEffect} />
              </div>
            </ReportSection>
          )}
        </div>

        {/* 멘토가 이 기간에 아직 코멘트를 쓰지 않았으면(goal_mentor_comments 행 없음) 카드
            자체를 렌더하지 않는다(팀장 확정 "리포트에서 코멘트 행 없으면 멘토 카드 자체 미렌더"). */}
        {mentorComment && (
          <div className="mt-10">
            <MentorCommentCard
              dateLabel={mentorComment.dateLabel}
              body={mentorComment.body}
            />
          </div>
        )}
      </div>
    </div>
  );
}
