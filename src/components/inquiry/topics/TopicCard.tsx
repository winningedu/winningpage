import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Reliability, TopicView } from "@/lib/inquiry/api";
import { LINK_KIND_LABELS } from "@/lib/inquiry/labels";
import { reliabilityNoteFor, topicBadges } from "./topicsLogic";

type Props = {
  topic: TopicView;
  /** 카드 번호(1부터). */
  number: number;
  /** 첫 카드는 기본 펼침(시안). */
  defaultOpen: boolean;
  selected: boolean;
  /** 출발 활동(primary 자산)의 신뢰도. 자산이 없으면 null. */
  reliability: Reliability | null;
  onSelect: () => void;
};

export default function TopicCard({
  topic,
  number,
  defaultOpen,
  selected,
  reliability,
  onSelect,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const detailId = useId();
  const { detail } = topic;
  const note = reliabilityNoteFor(reliability);

  return (
    <article
      aria-label={`추천 주제 ${number}`}
      className={`rounded-xl border bg-white px-6 py-6 ${
        selected ? "border-2 border-ink-strong" : "border-line/60"
      }`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <span
          aria-hidden="true"
          className="flex size-6 items-center justify-center rounded-full bg-ink-strong text-app-caption font-bold text-white"
        >
          {number}
        </span>
        {topicBadges(topic).map((badge) => (
          <span
            key={badge.key}
            className="rounded-full bg-surface-04 px-2.5 py-0.5 text-app-caption text-ink-sub"
          >
            {badge.label}
          </span>
        ))}
      </header>

      <h3 className="mt-4 text-app-card-title font-bold text-ink-strong">
        {detail.title}
      </h3>
      <p className="mt-1 text-app-label text-ink-sub">{detail.subtitle}</p>

      <ol aria-label="탐구 경로" className="mt-4 grid grid-cols-3 gap-6">
        <PathCell label="출발 활동" text={detail.path.from} />
        <PathCell
          label={LINK_KIND_LABELS[topic.linkKind]}
          text={detail.path.via}
        />
        <PathCell label="이번 탐구 질문" text={detail.path.to} emphasis />
      </ol>

      <dl className="mt-4 flex flex-col gap-1 text-app-label text-ink-sub">
        <div className="flex gap-2">
          <dt className="shrink-0 font-bold text-ink-strong">가설 1</dt>
          <dd>{detail.hypothesis1}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 font-bold text-ink-strong">가설 2</dt>
          <dd>{detail.hypothesis2}</dd>
        </div>
      </dl>

      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-app-caption text-ink-strong">
        <span className="font-bold">검증 가능성</span> {detail.verifiability}
      </p>

      {detail.fitReason && (
        <p className="mt-2 text-app-caption text-ink-sub">
          <span className="font-bold text-ink-strong">어긋나는 이유</span>
          <br />
          {detail.fitReason}
        </p>
      )}
      {note && <p className="mt-2 text-app-caption text-ink-sub">{note}</p>}

      {open && (
        <dl
          id={detailId}
          className="mt-4 flex flex-col gap-2 rounded-lg bg-surface-04 px-5 py-4 text-app-caption"
        >
          <DetailRow title="이 주제를 고른 이유" body={detail.reason} />
          <DetailRow
            title="반드시 다뤄야 할 개념"
            body={detail.concepts.join(", ")}
          />
          <DetailRow
            title="탐구 방법 4단계"
            body={detail.methodSteps.join(", ")}
          />
          <DetailRow
            title="자료와 출처 후보"
            body={detail.sourceCandidates.join(", ")}
          />
          <DetailRow title="진로와의 연결" body={detail.careerLink} />
          <DetailRow title="다음 방향" body={detail.nextDirection} />
        </dl>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-10 px-5 text-app-label"
          aria-expanded={open}
          aria-controls={open ? detailId : undefined}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "접기" : "자세히 보기"}
        </Button>
        <Button
          type="button"
          variant={selected ? "default" : "outline"}
          size="lg"
          className="h-10 px-5 text-app-label"
          aria-pressed={selected}
          onClick={onSelect}
        >
          {selected ? "선택됨" : "이 주제로 확정"}
        </Button>
      </div>
    </article>
  );
}

function PathCell({
  label,
  text,
  emphasis = false,
}: {
  label: string;
  text: string;
  emphasis?: boolean;
}) {
  return (
    <li
      className={`rounded-lg px-4 py-3 ${emphasis ? "bg-blue-50" : "bg-surface-04"}`}
    >
      <p className="text-app-caption text-ink-sub">{label}</p>
      <p className="mt-0.5 text-app-label font-bold text-ink-strong">{text}</p>
    </li>
  );
}

function DetailRow({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-4">
      <dt className="text-ink-sub">{title}</dt>
      <dd className="text-ink-strong">{body}</dd>
    </div>
  );
}
