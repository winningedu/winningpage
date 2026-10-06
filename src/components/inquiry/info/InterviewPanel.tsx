import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { gapCandidates } from "@/lib/inquiry/gaps";
import type { InterviewAnswers } from "@/lib/inquiry/types";
import type { LocalAsset } from "./infoLogic";
import {
  buildInterviewAsset,
  candidateOrigin,
  ENDING_OPTIONS,
  INTERVIEW_QUESTIONS,
  SOURCE_OPTIONS,
  selectedGaps,
  TASK_OPTIONS,
  toggleSource,
} from "./interviewLogic";
import { FIELD_ERROR, INPUT_CLASS, PILL_OFF, PILL_ON } from "./styles";

type InterviewPanelProps = {
  disabled: boolean;
  /** 저장할 때 붙일 자산 key(목록 안에서 겹치지 않는 값). */
  assetKey: string;
  onSave: (asset: LocalAsset) => void;
};

const EMPTY: InterviewAnswers = { q1: "", q3: [] };
const QUESTION = "text-app-label font-semibold text-ink-strong";

// 기억으로 되살리기(7문항, No.33~35). 접힌 상태로 시작한다. 빈틈 후보는 답변에서 규칙으로 만들고
// (모델 호출 없음) 학생이 실제로 그랬던 것만 골라 저장한다. 선택 0개면 저장할 수 없다.
export default function InterviewPanel({
  disabled,
  assetKey,
  onSave,
}: InterviewPanelProps) {
  const base = useId();
  const id = (name: string) => `${base}-${name}`;
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<InterviewAnswers>(EMPTY);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);

  const candidates = gapCandidates(answers);
  const gaps = selectedGaps(candidates, checked, custom);
  const set = (patch: Partial<InterviewAnswers>) =>
    setAnswers((prev) => ({ ...prev, ...patch }));

  function toggleChecked(text: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(text)) next.delete(text);
      else next.add(text);
      return next;
    });
  }

  function save() {
    const result = buildInterviewAsset(answers, gaps, assetKey);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setError(null);
    onSave(result.asset);
    setAnswers(EMPTY);
    setChecked(new Set());
    setCustom("");
    setOpen(false);
  }

  return (
    <div className="rounded-lg border border-line/60 bg-white">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id("panel")}
        disabled={disabled}
        className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-left text-app-label font-semibold text-ink-strong outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        onClick={() => setOpen((prev) => !prev)}
      >
        기억으로 되살리기 (7문항)
        <span aria-hidden="true" className="text-ink-sub">
          {open ? "접기" : "펼치기"}
        </span>
      </button>

      {open && (
        <div id={id("panel")} className="flex flex-col gap-5 px-4 pb-5">
          <p className="text-app-caption text-ink-sub">
            사본이 없는 활동을 7문항으로 되살려요. 답할 수 있는 것만 답하면
            돼요.
          </p>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={id("q1")} className={QUESTION}>
              1. {INTERVIEW_QUESTIONS[0]}
            </label>
            <Input
              id={id("q1")}
              className={INPUT_CLASS}
              value={answers.q1}
              onChange={(e) => set({ q1: e.target.value })}
            />
          </div>

          <fieldset className="flex min-w-0 flex-col gap-1.5">
            <legend className={QUESTION}>2. {INTERVIEW_QUESTIONS[1]}</legend>
            <div className="flex flex-wrap gap-2">
              {TASK_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={answers.q2 === option.value}
                  className={answers.q2 === option.value ? PILL_ON : PILL_OFF}
                  onClick={() =>
                    set({
                      q2: answers.q2 === option.value ? null : option.value,
                    })
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex min-w-0 flex-col gap-1.5">
            <legend className={QUESTION}>3. {INTERVIEW_QUESTIONS[2]}</legend>
            <div className="flex flex-wrap gap-2">
              {SOURCE_OPTIONS.map((option) => {
                const on = (answers.q3 ?? []).includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={on}
                    className={on ? PILL_ON : PILL_OFF}
                    onClick={() =>
                      set({ q3: toggleSource(answers.q3 ?? [], option.value) })
                    }
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={id("q4")} className={QUESTION}>
              4. {INTERVIEW_QUESTIONS[3]}
            </label>
            <Input
              id={id("q4")}
              className={INPUT_CLASS}
              value={answers.q4 ?? ""}
              onChange={(e) => set({ q4: e.target.value })}
            />
          </div>

          <fieldset className="flex min-w-0 flex-col gap-1.5">
            <legend className={QUESTION}>5. {INTERVIEW_QUESTIONS[4]}</legend>
            <div className="flex flex-wrap gap-2">
              {ENDING_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={answers.q5 === option.value}
                  className={answers.q5 === option.value ? PILL_ON : PILL_OFF}
                  onClick={() =>
                    set({
                      q5: answers.q5 === option.value ? null : option.value,
                    })
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={id("q6")} className={QUESTION}>
              6. {INTERVIEW_QUESTIONS[5]}
            </label>
            <Input
              id={id("q6")}
              className={INPUT_CLASS}
              value={answers.q6 ?? ""}
              onChange={(e) => set({ q6: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={id("q7")} className={QUESTION}>
              7. {INTERVIEW_QUESTIONS[6]}
            </label>
            <Input
              id={id("q7")}
              className={INPUT_CLASS}
              value={answers.q7 ?? ""}
              onChange={(e) => set({ q7: e.target.value })}
            />
          </div>

          <fieldset className="rounded-lg bg-surface-04 px-4 py-4">
            <legend className="px-1 text-app-label font-semibold text-ink-strong">
              빈틈 후보 (실제로 그랬던 것만 고르세요)
            </legend>
            <ul className="flex flex-col gap-2.5">
              {candidates.map((candidate) => (
                <li key={candidate.id} className="flex gap-2.5">
                  <input
                    id={id(candidate.id)}
                    type="checkbox"
                    checked={checked.has(candidate.text)}
                    onChange={() => toggleChecked(candidate.text)}
                    className="mt-1 size-4 shrink-0 accent-accent"
                  />
                  <label htmlFor={id(candidate.id)} className="cursor-pointer">
                    <span className="block text-app-label text-ink-strong">
                      {candidate.text}
                    </span>
                    <span className="block text-app-caption text-ink-sub">
                      {candidateOrigin(candidate, answers)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <label htmlFor={id("custom")} className="sr-only">
              후보에 없으면 직접 적기
            </label>
            <Input
              id={id("custom")}
              className={`${INPUT_CLASS} mt-3`}
              placeholder="후보에 없으면 직접 적기"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
          </fieldset>

          {error && (
            <p role="alert" className={FIELD_ERROR}>
              {error}
            </p>
          )}
          <div>
            <Button
              type="button"
              size="lg"
              className="h-10 px-6 text-app-label"
              disabled={disabled || gaps.length === 0}
              onClick={save}
            >
              빈틈 저장
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
