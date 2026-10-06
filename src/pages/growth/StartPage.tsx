import { useNavigate } from "react-router";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import {
  useGrowthScreenStep,
  useGrowthShell,
} from "@/components/growth/GrowthShellContext";
import { GROWTH_PATHS } from "@/components/growth/growthPaths";
import ActionRow from "@/components/growth/start/ActionRow";
import GuideCard from "@/components/growth/start/GuideCard";
import OpenReportBanner from "@/components/growth/start/OpenReportBanner";
import PreCheckCard from "@/components/growth/start/PreCheckCard";
import ProfileCard from "@/components/growth/start/ProfileCard";
import PromotionModal from "@/components/growth/start/PromotionModal";
import StudentCard from "@/components/growth/start/StudentCard";
import {
  deriveStartMode,
  pickProfileValues,
  resumeTarget,
  studentSummaryLine,
} from "@/components/growth/start/startLogic";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { SurveyBootstrap } from "@/lib/growth/api";

// 성장설계 시작 화면. 경로: /app/growth
// 단계 알림(useGrowthScreenStep)은 사이드바 진행단계가 의존한다.
// 하단 고지 3줄은 GrowthAppLayout 이 그린다(여기서 또 그리지 않는다).
const BODY = "flex w-full max-w-goal-content flex-col gap-4 px-4 pb-6 md:px-12";

export default function StartPage() {
  useGrowthScreenStep(1);
  const { bootstrap, isBootstrapLoading, refetchBootstrap } = useGrowthShell();

  return (
    <>
      <GoalPageHeader
        title="위닝 성장설계"
        subcopy="내 자료를 확인하고 시작합니다."
      />
      {bootstrap ? (
        <StartBody bootstrap={bootstrap} />
      ) : isBootstrapLoading ? (
        <div role="status" aria-label="불러오는 중" className={BODY}>
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : (
        <div className={BODY}>
          <p className="text-app-body text-ink-sub">
            성장설계 정보를 불러오지 못했어요.
          </p>
          <div>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-10 px-5 text-app-label"
              onClick={() => void refetchBootstrap()}
            >
              다시 시도
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function StartBody({ bootstrap }: { bootstrap: SurveyBootstrap }) {
  const navigate = useNavigate();
  const { studentName, refetchBootstrap } = useGrowthShell();
  const { openReport, entitlement } = bootstrap;
  const { values, usedInitial } = pickProfileValues(
    bootstrap.profile,
    bootstrap.profileInitial,
  );
  const mode = deriveStartMode({ entitlement, openReport });
  const questionCount = bootstrap.questions.length;

  return (
    <div className={BODY}>
      <StudentCard
        studentName={studentName}
        summaryLine={studentSummaryLine(values)}
        quotaRemaining={entitlement.quotaRemaining}
      />
      {openReport && <OpenReportBanner openReport={openReport} />}
      <ProfileCard
        values={values}
        usedInitial={usedInitial}
        onSaved={refetchBootstrap}
      />
      <PreCheckCard
        overview={bootstrap.activityOverview}
        questionCount={questionCount}
      />
      <GuideCard questionCount={questionCount} />
      {bootstrap.promotion?.propose && bootstrap.promotion.next && (
        <PromotionModal
          next={bootstrap.promotion.next}
          onPromoted={refetchBootstrap}
        />
      )}
      <ActionRow
        mode={mode}
        canViewReports={bootstrap.reports.length > 0 || openReport !== null}
        onViewReports={() => navigate(GROWTH_PATHS.reports)}
        onPrimary={() =>
          navigate(openReport ? resumeTarget(openReport) : GROWTH_PATHS.survey)
        }
        onBuy={() => navigate("/pricing?service=growth")}
      />
    </div>
  );
}
