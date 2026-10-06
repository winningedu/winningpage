import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import {
  useGrowthScreenStep,
  useGrowthShell,
} from "@/components/growth/GrowthShellContext";
import GenerationNoticeCard from "@/components/growth/generate/GenerationNoticeCard";
import GenerationProgressCard from "@/components/growth/generate/GenerationProgressCard";
import {
  EntitlementCard,
  PrinciplesCard,
} from "@/components/growth/generate/GenerationSideCards";
import {
  describeGeneration,
  type GenerationAction,
  PRICING_PATH,
} from "@/components/growth/generate/generateView";
import { STEP_COUNT } from "@/components/growth/generate/stepLabels";
import { useReportGeneration } from "@/components/growth/generate/useReportGeneration";
import { GROWTH_PATHS } from "@/components/growth/growthPaths";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchReports, type StepProgress } from "@/lib/growth/api";

// 경로: /app/growth/generate
// 진입하면 사용자 클릭 없이 8단계 생성을 시작한다. 생성 루프는 components/growth/generate 의
// generationEngine(순수 상태 머신)이 돌리고, 이 페이지는 진입 가드와 화면 조립만 맡는다.

const BODY = "flex w-full max-w-goal-content flex-col gap-4 px-4 pb-6 md:px-12";
const AUTO_NAVIGATE_MS = 2000;

const SUBCOPY =
  "약 3분 걸립니다. 창을 닫아도 멈추지 않고, 다시 들어오면 마지막으로 끝난 단계부터 이어서 만듭니다.";

const CAUTIONS = [
  "이 진단은 위닝 내부 기준이에요. 합격 가능성이나 학교 평가를 예측하지 않아요.",
  "생활기록부 원문은 받지 않아요(초중등교육법 제25조의2).",
  "리포트 생성에 실패하면 이용권 차감은 자동으로 복구돼요.",
];

function emptyProgress(): StepProgress[] {
  return Array.from({ length: STEP_COUNT }, (_, i) => ({
    step: i + 1,
    label: "",
    status: "pending" as const,
    attempts: 0,
  }));
}

export default function GeneratePage() {
  useGrowthScreenStep(4);
  const { openReport, isBootstrapLoading } = useGrowthShell();
  // 생성이 끝나 부트스트랩이 갱신되면 openReport 가 사라진다. 진입 때 정한 회차를 붙잡아 둔다.
  const [reportId, setReportId] = useState<string | null>(null);
  const committed =
    openReport !== null &&
    !(openReport.status === "draft" && openReport.currentStep === 0);

  useEffect(() => {
    if (reportId === null && committed && openReport)
      setReportId(openReport.id);
  }, [reportId, committed, openReport]);

  return (
    <>
      <GoalPageHeader title="리포트를 만들고 있습니다" subcopy={SUBCOPY} />
      {reportId ? (
        <GenerationLoader reportId={reportId} />
      ) : committed ? null : isBootstrapLoading ? (
        <div role="status" aria-label="불러오는 중" className={BODY}>
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      ) : (
        <NotReady />
      )}
    </>
  );
}

function NotReady() {
  const navigate = useNavigate();
  return (
    <div className={BODY}>
      <section className="rounded-xl border border-line/60 bg-white px-6 py-5">
        <p className="text-app-card-title font-bold text-ink-strong">
          아직 리포트를 만들 수 없어요
        </p>
        <p className="mt-1 text-app-label text-ink-sub">
          활동을 선택하고 리포트 만들기를 누르면 생성이 시작돼요.
        </p>
        <Button
          type="button"
          size="lg"
          className="mt-4 h-10 px-5 text-app-label"
          onClick={() => navigate(GROWTH_PATHS.collect)}
        >
          활동 선택으로
        </Button>
      </section>
    </div>
  );
}

// 재진입 시 진행 단계는 목록 응답의 open.progress 에서 읽는다(부트스트랩에는 없다).
function GenerationLoader({ reportId }: { reportId: string }) {
  const [progress, setProgress] = useState<StepProgress[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt 는 다시 불러오기 신호다.
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    void fetchReports().then((result) => {
      if (cancelled) return;
      if (result.kind === "ok" && result.data.open?.id === reportId) {
        setProgress(
          result.data.open.progress.length > 0
            ? result.data.open.progress
            : emptyProgress(),
        );
      } else {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [reportId, attempt]);

  if (progress)
    return <GenerationRunner reportId={reportId} initial={progress} />;
  if (failed) {
    return (
      <div className={BODY}>
        <p className="text-app-body text-ink-sub">
          진행 상황을 불러오지 못했어요.
        </p>
        <div>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-10 px-5 text-app-label"
            onClick={() => setAttempt((n) => n + 1)}
          >
            다시 시도
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div role="status" aria-label="불러오는 중" className={BODY}>
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}

function GenerationRunner({
  reportId,
  initial,
}: {
  reportId: string;
  initial: StepProgress[];
}) {
  const navigate = useNavigate();
  const { entitlement, refetchBootstrap } = useGrowthShell();
  const { state, retry } = useReportGeneration({
    reportId,
    initialProgress: initial,
  });
  const [resumedDone] = useState(
    () => initial.filter((p) => p.status === "ok").length,
  );

  const finished = state.phase === "done" || state.phase === "terminal";
  useEffect(() => {
    if (finished) void refetchBootstrap();
  }, [finished, refetchBootstrap]);

  useEffect(() => {
    if (state.phase !== "done") return;
    const timer = setTimeout(
      () => navigate(GROWTH_PATHS.report(reportId)),
      AUTO_NAVIGATE_MS,
    );
    return () => clearTimeout(timer);
  }, [state.phase, reportId, navigate]);

  const notice = describeGeneration(state, resumedDone);

  function onAction(action: GenerationAction) {
    if (action === "retry") retry();
    else if (action === "start") navigate(GROWTH_PATHS.home);
    else if (action === "pricing") navigate(PRICING_PATH);
    else navigate(GROWTH_PATHS.report(reportId));
  }

  return (
    <div className={BODY}>
      {notice && <GenerationNoticeCard notice={notice} onAction={onAction} />}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <GenerationProgressCard state={state} />
        </div>
        <div className="flex w-full flex-col gap-4 lg:w-72 lg:shrink-0">
          <EntitlementCard
            state={state}
            quotaRemaining={entitlement?.quotaRemaining ?? null}
          />
          <PrinciplesCard />
        </div>
      </div>
      <section className="rounded-xl bg-surface-04 px-6 py-4">
        <p className="text-app-label font-bold text-ink-strong">
          꼭 알아 두세요
        </p>
        <ul className="mt-2 flex flex-col gap-1 text-app-caption text-ink-sub">
          {CAUTIONS.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
