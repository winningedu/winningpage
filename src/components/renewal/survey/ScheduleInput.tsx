import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  SCHEDULE_FIELD_LABELS,
  SURVEY_V3_QUESTIONS,
} from "@/data/diagnosisSurveyV3";
import { OPTIONS } from "@/lib/diagnosis-v3/options";
import type { IsoDate } from "@/lib/diagnosis-v3/types";
import { scheduleDateBounds, scheduleRowProblem } from "@/lib/renewalSurvey";
import OptionGroup from "./OptionGroup";

/** One event row while typing; kind and date stay "" until picked. */
export type ScheduleRow = { kind: string; date: string; subject: string };
export type ScheduleValue = ScheduleRow[] | "NONE" | "UNKNOWN";

const codeOf = (code: string | null) => String(code).slice("EVENT:".length);

// 14 r101-r107: dated kinds, then the two exclusive choices.
const EXCLUSIVE = ["NONE", "UNKNOWN"];
const KIND_ROWS = OPTIONS.q13.filter(
  (o) => !EXCLUSIVE.includes(codeOf(o.code)),
);
const CHOICE_ROWS = OPTIONS.q13.filter((o) =>
  EXCLUSIVE.includes(codeOf(o.code)),
);

// 13 E24 "최대 3개 \u00b7 일정 종류와 날짜를 골라 주세요.": its second part
// is the row message for a missing kind or date.
const INCOMPLETE_ROW_MESSAGE = (() => {
  const helper = SURVEY_V3_QUESTIONS.find((q) => q.id === "q13")?.helper;
  const message = helper?.split("\u00b7")[1]?.trim();
  if (!message) throw new Error("missing 13 E24 schedule helper");
  return message;
})();

const EMPTY_ROW: ScheduleRow = { kind: "", date: "", subject: "" };

const fieldClass =
  "h-17 rounded-perf-modal border-line bg-white px-5 text-xl text-ink-title md:text-xl";

/**
 * q13 schedule input: up to maxEvents dated events (13 F24) or one of the
 * exclusive choices (14 r106-r107). Dates run from the diagnosis date (Day 1)
 * to Day 42 (16 r30); the browser date picker blocks the rest.
 */
export default function ScheduleInput({
  value,
  maxEvents,
  diagnosedAt,
  onChange,
}: {
  value: unknown;
  maxEvents: number;
  diagnosedAt: IsoDate;
  onChange: (value: ScheduleValue) => void;
}) {
  const rows = Array.isArray(value) ? (value as ScheduleRow[]) : [];
  const choice = typeof value === "string" ? value : null;
  const bounds = scheduleDateBounds(diagnosedAt);
  const baseId = useId();

  const update = (index: number, patch: Partial<ScheduleRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className="flex w-full flex-col gap-5">
      {rows.map((row, index) => {
        const n = index + 1;
        const fieldId = (field: string) => `${baseId}-${field}-${n}`;
        const problem = scheduleRowProblem(row, diagnosedAt);
        const errorId = fieldId("error");
        const errorProps = problem
          ? { "aria-invalid": true, "aria-describedby": errorId }
          : {};
        return (
          <fieldset
            // rows have no stable id; order is the identity while editing
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            key={index}
            className="flex w-full flex-col gap-3 rounded-2xl border border-[#EDEDED] p-4 sm:flex-row sm:flex-wrap sm:items-end"
          >
            <label
              htmlFor={fieldId("kind")}
              className="flex flex-col gap-1 text-base font-medium text-[#808080]"
            >
              {SCHEDULE_FIELD_LABELS.kind}
              <NativeSelect
                id={fieldId("kind")}
                aria-label={`${SCHEDULE_FIELD_LABELS.kind} ${n}`}
                {...(row.kind === "" ? errorProps : {})}
                value={row.kind}
                onChange={(event) =>
                  update(index, { kind: event.target.value })
                }
                className="w-full sm:w-auto"
              >
                <NativeSelectOption value="">
                  {SCHEDULE_FIELD_LABELS.kind}
                </NativeSelectOption>
                {KIND_ROWS.map((option) => (
                  <NativeSelectOption
                    key={option.ordinal}
                    value={codeOf(option.code)}
                  >
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <label
              htmlFor={fieldId("date")}
              className="flex flex-col gap-1 text-base font-medium text-[#808080]"
            >
              {SCHEDULE_FIELD_LABELS.date}
              <Input
                type="date"
                id={fieldId("date")}
                aria-label={`${SCHEDULE_FIELD_LABELS.date} ${n}`}
                {...(row.date === "" || problem === "out_of_range"
                  ? errorProps
                  : {})}
                min={bounds.min}
                max={bounds.max}
                value={row.date}
                onChange={(event) =>
                  update(index, { date: event.target.value })
                }
                className={fieldClass}
              />
            </label>
            <label
              htmlFor={fieldId("subject")}
              className="flex flex-1 flex-col gap-1 text-base font-medium text-[#808080]"
            >
              {SCHEDULE_FIELD_LABELS.subject}
              <Input
                type="text"
                id={fieldId("subject")}
                aria-label={`${SCHEDULE_FIELD_LABELS.subject} ${n}`}
                value={row.subject}
                onChange={(event) =>
                  update(index, { subject: event.target.value })
                }
                className={fieldClass}
              />
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              삭제
            </Button>
            {problem && (
              <p
                id={errorId}
                className="basis-full text-base font-medium text-[#D92D20]"
              >
                {problem === "incomplete"
                  ? INCOMPLETE_ROW_MESSAGE
                  : `${bounds.min}부터 ${bounds.max} 사이 날짜를 골라 주세요.`}
              </p>
            )}
          </fieldset>
        );
      })}
      <Button
        type="button"
        variant="outline"
        disabled={rows.length >= maxEvents}
        onClick={() => onChange([...rows, EMPTY_ROW])}
        className="self-start"
      >
        일정 추가
      </Button>
      <OptionGroup
        variant="chip"
        options={CHOICE_ROWS.map((option) => ({
          value: codeOf(option.code),
          label: option.label,
        }))}
        value={choice}
        onChange={(next) => onChange(next as ScheduleValue)}
      />
    </div>
  );
}
