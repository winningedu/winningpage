import { useEffect, useState } from "react";
import {
  Navigate,
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router";
import type { CascadeLevel } from "@/components/renewal/survey/CascadingSelect";
import SurveyProgress from "@/components/renewal/survey/SurveyProgress";
import SurveyQuestionList from "@/components/renewal/survey/SurveyQuestionList";
import { SURVEY_V3_QUESTIONS } from "@/data/diagnosisSurveyV3";
import type { IsoDate } from "@/lib/diagnosis-v3/types";
import {
  getStepPath,
  remainingAfterScreen,
  SURVEY_FIRST_STEP_PATH,
  SURVEY_V3_STEPS,
  type SurveyDraft,
  screenProblems,
  visibleQuestionIds,
} from "@/lib/renewalSurvey";

type SurveyOutletContext = {
  answers: SurveyDraft;
  setAnswer: (questionId: string, value: unknown) => void;
  submitDiagnosis: () => Promise<unknown>;
  cascadeLevels?: CascadeLevel[];
  diagnosedAt: IsoDate;
  seed: string;
};

const HIGHLIGHT_MS = 3000;

const parseStep = (raw: string | undefined) => {
  const step = Number(raw);
  return Number.isInteger(step) &&
    String(step) === raw &&
    step >= 1 &&
    step <= SURVEY_V3_STEPS
    ? step
    : null;
};

/**
 * One v3 survey screen (기능요구명세서 row 6, 13 B pages). The shell owns the
 * answers; this page shows the visible cards and gates the next screen on
 * screenProblems (13 G required questions and invalid partial input).
 */
export default function SurveyStepPage() {
  const { step: rawStep } = useParams();
  const {
    answers,
    setAnswer,
    submitDiagnosis,
    cascadeLevels,
    diagnosedAt,
    seed,
  } = useOutletContext<SurveyOutletContext>();
  const navigate = useNavigate();
  const step = parseStep(rawStep);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // live region text; clicks counts CTA presses so the same message changes
  // on every press and the screen reader reads it again
  const [announced, setAnnounced] = useState<{
    label: string;
    clicks: number;
  } | null>(null);

  useEffect(() => {
    if (step !== null) window.scrollTo({ top: 0, behavior: "auto" });
  }, [step]);

  useEffect(() => {
    if (highlightedId === null) return undefined;
    const timer = window.setTimeout(() => setHighlightedId(null), HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [highlightedId]);

  if (step === null) return <Navigate to={SURVEY_FIRST_STEP_PATH} replace />;

  const problems = screenProblems(step, answers, diagnosedAt);
  const complete = problems.length === 0;
  const isLastStep = step === SURVEY_V3_STEPS;

  const label = (() => {
    if (!complete) return "모든 항목에 응답해주세요";
    if (isLastStep && submitting) return "진단 결과를 만드는 중…";
    if (isLastStep) return "진단 결과 보기";
    return `${remainingAfterScreen(step, answers)}개 문항이 남았어요`;
  })();

  const showFirstProblem = () => {
    const first = problems[0];
    if (!first) return;
    setHighlightedId(first);
    const label = SURVEY_V3_QUESTIONS.find((q) => q.id === first)?.label;
    if (label === undefined)
      throw new Error(`v3 survey has no question ${first}`);
    setAnnounced((prev) => ({ label, clicks: (prev?.clicks ?? 0) + 1 }));
    document
      .getElementById(`q-${first}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      // the shell navigates to the stored report on success
      await submitDiagnosis();
    } finally {
      setSubmitting(false);
    }
  };

  const handleClick = (() => {
    if (!complete) return showFirstProblem;
    if (isLastStep) return submit;
    return () => navigate(getStepPath(step + 1));
  })();

  return (
    <>
      <SurveyQuestionList
        questionIds={visibleQuestionIds(step, answers)}
        answers={answers}
        onAnswer={setAnswer}
        diagnosedAt={diagnosedAt}
        seed={seed}
        cascadeLevels={cascadeLevels}
        highlightedId={highlightedId}
      />

      <div className="flex w-full flex-col items-start gap-4">
        <SurveyProgress
          complete={complete}
          label={label}
          onClick={handleClick}
          busy={submitting}
        />
        <p role="status" className="sr-only">
          {announced
            ? `응답하지 않은 ${announced.label}번 문항으로 이동했어요.${
                announced.clicks % 2 === 0 ? "\u00a0" : ""
              }`
            : ""}
        </p>

        {step > 1 && (
          <button
            type="button"
            onClick={() => navigate(getStepPath(step - 1))}
            className="rounded-sm text-base font-medium leading-5 text-[#808080] underline underline-offset-4 transition-colors duration-150 hover:text-ink focus:outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            이전 단계로
          </button>
        )}
      </div>
    </>
  );
}
