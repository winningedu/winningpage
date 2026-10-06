import type { SurveyPick, SurveyQuestion, SurveyValue } from "@/lib/growth/api";
import DepartmentField from "./DepartmentField";
import { SURVEY_COPY, SURVEY_LABELS } from "./surveyLabels";
import { toggleOption } from "./surveySearch";
import {
  type AnswerOrigin,
  isShortAnswer,
  PREFILL_BADGE,
  TEXT_MAX,
} from "./surveyState";
import UniversitiesField from "./UniversitiesField";

type SurveyQuestionBlockProps = {
  question: SurveyQuestion;
  number: number;
  value: SurveyValue | null | undefined;
  origin: AnswerOrigin | undefined;
  disabled: boolean;
  onChange: (key: string, value: SurveyValue | null) => void;
};

// 긴 서술형(q17)만 입력 칸을 높게 둔다(시안 632:302).
const TALL_TEXT_KEYS: ReadonlySet<string> = new Set(["q17"]);

export default function SurveyQuestionBlock({
  question,
  number,
  value,
  origin,
  disabled,
  onChange,
}: SurveyQuestionBlockProps) {
  const label = SURVEY_LABELS[question.key];
  const title = `${number}. ${label?.title ?? ""}`;
  const labelId = `survey-${question.key}-label`;
  const options = question.options ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3
          id={labelId}
          className="text-app-body font-semibold text-ink-strong"
        >
          {title}
        </h3>
        {origin && (
          <span className="rounded-full bg-surface-03 px-2 py-0.5 text-app-badge font-medium text-accent">
            {PREFILL_BADGE[origin]}
          </span>
        )}
      </div>

      {question.kind === "text" && (
        <TextInput
          labelId={labelId}
          value={typeof value === "string" ? value : ""}
          tall={TALL_TEXT_KEYS.has(question.key)}
          disabled={disabled}
          onChange={(next) => onChange(question.key, next)}
        />
      )}

      {question.kind === "choice" && (
        <ChipGroup
          labelId={labelId}
          options={options}
          selected={typeof value === "string" ? [value] : []}
          disabled={disabled}
          onToggle={(option) =>
            onChange(question.key, value === option ? null : option)
          }
        />
      )}

      {question.kind === "multi" && (
        <ChipGroup
          labelId={labelId}
          options={options}
          selected={Array.isArray(value) ? (value as string[]) : []}
          disabled={disabled}
          onToggle={(option) =>
            onChange(
              question.key,
              toggleOption(
                Array.isArray(value) ? (value as string[]) : [],
                option,
              ),
            )
          }
        />
      )}

      {question.kind === "department" && (
        <DepartmentField
          ariaLabel={title}
          value={isPickValue(value) ? value : null}
          disabled={disabled}
          onChange={(next) => onChange(question.key, next)}
        />
      )}

      {question.kind === "universities" && (
        <UniversitiesField
          ariaLabel={title}
          value={Array.isArray(value) ? (value as SurveyPick[]) : []}
          disabled={disabled}
          onChange={(next) => onChange(question.key, next)}
        />
      )}
    </div>
  );
}

function isPickValue(value: unknown): value is SurveyPick {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as SurveyPick).name === "string"
  );
}

function TextInput({
  labelId,
  value,
  tall,
  disabled,
  onChange,
}: {
  labelId: string;
  value: string;
  tall: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        aria-labelledby={labelId}
        value={value}
        maxLength={TEXT_MAX}
        disabled={disabled}
        placeholder={SURVEY_COPY.textPlaceholder}
        rows={tall ? 4 : 1}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full resize-y rounded-lg border border-line bg-white px-4 py-2.5 text-app-body text-ink placeholder:text-ink-sub focus:border-accent focus:outline-hidden disabled:bg-surface-04 ${
          tall ? "min-h-28" : "min-h-11"
        }`}
      />
      {isShortAnswer(value) && (
        <p className="text-app-caption text-ink-sub">
          {SURVEY_COPY.shortAnswerHint}
        </p>
      )}
    </div>
  );
}

function ChipGroup({
  labelId,
  options,
  selected,
  disabled,
  onToggle,
}: {
  labelId: string;
  options: readonly string[];
  selected: readonly string[];
  disabled: boolean;
  onToggle: (option: string) => void;
}) {
  return (
    <fieldset
      aria-labelledby={labelId}
      className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0"
    >
      {options.map((option) => {
        const on = selected.includes(option);
        const className = `h-10 rounded-full border px-4 text-app-label font-medium transition-colors disabled:opacity-60 ${
          on
            ? "border-accent bg-surface-03 font-bold text-accent"
            : "border-line bg-white text-ink hover:bg-surface-04"
        }`;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onToggle(option)}
            className={className}
          >
            {option}
          </button>
        );
      })}
    </fieldset>
  );
}
