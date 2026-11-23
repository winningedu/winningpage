import { useEffect, useState } from "react";
import { CARD, CARD_TITLE } from "@/components/growth/start/cardStyles";
import { Button } from "@/components/ui/button";
import { evidenceCompletion } from "@/lib/selfeval/evidence";
import type {
  EvidenceMemoView,
  GenerationSections,
  Sentence,
  SessionActivityView,
} from "@/lib/selfeval/types";
import EvidenceRepicker from "./EvidenceRepicker";
import {
  type EvidenceView,
  paragraphSummaries,
  repickGroups,
} from "./resultLogic";

// 결과 화면 우측 패널 두 장(시안 37~41).

type EvidenceProps = {
  sections: GenerationSections;
  activities: SessionActivityView[];
  memos: EvidenceMemoView[];
  selected: { sentence: Sentence; views: EvidenceView[] } | null;
  busy: boolean;
  onRepick: (
    sentenceId: string,
    picks: { refId: string; item: string }[],
  ) => void;
};

export function EvidencePanel({
  sections,
  activities,
  memos,
  selected,
  busy,
  onRepick,
}: EvidenceProps) {
  const summaries = paragraphSummaries(sections, activities);
  const completion = evidenceCompletion(
    sections.paragraphs.flatMap((p) => p.sentences),
  );
  const [repicking, setRepicking] = useState(false);
  // 다른 문장을 고르면 열려 있던 다시 고르기는 닫는다.
  const selectedId = selected?.sentence.id ?? null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 문장이 바뀔 때만 닫는다
  useEffect(() => setRepicking(false), [selectedId]);
  return (
    <aside className={CARD} aria-label="문장 근거">
      <h2 className={CARD_TITLE}>문장 근거</h2>
      <p className="mt-1 text-app-label text-ink-sub">
        근거 연결 {completion.linked}/{completion.total}문장
      </p>
      {selected ? (
        <div className="mt-3 flex flex-col gap-2">
          {selected.views.length === 0 && (
            <p className="rounded-lg bg-surface-03 px-4 py-3 text-app-label text-ink-strong">
              연결된 근거가 없어요
            </p>
          )}
          {selected.views.map((view, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: 문장 근거는 순서가 곧 식별자다
              key={i}
              className="rounded-lg bg-surface-03 px-4 py-3"
            >
              {view.kind === "activity" && (
                <>
                  <p className="text-app-label font-semibold text-ink-strong">
                    {view.activityName}
                  </p>
                  <p className="mt-1 text-app-caption font-medium text-accent">
                    {view.fieldLabel}
                  </p>
                  {view.source && (
                    <p className="mt-2 text-app-label text-ink-strong">
                      {view.source}
                    </p>
                  )}
                </>
              )}
              {view.kind === "memo" && (
                <>
                  <p className="text-app-label font-semibold text-ink-strong">
                    수기 메모{view.writtenAt ? ` ${view.writtenAt}` : ""}
                  </p>
                  <p className="mt-1 text-app-caption font-medium text-accent">
                    {view.fieldLabel}
                  </p>
                  <p className="mt-2 text-app-label text-ink-strong">
                    {view.text}
                  </p>
                </>
              )}
              {view.kind === "student" && (
                <p className="text-app-label text-ink-strong">
                  학생이 고치거나 직접 쓴 문장이에요
                </p>
              )}
            </div>
          ))}
          {repicking ? (
            <EvidenceRepicker
              sentence={selected.sentence}
              groups={repickGroups(activities, memos)}
              busy={busy}
              onApply={(picks) => {
                setRepicking(false);
                onRepick(selected.sentence.id, picks);
              }}
              onCancel={() => setRepicking(false)}
            />
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 self-start px-3 text-app-label"
              disabled={busy}
              onClick={() => setRepicking(true)}
            >
              근거 다시 고르기
            </Button>
          )}
        </div>
      ) : (
        <p className="mt-2 text-app-label text-ink-sub">
          문장을 누르면 어떤 활동에서 나왔는지 볼 수 있어요
        </p>
      )}
      <ul className="mt-4 flex flex-col gap-2">
        {summaries.map((s) => (
          <li key={s.number} className="text-app-label text-ink-strong">
            {s.number}문단
            {s.activityNames.length > 0 && `: ${s.activityNames.join(", ")}`}
          </li>
        ))}
      </ul>
    </aside>
  );
}

type PendingProps = {
  pending: Sentence[];
  busy: boolean;
  onConfirm: (sentenceId: string) => void;
  onRemove: (sentenceId: string) => void;
};

export function PendingFeelingsPanel({
  pending,
  busy,
  onConfirm,
  onRemove,
}: PendingProps) {
  if (pending.length === 0) {
    return (
      <aside
        className="rounded-xl bg-emerald-50 px-6 py-5"
        aria-label="확인이 필요한 표현"
      >
        <p className="text-app-card-title font-bold text-emerald-800">
          확인이 필요한 표현이 없습니다
        </p>
      </aside>
    );
  }
  return (
    <aside
      className={`${CARD} bg-surface-warning`}
      aria-label="확인이 필요한 표현"
    >
      <h2 className={CARD_TITLE}>확인이 필요한 표현 {pending.length}건</h2>
      <p className="mt-1 text-app-label text-ink-sub">
        실제로 그렇게 생각했는지 확인해 주세요. 아니면 지워 주세요
      </p>
      <ul className="mt-3 flex flex-col gap-3">
        {pending.map((sentence) => (
          <li key={sentence.id} className="rounded-lg bg-white px-4 py-3">
            <p className="text-app-label text-ink-strong">{sentence.text}</p>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                className="h-8 px-3 text-app-label"
                disabled={busy}
                onClick={() => onConfirm(sentence.id)}
              >
                맞아요
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 px-3 text-app-label"
                disabled={busy}
                onClick={() => onRemove(sentence.id)}
              >
                지우기
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
