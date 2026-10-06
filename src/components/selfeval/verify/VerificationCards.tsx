import { Check } from "lucide-react";
import { CARD, CARD_TITLE } from "@/components/growth/start/cardStyles";
import type { VerificationSections } from "@/lib/selfeval/types";
import { discriminationLabel } from "./verifyLogic";

// 검증 결과 본문 카드들(시안 43~50). 점수 근거를 항목별로 그대로 보여 준다.

const BADGE = "rounded-full px-2 py-0.5 text-app-badge font-semibold";

function PassMark({ pass }: { pass: boolean }) {
  return pass ? (
    <span className="flex items-center gap-1 text-app-caption font-semibold text-emerald-800">
      <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
      통과
    </span>
  ) : (
    <span className={`${BADGE} bg-surface-warning text-ink-strong`}>
      확인 필요
    </span>
  );
}

export function MandatoryFixesCard({
  sections,
}: {
  sections: VerificationSections;
}) {
  if (sections.mandatoryFixes.length === 0) return null;
  return (
    <section
      className={`${CARD} border-error/40 bg-error/5`}
      role="alert"
      aria-label="필수 수정"
    >
      <h2 className={CARD_TITLE}>
        필수 수정이 남아 있어 제출 가능으로 보지 않아요
      </h2>
      <ul className="mt-3 flex flex-col gap-3">
        {sections.mandatoryFixes.map((fix) => (
          <li key={fix.key} className="text-app-label text-ink-strong">
            <p className="font-semibold">{fix.message}</p>
            {fix.detail && <p className="mt-0.5 text-ink-sub">{fix.detail}</p>}
            {fix.key === "cliche" && sections.clicheHits.length > 0 && (
              <p className="mt-0.5 text-ink-sub">
                걸린 표현: {sections.clicheHits.join(", ")}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ScoreItemCards({
  sections,
}: {
  sections: VerificationSections;
}) {
  return (
    <>
      {sections.items.map((item) => (
        <section key={item.key} className={CARD}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={CARD_TITLE}>{item.label}</h2>
            <div className="flex items-center gap-2">
              <span className={`${BADGE} bg-surface-04 text-ink-sub`}>
                {discriminationLabel(item.discrimination)}
              </span>
              <span className="text-app-label font-semibold text-ink-strong">
                {item.score} / {item.max}
              </span>
            </div>
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {item.checks.map((check) => (
              <li
                key={check.text}
                className="flex items-center justify-between gap-3 text-app-label text-ink-strong"
              >
                <span>{check.text}</span>
                <PassMark pass={check.pass} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

export function FormatCard({ sections }: { sections: VerificationSections }) {
  if (sections.format.length === 0) return null;
  return (
    <section className={CARD}>
      <h2 className={CARD_TITLE}>형식 점검</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {sections.format.map((check) => (
          <li
            key={check.key}
            className="flex items-center justify-between gap-3 text-app-label text-ink-strong"
          >
            <span>
              {check.label}
              {check.skipped ? (
                <span className="ml-2 text-ink-sub">분량 판정을 껐어요</span>
              ) : (
                check.detail && (
                  <span className="ml-2 text-ink-sub">{check.detail}</span>
                )
              )}
            </span>
            {!check.skipped && <PassMark pass={check.pass} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GrowthFitCard({
  sections,
}: {
  sections: VerificationSections;
}) {
  const fit = sections.growthFit;
  if (!fit) return null;
  return (
    <section className={CARD}>
      <div className="flex items-center justify-between gap-2">
        <h2 className={CARD_TITLE}>성장설계 부합</h2>
        <span className={`${BADGE} bg-surface-02 text-ink-strong`}>
          점수 미반영
        </span>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {fit.stageChecks.map((check) => (
          <li
            key={check.text}
            className="flex items-center justify-between gap-3 text-app-label text-ink-strong"
          >
            <span>{check.text}</span>
            <PassMark pass={check.pass} />
          </li>
        ))}
        {fit.axisChecks.map((axis) => (
          <li key={axis.axis} className="text-app-label text-ink-strong">
            <p className="font-semibold">
              {axis.name} 현재 {axis.current}건 필요 {axis.required}건
            </p>
            <p className="mt-0.5 text-ink-sub">{axis.guideline}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ExcludedCard({ sections }: { sections: VerificationSections }) {
  if (sections.excluded.length === 0) return null;
  return (
    <section className={CARD}>
      <h2 className={CARD_TITLE}>채점에서 뺀 항목</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {sections.excluded.map((row) => (
          <li key={row.label} className="text-app-label text-ink-strong">
            <span className="font-semibold">{row.label}</span>
            <span className="ml-2 text-ink-sub">{row.note}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ImprovementsCard({
  sections,
}: {
  sections: VerificationSections;
}) {
  return (
    <section className={CARD}>
      <h2 className={CARD_TITLE}>고치면 좋은 곳</h2>
      {sections.improvements.length === 0 ? (
        <p className="mt-2 text-app-label text-ink-sub">
          항목별로 큰 결손은 없습니다
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {sections.improvements.map((row) => (
            <li key={row.key} className="text-app-label text-ink-strong">
              <p className="font-semibold">{row.label}</p>
              <p className="mt-0.5">{row.message}</p>
              {row.failedChecks.length > 0 && (
                <ul className="mt-1 flex flex-col gap-0.5 text-ink-sub">
                  {row.failedChecks.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
