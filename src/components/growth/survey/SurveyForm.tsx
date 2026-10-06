import { useEffect, useReducer, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import GoalCard from "@/components/goal/GoalCard";
import { GROWTH_PATHS } from "@/components/growth/growthPaths";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SurveyBootstrap } from "@/lib/growth/api";
import { cn } from "@/lib/utils";
import SurveyProgressCard from "./SurveyProgressCard";
import SurveyQuestionBlock from "./SurveyQuestionBlock";
import { prefillBanners } from "./surveySave";
import {
  answersReducer,
  countAnswered,
  firstUnansweredNumber,
  initialAnswers,
} from "./surveyState";
import { useSurveyPersistence } from "./useSurveyPersistence";

const LOCKED_MESSAGE = "리포트 생성이 시작된 회차는 설문을 바꿀 수 없어요";
const PRICING_PATH = "/pricing?service=growth";

type SurveyFormProps = {
  bootstrap: SurveyBootstrap;
  refetchBootstrap: () => Promise<void>;
};

/** 부트스트랩이 준비된 뒤에만 마운트한다. 초기 답은 마운트 때 한 번만 계산한다. */
export default function SurveyForm({
  bootstrap,
  refetchBootstrap,
}: SurveyFormProps) {
  const navigate = useNavigate();
  const { questions, openReport } = bootstrap;

  const [initial] = useState(() =>
    initialAnswers({ questions, openReport, prefill: bootstrap.prefill }),
  );
  // 출처가 없고 답이 있으면 서버에 저장돼 있던 답을 복원한 것이다.
  const resumed =
    Object.keys(initial.origins).length === 0 &&
    Object.keys(initial.answers).length > 0;
  const [state, dispatch] = useReducer(answersReducer, initial);

  const lockedByServer = (openReport?.currentStep ?? 0) > 0;
  const { saveState, failure, persist, saveNow, retry } = useSurveyPersistence({
    answers: state.answers,
    // 프리필 값은 서버에 없으므로 첫 저장 때 함께 보낸다.
    savedAnswers: resumed ? initial.answers : {},
    reportId: openReport?.id,
    enabled: !lockedByServer,
  });

  const locked = lockedByServer || failure === "locked";
  const noEntitlement = failure === "entitlement";
  const disabled = locked || noEntitlement;

  // 페이지를 떠날 때 남은 변경을 저장하고 시작 화면과 사이드바 데이터를 갱신한다.
  const persistRef = useRef(persist);
  persistRef.current = persist;
  const refetchRef = useRef(refetchBootstrap);
  refetchRef.current = refetchBootstrap;
  useEffect(() => {
    return () => {
      persistRef
        .current()
        .catch(() => undefined)
        .finally(() => {
          void refetchRef.current();
        });
    };
  }, []);

  const { answered, total } = countAnswered(questions, state.answers);
  const emptyCount = total - answered;
  const banners = prefillBanners({
    resumed,
    answered,
    nextNumber: firstUnansweredNumber(questions, state.answers),
    origins: state.origins,
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);

  const goCollect = async () => {
    setNavigating(true);
    const saved = disabled ? true : await saveNow();
    setNavigating(false);
    if (saved) navigate(GROWTH_PATHS.collect);
  };

  const onNext = () => {
    if (emptyCount > 0) setConfirmOpen(true);
    else void goCollect();
  };

  // 그룹은 서버가 준 순서대로 한 번씩 묶는다. 번호는 전체 순서의 1부터다.
  const groups: {
    name: string;
    items: { q: (typeof questions)[number]; n: number }[];
  }[] = [];
  questions.forEach((q, index) => {
    const last = groups[groups.length - 1];
    const item = { q, n: index + 1 };
    if (last && last.name === q.group) last.items.push(item);
    else groups.push({ name: q.group, items: [item] });
  });

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <SurveyProgressCard
        answered={answered}
        total={total}
        saveState={saveState}
        onRetry={retry}
      />

      {locked && (
        <GoalCard tone="cream" className="px-5 py-4">
          <p className="text-app-body font-semibold text-ink-strong">
            {LOCKED_MESSAGE}
          </p>
          <Link
            to={GROWTH_PATHS.generate}
            className={cn(
              buttonVariants({ variant: "default" }),
              "mt-3 h-10 px-4 text-app-label",
            )}
          >
            리포트 생성으로
          </Link>
        </GoalCard>
      )}

      {noEntitlement && (
        <GoalCard tone="cream" className="px-5 py-4">
          <p className="text-app-body font-semibold text-ink-strong">
            성장설계 이용권이 없어 답을 저장할 수 없어요
          </p>
          <Link
            to={PRICING_PATH}
            className={cn(
              buttonVariants({ variant: "default" }),
              "mt-3 h-10 px-4 text-app-label",
            )}
          >
            이용권 알아보기
          </Link>
        </GoalCard>
      )}

      {banners.map((banner) => (
        <GoalCard key={banner.title} tone="blue" className="px-5 py-4">
          <p className="text-app-body font-semibold text-ink-strong">
            {banner.title}
          </p>
          <p className="mt-1 text-app-label text-ink-sub">{banner.body}</p>
        </GoalCard>
      ))}

      {groups.map((group) => (
        <section
          key={group.name}
          aria-labelledby={`survey-group-${group.items[0]?.q.key}`}
          className="rounded-xl border border-line bg-white px-5 py-6"
        >
          <h2
            id={`survey-group-${group.items[0]?.q.key}`}
            className="text-app-section font-bold text-ink-strong"
          >
            {group.name} ({group.items.length}문항)
          </h2>
          <div className="mt-6 flex flex-col gap-7">
            {group.items.map(({ q, n }) => (
              <SurveyQuestionBlock
                key={q.key}
                question={q}
                number={n}
                value={state.answers[q.key]}
                origin={state.origins[q.key]}
                disabled={disabled}
                onChange={(key, value) =>
                  dispatch({ type: "change", key, value })
                }
              />
            ))}
          </div>
        </section>
      ))}

      <div className="flex justify-end gap-2">
        <Link
          to={GROWTH_PATHS.home}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-11 px-5 text-app-body",
          )}
        >
          이전
        </Link>
        <Button
          className="h-11 px-5 text-app-body"
          disabled={navigating}
          onClick={onNext}
        >
          활동 선택으로
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{emptyCount}문항이 비어 있어요</DialogTitle>
            <DialogDescription>
              {emptyCount}문항이 비어 있어요. 그래도 넘어갈까요?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              계속 답하기
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                void goCollect();
              }}
            >
              넘어가기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
