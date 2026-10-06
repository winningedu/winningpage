import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import {
  useInquiryScreenStep,
  useInquiryShell,
} from "@/components/inquiry/InquiryShellContext";
import StepGuardCard from "@/components/inquiry/StepGuardCard";
import GeneratingCard from "@/components/inquiry/topics/GeneratingCard";
import GenerationFailedCard from "@/components/inquiry/topics/GenerationFailedCard";
import ProvisionalNotice from "@/components/inquiry/topics/ProvisionalNotice";
import SeedTopicInput from "@/components/inquiry/topics/SeedTopicInput";
import TopicCard from "@/components/inquiry/topics/TopicCard";
import {
  type CallOutcome,
  classifyCall,
  MAX_RERECOMMENDS,
  PLAN_LINES,
  RECOMMEND_LINES,
  RUNNING_RETRY_MS,
  remainingRerecommends,
  shouldStartRecommend,
} from "@/components/inquiry/topics/topicsLogic";
import { INQUIRY_PATHS } from "@/components/inquiry/inquiryPaths";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type ApiResult,
  createPlanReport,
  type PlanReportResponse,
  type RecommendResponse,
  recommendTopics,
} from "@/lib/inquiry/api";

// 경로: /app/inquiry/topics (화면 2, 주제 추천)
// 진입 시 location.state.startRecommend 가 참이거나 주제가 비어 있으면 추천을 부른다(부록 C).
// 생성 호출 오류는 topicsLogic.classifyCall 이 부록 C 공통 표대로 가른다.

const BODY = "flex w-full max-w-goal-content flex-col gap-4 px-4 pb-6 md:px-12";
const PRICING_PATH = "/pricing?service=inquiry";

type Mode = "recommend" | "plan";

type Phase =
  | { type: "idle" }
  | { type: "running"; mode: Mode }
  | { type: "failed"; mode: Mode; attempts: number | null }
  | { type: "terminal" }
  | { type: "noEntitlement" };

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export default function TopicsPage() {
  useInquiryScreenStep(2);
  const { session, isBootstrapLoading } = useInquiryShell();

  return (
    <>
      <GoalPageHeader
        title="이어서 할 수 있는 세 가지"
        subcopy="세 주제 모두 선택한 활동에서 출발해요. 연계 방식이 서로 다르니, 어떤 식으로 이어붙일지를 보고 고르세요."
      />
      {session ? (
        <TopicsBody />
      ) : isBootstrapLoading ? (
        <div role="status" aria-label="불러오는 중" className={BODY}>
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      ) : (
        <div className={BODY}>
          <StepGuardCard
            title="아직 세션이 없어요"
            description="정보 입력에서 학년과 진로, 과목을 적으면 주제가 나와요. 1단계 정보 입력으로 돌아가세요."
            backLabel="정보 입력으로"
            backTo={INQUIRY_PATHS.home}
          />
        </div>
      )}
    </>
  );
}

function TopicsBody() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, quota, topics, assets, gradeNote, applyBootstrap } =
    useInquiryShell();
  const sessionId = session?.id ?? "";
  const roundCount = session?.topicRoundCount ?? 0;

  const [phase, setPhase] = useState<Phase>({ type: "idle" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chargedNotice, setChargedNotice] = useState(false);
  const [selectMessage, setSelectMessage] = useState<string | null>(null);
  const [topicMessage, setTopicMessage] = useState<string | null>(null);
  const [roundLimited, setRoundLimited] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const alive = useRef(true);
  const started = useRef(false);
  const lastCall = useRef<(() => void) | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // 생성 호출 공통 루프: GENERATION_RUNNING 은 3초 뒤 같은 요청을 다시 보낸다.
  const runCall = useCallback(
    async <T,>(
      mode: Mode,
      call: () => Promise<ApiResult<T>>,
    ): Promise<{ outcome: CallOutcome; result: ApiResult<T> } | null> => {
      setPhase({ type: "running", mode });
      setErrorMessage(null);
      let retries = 0;
      for (;;) {
        const result = await call();
        if (!alive.current) return null;
        const outcome = classifyCall(result, retries);
        if (outcome.type !== "retry") return { outcome, result };
        retries += 1;
        await sleep(RUNNING_RETRY_MS);
        if (!alive.current) return null;
      }
    },
    [],
  );

  const showFailure = useCallback((mode: Mode, outcome: CallOutcome) => {
    if (outcome.type === "failed") {
      setPhase({ type: "failed", mode, attempts: outcome.attempts });
    } else if (outcome.type === "terminal") {
      setPhase({ type: "terminal" });
    } else if (outcome.type === "noEntitlement") {
      setPhase({ type: "noEntitlement" });
    } else {
      setPhase({ type: "idle" });
    }
  }, []);

  const recommend = useCallback(
    (seedTopic?: string) => {
      const request = seedTopic ? { sessionId, seedTopic } : { sessionId };
      lastCall.current = () => recommend(seedTopic);
      void runCall<RecommendResponse>("recommend", () =>
        recommendTopics(request),
      ).then((done) => {
        if (!done || !session) return;
        const { outcome, result } = done;
        if (outcome.type === "ok" && result.kind === "ok") {
          const data = result.data;
          setSelectedId(null);
          setSelectMessage(null);
          setTopicMessage(null);
          setChargedNotice(data.charged === false);
          applyBootstrap({
            topics: data.topics,
            gradeNote: data.gradeNote,
            ...(data.quota ? { quota: data.quota } : {}),
            session: data.session,
          });
          setPhase({ type: "idle" });
        } else if (outcome.type === "roundLimit") {
          setRoundLimited(true);
          setPhase({ type: "idle" });
        } else if (outcome.type === "error") {
          setErrorMessage(outcome.message);
          setPhase({ type: "idle" });
        } else {
          showFailure("recommend", outcome);
        }
      });
    },
    [sessionId, session, runCall, applyBootstrap, showFailure],
  );

  // 진입 시 한 번만 판정한다(StrictMode 이중 실행 방지).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const startRecommend =
      (location.state as { startRecommend?: boolean } | null)
        ?.startRecommend === true;
    if (
      shouldStartRecommend({
        hasSession: sessionId !== "",
        startRecommend,
        topicsCount: topics.length,
      })
    ) {
      recommend();
    }
  }, [location.state, sessionId, topics.length, recommend]);

  function makePlan() {
    if (!session) return;
    if (!selectedId) {
      setSelectMessage("주제를 하나 골라야 설계 리포트를 만들 수 있어요");
      return;
    }
    setSelectMessage(null);
    const topicId = selectedId;
    lastCall.current = makePlan;
    void runCall<PlanReportResponse>("plan", () =>
      createPlanReport({ sessionId, topicId }),
    ).then((done) => {
      if (!done) return;
      const { outcome } = done;
      if (outcome.type === "ok" || outcome.type === "sessionLocked") {
        if (done.result.kind === "ok") {
          applyBootstrap({ session: done.result.data.session });
        }
        navigate(INQUIRY_PATHS.design);
      } else if (outcome.type === "topicNotInRound") {
        setSelectedId(null);
        setTopicMessage(
          "고른 주제가 최신 추천 목록에 없어요. 다시 골라 주세요.",
        );
        setPhase({ type: "idle" });
      } else if (outcome.type === "roundLimit" || outcome.type === "error") {
        setErrorMessage(outcome.type === "error" ? outcome.message : null);
        setPhase({ type: "idle" });
      } else {
        showFailure("plan", outcome);
      }
    });
  }

  const remaining = remainingRerecommends(roundCount);
  const rerecommendBlocked = remaining === 0 || roundLimited;
  const busy = phase.type === "running";
  const charged = session?.status !== "draft";
  const reliability = assets[0]?.reliability ?? null;
  const provisional = topics[0]?.linkageType === "interest_based_provisional";

  const quotaText =
    quota && quota.quotaRemaining !== null && quota.quotaTotal !== null
      ? ` 남은 이용 횟수 ${quota.quotaRemaining} / ${quota.quotaTotal}회`
      : "";

  return (
    <div className={BODY}>
      <section
        aria-label="추천 현황"
        className="rounded-xl bg-blue-50 px-6 py-4"
      >
        <p className="text-app-label font-bold text-ink-strong">
          {`주제 추천을 ${roundCount}회 썼어요.${quotaText}`}
        </p>
        <p className="mt-0.5 text-app-caption text-ink-sub">
          다시 추천받아도 이용 횟수는 차감되지 않아요. 직전에 나온 주제는 다시
          나오지 않아요.
        </p>
        {gradeNote && (
          <p className="mt-1 text-app-caption text-ink-sub">{gradeNote}</p>
        )}
      </section>

      {chargedNotice && (
        <p
          role="note"
          className="rounded-xl bg-amber-50 px-6 py-3 text-app-label text-ink-strong"
        >
          이용권 차감이 되지 않았어요. 설계 리포트 단계에서 다시 확인해요.
        </p>
      )}

      {phase.type === "running" ? (
        phase.mode === "recommend" ? (
          <GeneratingCard
            title="주제를 만들고 있어요"
            lines={RECOMMEND_LINES}
          />
        ) : (
          <GeneratingCard title="설계를 짜고 있어요" lines={PLAN_LINES} />
        )
      ) : phase.type === "failed" || phase.type === "terminal" ? (
        <GenerationFailedCard
          variant={phase.type}
          mode={phase.type === "failed" ? phase.mode : "recommend"}
          attempts={phase.type === "failed" ? phase.attempts : null}
          charged={charged}
          onRetry={() => lastCall.current?.()}
          onChangeStart={() => navigate(INQUIRY_PATHS.home)}
          onRestart={() => navigate(INQUIRY_PATHS.home)}
        />
      ) : phase.type === "noEntitlement" ? (
        <section
          role="alert"
          className="rounded-xl border border-line/60 bg-white px-6 py-6"
        >
          <p className="text-app-card-title font-bold text-ink-strong">
            이용권이 필요해요
          </p>
          <Link
            to={PRICING_PATH}
            className={`${buttonVariants({ size: "lg" })} mt-4 h-10 px-5 text-app-label`}
          >
            이용권 보기
          </Link>
        </section>
      ) : (
        <>
          {provisional && (
            <ProvisionalNotice
              questions={topics[0]?.detail.followUpQuestions ?? []}
              onGoInfo={() => navigate(INQUIRY_PATHS.home)}
            />
          )}
          {topics.map((topic, i) => (
            <TopicCard
              key={topic.id}
              topic={topic}
              number={i + 1}
              defaultOpen={i === 0}
              selected={selectedId === topic.id}
              reliability={reliability}
              onSelect={() => {
                setSelectedId(topic.id);
                setSelectMessage(null);
                setTopicMessage(null);
              }}
            />
          ))}
        </>
      )}

      {topicMessage && (
        <p role="alert" className="text-app-label text-ink-strong">
          {topicMessage}
        </p>
      )}
      {errorMessage && (
        <p role="alert" className="text-app-label text-ink-strong">
          {errorMessage}
        </p>
      )}
      {rerecommendBlocked && (
        <p className="text-app-label text-ink-sub">
          재추천을 모두 썼어요. 이 안에서 골라 주세요.
        </p>
      )}

      <SeedTopicInput
        disabled={busy || rerecommendBlocked}
        onSubmit={(seed) => recommend(seed)}
      />

      <div className="flex flex-col items-end gap-2">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-10 px-5 text-app-label"
            disabled={busy || rerecommendBlocked}
            onClick={() => recommend()}
          >
            {`다시 추천받기(남은 ${remaining} / ${MAX_RERECOMMENDS})`}
          </Button>
          <Button
            type="button"
            size="lg"
            className="h-10 px-5 text-app-label"
            disabled={busy}
            aria-disabled={selectedId === null}
            onClick={makePlan}
          >
            선택한 주제로 설계 리포트 만들기
          </Button>
        </div>
        {selectMessage && (
          <p role="alert" className="text-app-label text-ink-strong">
            {selectMessage}
          </p>
        )}
      </div>
    </div>
  );
}
