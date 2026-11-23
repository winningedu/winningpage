import {
  type ChoiceQuestion,
  choicesFor,
  PAIR_CHOICES,
  Q3_TARGET_LABELS,
  SURVEY_V3_QUESTIONS,
} from "@/data/diagnosisSurveyV3";
import type { QuestionId, TrackCode } from "@/lib/diagnosis-v3/codes";
import type { OptionRow } from "@/lib/diagnosis-v3/options";
import type { IsoDate } from "@/lib/diagnosis-v3/types";
import {
  draftTrack,
  type SurveyDraft,
  showsQ3Target,
} from "@/lib/renewalSurvey";
import ConditionalTextInput from "./ConditionalTextInput";
import OptionGroup from "./OptionGroup";
import QuestionCard from "./QuestionCard";

type SurveyQuestionListProps = {
  questionIds: readonly QuestionId[];
  answers: SurveyDraft;
  onAnswer: (questionId: string, value: unknown) => void;
  diagnosedAt: IsoDate;
  /** q23 shuffle seed */
  seed: string;
};

/**
 * v3 survey cards of one screen. Wording comes from the score source sheets
 * through diagnosisSurveyV3; answers are kept in the v3 contract shape where
 * the widget allows it (ordinals, Likert 0..4).
 */
export default function SurveyQuestionList({
  questionIds,
  answers,
  onAnswer,
}: SurveyQuestionListProps) {
  // null until q1 is answered; only q11 and q12 depend on it
  const track = draftTrack(answers);
  return (
    <div className="flex w-full flex-col items-start gap-10">
      {questionIds.map((id) => {
        const question = SURVEY_V3_QUESTIONS.find((q) => q.id === id);
        if (!question) return null;
        const value = answers[id];
        return (
          <QuestionCard
            key={id}
            number={question.label}
            category={question.category}
            title={question.title}
            helper={question.helper}
            maxSelect={question.maxPicks}
            selectedCount={Array.isArray(value) ? value.length : 0}
            questionId={id}
          >
            {(question.kind === "single" || question.kind === "multi") && (
              <ChoiceField
                id={id}
                multiple={question.kind === "multi"}
                chip={question.chip}
                maxPicks={question.maxPicks}
                track={track}
                value={value}
                onChange={(next) => onAnswer(id, next)}
              />
            )}
            {id === "q3" && showsQ3Target(answers) && (
              <TargetFields
                value={answers.q3Target}
                onChange={(next) => onAnswer("q3Target", next)}
              />
            )}
            {question.kind === "pair" && (
              <PairField
                value={value}
                onChange={(next) => onAnswer(id, next)}
              />
            )}
          </QuestionCard>
        );
      })}
    </div>
  );
}

function ChoiceField({
  id,
  multiple,
  chip,
  maxPicks,
  track,
  value,
  onChange,
}: {
  id: QuestionId;
  multiple: boolean;
  chip: boolean;
  maxPicks: number | undefined;
  track: TrackCode | null;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const rows = choicesFor(id as ChoiceQuestion, track);
  // q22 answers are MBTI codes (types.ts MbtiType | "NONE"), others ordinals
  const toKey = (row: OptionRow) =>
    id === "q22" ? String(row.code).slice("MBTI:".length) : String(row.ordinal);
  const fromKey = (key: string) => (id === "q22" ? key : Number(key));
  const options = rows.map((row) => ({ value: toKey(row), label: row.label }));
  if (multiple) {
    return (
      <OptionGroup
        variant={chip ? "chip" : "row"}
        multiple
        {...(maxPicks !== undefined ? { maxSelect: maxPicks } : {})}
        // 14 EXCLUSIVE rows, 16 r23: picking one clears the others
        exclusiveValues={rows
          .filter((row) => row.exclusive)
          .map((row) => String(row.ordinal))}
        options={options}
        value={Array.isArray(value) ? value.map(String) : []}
        onChange={(next) => onChange((next as string[]).map(Number))}
      />
    );
  }
  return (
    <OptionGroup
      variant={chip ? "chip" : "row"}
      options={options}
      value={value === undefined ? null : String(value)}
      onChange={(next) => onChange(fromKey(next as string))}
    />
  );
}

type Fields = Readonly<Record<string, unknown>>;
const fieldsOf = (value: unknown): Fields =>
  typeof value === "object" && value !== null ? (value as Fields) : {};

/** 13 H7: q3 options 1..3 open the target university and major inputs. */
function TargetFields({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: Fields) => void;
}) {
  const current = fieldsOf(value);
  return (
    <div className="flex w-full flex-col gap-3">
      {(["university", "major"] as const).map((key) => (
        <ConditionalTextInput
          key={key}
          label={Q3_TARGET_LABELS[key]}
          value={typeof current[key] === "string" ? current[key] : ""}
          onChange={(text) => onChange({ ...current, [key]: text })}
        />
      ))}
    </div>
  );
}

/** q21: weekday and weekend picked separately (13 F25). */
function PairField({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: Fields) => void;
}) {
  const current = fieldsOf(value);
  return (
    <div className="flex w-full flex-col gap-5">
      {PAIR_CHOICES.map((pair) => (
        <div key={pair.key} className="flex w-full flex-col gap-3">
          <p className="text-base font-medium leading-5 text-ink">
            {pair.label}
          </p>
          <OptionGroup
            variant="chip"
            ariaLabel={pair.label}
            options={pair.rows.map((row) => ({
              value: String(row.ordinal),
              label: row.label,
            }))}
            value={
              current[pair.key] === undefined ? null : String(current[pair.key])
            }
            onChange={(next) =>
              onChange({ ...current, [pair.key]: Number(next) })
            }
          />
        </div>
      ))}
    </div>
  );
}
