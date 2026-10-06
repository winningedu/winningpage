import { useId, useState } from "react";
import type { RecordCandidate } from "@/lib/inquiry/types";
import { filterRecords, recordPeriod, subjectChips } from "./infoLogic";
import { PILL_OFF, PILL_ON } from "./styles";

type RecordPickerProps = {
  records: RecordCandidate[];
  subjectCounts: { subject: string; count: number }[];
  selectedIds: ReadonlySet<string>;
  disabled: boolean;
  onToggle: (record: RecordCandidate) => void;
};

const TAG =
  "rounded-full bg-surface-04 px-2.5 py-0.5 text-app-caption text-ink-sub";

// 위닝 기록에서 불러오기: 과목 버튼(전체 포함, 건수) + 체크 목록(No.36, 37).
// 기록이 0건이면 비활성 안내만 그린다(No.144).
export default function RecordPicker({
  records,
  subjectCounts,
  selectedIds,
  disabled,
  onToggle,
}: RecordPickerProps) {
  const base = useId();
  const [subject, setSubject] = useState<string | null>(null);

  if (records.length === 0) {
    return (
      <p className="rounded-lg bg-surface-04 px-4 py-3 text-app-label text-ink-sub">
        기록이 없어요. 위에서 주제를 직접 적어 주세요
      </p>
    );
  }

  const chips = subjectChips(subjectCounts);
  const visible = filterRecords(records, subject);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.value ?? "all"}
            type="button"
            aria-pressed={subject === chip.value}
            className={subject === chip.value ? PILL_ON : PILL_OFF}
            onClick={() => setSubject(chip.value)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {visible.map((record) => {
          const checked = selectedIds.has(record.id);
          const inputId = `${base}-${record.id}`;
          const period = recordPeriod(record);
          return (
            <li
              key={record.id}
              className={`flex gap-3 rounded-lg border px-4 py-3 ${
                checked
                  ? "border-accent bg-surface-04"
                  : "border-line/60 bg-white"
              }`}
            >
              <input
                id={inputId}
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => onToggle(record)}
                className="mt-1 size-4 shrink-0 accent-accent"
              />
              <label
                htmlFor={inputId}
                className="min-w-0 flex-1 cursor-pointer"
              >
                <span className="flex flex-wrap gap-1.5">
                  {record.subject && (
                    <span className={TAG}>{record.subject}</span>
                  )}
                  {period && <span className={TAG}>{period}</span>}
                </span>
                {record.topic && (
                  <span className="mt-1.5 block text-app-label font-semibold text-ink-strong">
                    {record.topic}
                  </span>
                )}
                {record.concept && (
                  <span className="mt-1 block text-app-caption text-ink-sub">
                    개념과 도구: {record.concept}
                  </span>
                )}
                {record.limitation && (
                  <span className="mt-0.5 block text-app-caption text-ink-sub">
                    확인하지 않고 넘어간 것: {record.limitation}
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
