import { useState } from "react";
import {
  ANALYSIS_FIELD_LABELS,
  ANALYSIS_FIELDS,
  type Analysis,
  type AnalysisField,
} from "@/lib/selfeval/types";
import { fieldNote } from "./analysisLogic";

// 11항목 분석 표(시안 30~34). 칸을 누르면 그 자리에서 고치고, 벗어나면 바뀐 항목만 저장한다.
// 출처 배지와 안내는 fieldNote 가 정한다. 값이 없는 칸은 "비어 있어요" 로 두고 지어내지 않는다.

type Props = {
  analysis: Analysis;
  disabled: boolean;
  onCommit: (field: AnalysisField, value: string) => void;
  onResolve: (index: number, choice: "a" | "b") => void;
};

export default function AnalysisTable({
  analysis,
  disabled,
  onCommit,
  onResolve,
}: Props) {
  const [editing, setEditing] = useState<AnalysisField | null>(null);
  const [draft, setDraft] = useState("");

  function open(field: AnalysisField) {
    if (disabled) return;
    setDraft(analysis.values[field]);
    setEditing(field);
  }
  function commit(field: AnalysisField) {
    setEditing(null);
    onCommit(field, draft);
  }

  return (
    <ul className="flex flex-col divide-y divide-line/60 rounded-xl border border-line/60 bg-white">
      {ANALYSIS_FIELDS.map((field) => {
        const note = fieldNote(field, analysis.sources[field]);
        const value = analysis.values[field];
        const label = ANALYSIS_FIELD_LABELS[field];
        return (
          <li key={field} className="grid grid-cols-[7rem_1fr] gap-4 px-6 py-4">
            <div className="flex flex-col items-start gap-1">
              <span className="text-app-label font-semibold text-ink-strong">
                {label}
              </span>
              {note.badge && (
                <span className="rounded-full bg-surface-badge px-2 py-0.5 text-app-badge font-semibold text-ink-strong">
                  {note.badge}
                </span>
              )}
            </div>
            <div className="min-w-0">
              {editing === field ? (
                <textarea
                  aria-label={label}
                  // biome-ignore lint/a11y/noAutofocus: 눌러서 연 칸이라 바로 입력할 수 있어야 한다
                  autoFocus
                  rows={3}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commit(field)}
                  className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-app-label text-ink-strong outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              ) : (
                <button
                  type="button"
                  aria-label={`${label} 고치기`}
                  disabled={disabled}
                  onClick={() => open(field)}
                  className="block w-full rounded-lg px-2.5 py-1 text-left text-app-label text-ink-strong hover:bg-surface-04 disabled:cursor-not-allowed"
                >
                  {value.trim() === "" ? (
                    <span className="text-ink-natural">비어 있어요</span>
                  ) : (
                    value
                  )}
                </button>
              )}
              {note.caption && (
                <p className="mt-1 px-2.5 text-app-caption text-ink-sub">
                  {note.caption}
                </p>
              )}
            </div>
          </li>
        );
      })}
      {analysis.conflicts.map((c, index) =>
        c.resolved === null ? (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: 충돌은 서버 순서의 인덱스로 식별한다
            key={index}
            className="flex flex-col gap-3 bg-surface-warning px-6 py-4"
          >
            <span className="text-app-label font-semibold text-ink-strong">
              확인 필요
            </span>
            <p className="text-app-label text-ink-strong">
              {c.a.text} 와 {c.b.text} 중 어느 쪽이 맞나요
            </p>
            <div className="flex gap-2">
              {(["a", "b"] as const).map((choice) => (
                <button
                  key={choice}
                  type="button"
                  disabled={disabled}
                  onClick={() => onResolve(index, choice)}
                  className="h-9 rounded-lg border border-line bg-white px-4 text-app-label font-medium text-ink-strong hover:bg-surface-04 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {c[choice].text}
                </button>
              ))}
            </div>
          </li>
        ) : (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: 충돌은 서버 순서의 인덱스로 식별한다
            key={index}
            className="px-6 py-3 text-app-caption text-ink-sub"
          >
            수치 확인: {c.resolved}
          </li>
        ),
      )}
    </ul>
  );
}
