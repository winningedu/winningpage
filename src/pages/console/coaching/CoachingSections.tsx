// W9 문구 칸: 상담 포인트, 강점과 보완, 향후 진로계획, 학습방법, 목표관리 상담 의견, 서비스별 요약.
// 서버가 만든 문장을 그대로 그린다. 비어 있는 칸은 그리지 않는다.

import { Button } from "@/components/ui/button";
import Chip from "../Chip";
import type { Coaching, ServiceCard, ServiceKey } from "./types";

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-app-label font-semibold text-ink-strong">{title}</h3>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li
            key={item}
            className="flex gap-2 text-app-body text-ink-strong before:mt-2.5 before:size-1.5 before:shrink-0 before:rounded-full before:bg-primary"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 종합 진단 상담 포인트, 강점과 보완, 향후 진로계획, 학습방법과 고지 문장. */
export function Narrative({ data }: { data: Coaching }) {
  const { text } = data;
  const points = [
    ...text.points,
    ...(text.gradeInputCheck ? [text.gradeInputCheck] : []),
    ...(text.competencyGap ? [text.competencyGap] : []),
  ];
  return (
    <>
      {points.length > 0 && (
        <div className="flex flex-col gap-2">
          <Bullets title="종합 진단 상담 포인트" items={points} />
          <p className="text-app-caption text-ink-sub">
            점수는 서비스 내부 기준이며 대학 평가, 합격 예측이 아닙니다
          </p>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-surface-info p-5">
          <Bullets title="강점" items={text.strengths} />
        </div>
        <div className="rounded-xl bg-surface-muted p-5">
          <Bullets title="보완" items={text.weaknesses} />
        </div>
      </div>
      {text.careerPlan && (
        <div className="flex flex-col gap-3">
          <h3 className="text-app-label font-semibold text-ink-strong">
            향후 진로계획
          </h3>
          <ul aria-label="향후 진로계획" className="flex flex-col gap-2">
            {text.careerPlan.map((row) => (
              <li key={row.label} className="flex gap-4">
                <span className="w-[4.5rem] shrink-0 text-app-label font-semibold text-ink-strong">
                  {row.label}
                </span>
                <span className="text-[0.9375rem] text-ink-strong">
                  {row.items.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Bullets title="학습방법" items={text.studyMethods} />
      <div className="flex flex-col gap-1 text-app-caption text-ink-sub">
        <p>
          서비스 이용 데이터로 자동 구성한 상담 참고안이며 교사 판단으로 보완.
        </p>
        <p>학교생활기록부 기재 문구가 아닙니다</p>
      </div>
    </>
  );
}

const TONE = {
  neutral: "Neutral",
  success: "Success",
  warning: "Warning",
} as const;

/** 서비스별 요약 카드. 이용 전 카드에는 상세 창 버튼이 없다. */
export function ServiceCards({
  cards,
  onOpen,
}: {
  cards: ServiceCard[];
  onOpen: (service: ServiceKey) => void;
}) {
  return (
    <section className="flex flex-col gap-4" aria-label="서비스별 요약">
      <div className="flex flex-col gap-1">
        <h2 className="text-app-card-title font-semibold text-ink-strong">
          서비스별 요약
        </h2>
        <p className="text-app-caption text-ink-sub">
          카드마다 상세 창을 열어 자세히 볼 수 있어요
        </p>
      </div>
      <ul className="grid gap-4 md:grid-cols-2">
        {cards.map((c) => (
          <li
            key={c.service}
            className="flex flex-col gap-3 rounded-2xl bg-goal-cardTone-neutral p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-app-card-title font-semibold text-ink-strong">
                {c.name}
              </h3>
              <Chip tone={c.state === "not_joined" ? "Disabled" : TONE[c.tone]}>
                {c.chip}
              </Chip>
            </div>
            {c.value && (
              <p className="text-[1.75rem] leading-tight font-bold text-ink-strong">
                {c.value}
              </p>
            )}
            {c.detail && (
              <p className="text-app-label text-ink-sub">{c.detail}</p>
            )}
            {c.state === "using" && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpen(c.service)}
                className="self-start rounded-lg"
              >
                상세 창 열기
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 목표관리 상담 의견. 미이용이면 한 줄만. */
export function GoalOpinionCard({ data }: { data: Coaching }) {
  const opinion = data.text.goalOpinion;
  if (!opinion) return null;
  const rows = opinion.details
    ? [
        ["기록 흐름", opinion.details.recordFlow],
        ["요일 패턴", opinion.details.weekdayPattern],
        ["방해 요인", opinion.details.distractions],
      ]
    : [];
  return (
    <section
      aria-label="목표관리 상담 의견"
      className="flex flex-col gap-4 rounded-2xl bg-goal-cardTone-neutral p-5 md:px-8 md:py-7"
    >
      <h2 className="text-app-card-title font-semibold text-ink-strong">
        목표관리 상담 의견
      </h2>
      <p className="text-app-body text-ink-strong">{opinion.summary}</p>
      {opinion.details && (
        <>
          <dl className="flex flex-col gap-2">
            {rows.map(([key, value]) => (
              <div key={key} className="flex gap-4">
                <dt className="w-[4.5rem] shrink-0 text-app-label font-semibold text-ink-strong">
                  {key}
                </dt>
                <dd className="text-app-body text-ink-strong">{value}</dd>
              </div>
            ))}
          </dl>
          <Bullets title="상담 질문" items={opinion.details.questions} />
        </>
      )}
    </section>
  );
}
