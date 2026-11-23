import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { SCHEDULE_FIELD_LABELS } from "@/data/diagnosisSurveyV3";
import { OPTIONS } from "@/lib/diagnosis-v3/options";
import type { IsoDate } from "@/lib/diagnosis-v3/types";
import { scheduleDateBounds } from "@/lib/renewalSurvey";
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

const EMPTY_ROW: ScheduleRow = { kind: "", date: "", subject: "" };

const fieldClass =
  "h-17 rounded-perf-modal border-line bg-white px-5 text-xl text-ink-title";

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

  const update = (index: number, patch: Partial<ScheduleRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className="flex w-full flex-col gap-5">
      {rows.map((row, index) => {
        const n = index + 1;
        return (
          <fieldset
            // rows have no stable id; order is the identity while editing
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            key={index}
            className="flex w-full flex-col gap-3 rounded-2xl border border-[#EDEDED] p-4 sm:flex-row sm:items-end"
          >
            <label className="flex flex-col gap-1 text-base font-medium text-[#808080]">
              {SCHEDULE_FIELD_LABELS.kind}
              <NativeSelect
                aria-label={`${SCHEDULE_FIELD_LABELS.kind} ${n}`}
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
            <label className="flex flex-col gap-1 text-base font-medium text-[#808080]">
              {SCHEDULE_FIELD_LABELS.date}
              <Input
                type="date"
                aria-label={`${SCHEDULE_FIELD_LABELS.date} ${n}`}
                min={bounds.min}
                max={bounds.max}
                value={row.date}
                onChange={(event) =>
                  update(index, { date: event.target.value })
                }
                className={fieldClass}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-base font-medium text-[#808080]">
              {SCHEDULE_FIELD_LABELS.subject}
              <Input
                type="text"
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
