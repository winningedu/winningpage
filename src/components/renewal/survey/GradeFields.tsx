import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  type GradeField,
  gradeMaxOf,
  mockFields,
  SUBJECT_FIELDS,
} from "@/data/diagnosisSurveyV3";
import { MOCK_GRADE_INPUT_RULE } from "@/data/renewalSurveyQuestions";
import { gradeBoundsOf, MOCK_MONTHS } from "@/lib/diagnosis-v3/validate";
import GradeInputGrid, { type GradeInputRule } from "./GradeInputGrid";

/** Typing mask: up to three digits and two decimals; range is checked on submit. */
const GRADE_PATTERN = /^\d{0,3}(\.\d{0,2})?$/;

/** Input rule of the q4 grade system; bounds are the ones validateAnswers enforces. */
export function gradeRule(q4: unknown): GradeInputRule {
  const max = gradeMaxOf(q4);
  return {
    code: max === null ? "OPEN" : `MAX${max}`,
    ...gradeBoundsOf(q4),
    decimals: 2,
    pattern: GRADE_PATTERN,
  };
}

type Fields = Readonly<Record<string, unknown>>;
const fieldsOf = (value: unknown): Fields =>
  typeof value === "object" && value !== null ? (value as Fields) : {};
const textFields = (value: unknown) =>
  fieldsOf(value) as Readonly<Record<string, string>>;

const MONTHS = Array.from(
  { length: MOCK_MONTHS.last - MOCK_MONTHS.first + 1 },
  (_, i) => MOCK_MONTHS.first + i,
);

/** q6 and q6r: one number cell named by the card title. */
export function NumberField({
  title,
  q4,
  value,
  onChange,
}: {
  title: string;
  q4: unknown;
  value: unknown;
  onChange: (value: string) => void;
}) {
  const rule = gradeRule(q4);
  return (
    <Input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label={title}
      value={typeof value === "string" ? value : ""}
      onChange={(event) => {
        const raw = event.target.value;
        if (raw === "" || rule.pattern.test(raw)) onChange(raw);
      }}
      className="h-17 w-full max-w-50 rounded-lg border-line bg-white text-center text-xl text-ink-title"
    />
  );
}

const toGroup = (key: string, fields: readonly GradeField[], mock = false) => ({
  key,
  fields: fields.map((field) => ({
    key: field.key,
    label: field.label,
    ...(mock ? { scale: "MOCK" } : {}),
  })),
});

/** q6s: five subject cells in the q4 grade system. */
export function SubjectGradesField({
  q4,
  value,
  onChange,
}: {
  q4: unknown;
  value: unknown;
  onChange: (value: Record<string, string>) => void;
}) {
  return (
    <GradeInputGrid
      groups={[toGroup("q6s", SUBJECT_FIELDS)]}
      constraint={gradeRule(q4)}
      value={textFields(value)}
      onChange={onChange}
    />
  );
}

/** q6m: exam month (judge-report R3: March to November) plus six cells. */
export function MockGradesField({
  grade,
  title,
  value,
  onChange,
}: {
  grade: unknown;
  title: string;
  value: unknown;
  onChange: (value: { month?: number; grades: Record<string, string> }) => void;
}) {
  const current = fieldsOf(value);
  const month = typeof current.month === "number" ? current.month : undefined;
  const grades = textFields(current.grades);
  return (
    <div className="flex w-full flex-col gap-5">
      <NativeSelect
        aria-label={title}
        value={month === undefined ? "" : String(month)}
        onChange={(event) =>
          onChange({
            ...(event.target.value === ""
              ? {}
              : { month: Number(event.target.value) }),
            grades,
          })
        }
      >
        <NativeSelectOption value="" />
        {MONTHS.map((m) => (
          <NativeSelectOption key={m} value={String(m)}>
            {m}월
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <GradeInputGrid
        groups={[toGroup("q6m", mockFields(grade), true)]}
        constraint={MOCK_GRADE_INPUT_RULE}
        value={grades}
        onChange={(next) =>
          onChange({ ...(month === undefined ? {} : { month }), grades: next })
        }
      />
    </div>
  );
}
