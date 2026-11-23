import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ANALYSIS_FIELD_LABELS,
  type AnalysisField,
  type Sentence,
} from "@/lib/selfeval/types";
import type { RepickGroup } from "./resultLogic";

// 문장 근거 다시 고르기(명세 No.147). 이 세션의 선택 기록과 확인한 수기 메모의 항목에서 고른다.

type Pick = { refId: string; item: AnalysisField };

type Props = {
  sentence: Sentence;
  groups: RepickGroup[];
  busy: boolean;
  onApply: (picks: Pick[]) => void;
  onCancel: () => void;
};

const keyOf = (p: Pick) => `${p.refId}:${p.item}`;

export default function EvidenceRepicker({
  sentence,
  groups,
  busy,
  onApply,
  onCancel,
}: Props) {
  const [picked, setPicked] = useState<Pick[]>(
    sentence.evidence.flatMap((e) =>
      e.refId === null || e.item === "student_input"
        ? []
        : [{ refId: e.refId, item: e.item }],
    ),
  );
  const has = (p: Pick) => picked.some((x) => keyOf(x) === keyOf(p));
  const toggle = (p: Pick) =>
    setPicked((prev) =>
      has(p) ? prev.filter((x) => keyOf(x) !== keyOf(p)) : [...prev, p],
    );

  return (
    <div className="mt-3 flex flex-col gap-3">
      {groups.map((g) => (
        <fieldset key={g.refId} className="rounded-lg bg-surface-03 px-3 py-2">
          <legend className="px-1 text-app-label font-semibold text-ink-strong">
            {g.title}
          </legend>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {g.items.map((item) => {
              const pick = { refId: g.refId, item };
              return (
                <label
                  key={item}
                  className="flex items-center gap-1 text-app-caption text-ink-strong"
                >
                  <input
                    type="checkbox"
                    checked={has(pick)}
                    onChange={() => toggle(pick)}
                    aria-label={`${g.title} ${ANALYSIS_FIELD_LABELS[item]}`}
                  />
                  {ANALYSIS_FIELD_LABELS[item]}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          className="h-8 px-3 text-app-label"
          disabled={busy}
          onClick={() => onApply(picked)}
        >
          적용
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-3 text-app-label"
          onClick={onCancel}
        >
          취소
        </Button>
      </div>
    </div>
  );
}
