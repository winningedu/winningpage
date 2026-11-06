// W7 요약. 왼쪽 도넛(서비스를 하나라도 쓴 학생)과 오른쪽 서비스별 이용현황 막대.

import { percent, SERVICES, type Totals } from "./format";

const RADIUS = 56;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface Props {
  totals: Totals;
  scopeLabel: string;
}

export default function EnrollmentSummaryCards({ totals, scopeLabel }: Props) {
  const ratio = percent(totals.joined, totals.total);
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-stretch">
      <section
        aria-label="서비스 이용 학생"
        className="flex shrink-0 items-center gap-5 rounded-2xl bg-goal-cardTone-neutral p-5 md:w-[14.5rem] md:flex-col md:items-start"
      >
        <svg
          viewBox="0 0 140 140"
          role="img"
          aria-label={`이용 학생 ${ratio}%`}
          className="size-[7.5rem] shrink-0 -rotate-90"
        >
          <circle
            cx="70"
            cy="70"
            r={RADIUS}
            fill="none"
            strokeWidth="14"
            className="stroke-surface-muted"
          />
          <circle
            cx="70"
            cy="70"
            r={RADIUS}
            fill="none"
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - ratio / 100)}
            className="stroke-primary"
          />
        </svg>
        <div className="flex flex-col gap-1">
          <h2 className="text-app-label text-ink-sub">서비스 이용 학생</h2>
          <p className="text-app-stat font-semibold text-ink-strong">{`${ratio}%`}</p>
          <p className="text-app-label text-ink">{`${totals.joined} / ${totals.total}명`}</p>
          {totals.capacityRate && (
            <>
              <p className="pt-2 text-app-caption font-medium text-ink">
                {`${scopeLabel} 가입률 ${totals.capacityRate.rate}%`}
              </p>
              {totals.capacityRate.excludedClassCount > 0 && (
                <p className="text-app-caption text-ink-sub">
                  {`정원 미입력 반 ${totals.capacityRate.excludedClassCount}개는 제외`}
                </p>
              )}
            </>
          )}
        </div>
      </section>
      <section
        aria-label="서비스별 이용현황"
        className="flex min-w-0 flex-1 flex-col gap-4 rounded-2xl bg-goal-cardTone-neutral px-6 py-5"
      >
        <div className="flex flex-col gap-1">
          <h2 className="text-app-card-title font-bold text-ink-strong">
            서비스별 이용현황
          </h2>
          <p className="text-app-label text-ink-sub">
            이용 학생 수와 선택한 범위 안의 비율
          </p>
        </div>
        <ul className="grid grid-cols-3 gap-2 md:grid-cols-6">
          {SERVICES.map((s) => {
            const pct = percent(totals.services[s.key], totals.total);
            return (
              <li key={s.key} className="flex flex-col items-center gap-2">
                <span className="text-app-label font-medium text-ink">
                  {`${pct}%`}
                </span>
                <span className="flex h-24 w-8 items-end rounded-full bg-surface-muted">
                  <span
                    className={`w-full rounded-full ${s.bar}`}
                    style={{ height: `${pct}%` }}
                  />
                </span>
                <span className="text-app-caption text-ink-sub">{s.label}</span>
                <span className="text-app-caption text-ink">
                  {`${totals.services[s.key]}명`}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
