import { CARD, CARD_TITLE } from "@/components/growth/start/cardStyles";
import { Button } from "@/components/ui/button";
import type {
  GenerationSections,
  Sentence,
  SessionActivityView,
} from "@/lib/selfeval/types";
import { type EvidenceView, paragraphSummaries } from "./resultLogic";

// 결과 화면 우측 패널 두 장(시안 37~41).

type EvidenceProps = {
  sections: GenerationSections;
  activities: SessionActivityView[];
  selected: { sentence: Sentence; view: EvidenceView } | null;
};

export function EvidencePanel({
  sections,
  activities,
  selected,
}: EvidenceProps) {
  const summaries = paragraphSummaries(sections, activities);
  return (
    <aside className={CARD} aria-label="문장 근거">
      <h2 className={CARD_TITLE}>문장 근거</h2>
      {selected ? (
        <div className="mt-3 rounded-lg bg-surface-03 px-4 py-3">
          {selected.view.kind === "activity" ? (
            <>
              <p className="text-app-label font-semibold text-ink-strong">
                {selected.view.activityName}
              </p>
              <p className="mt-1 text-app-caption font-medium text-accent">
                {selected.view.fieldLabel}
              </p>
              {selected.view.source && (
                <p className="mt-2 text-app-label text-ink-strong">
                  {selected.view.source}
                </p>
              )}
            </>
          ) : (
            <p className="text-app-label text-ink-strong">
              학생이 고친 문장이에요
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-app-label text-ink-sub">
          밑줄 친 문장을 누르면 어떤 활동에서 나왔는지 볼 수 있어요
        </p>
      )}
      <ul className="mt-4 flex flex-col gap-2">
        {summaries.map((s) => (
          <li key={s.number} className="text-app-label text-ink-strong">
            {s.number}문단 {s.roleLabel}
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
