import { buildChangeRows } from "./planLogic";

const CARD = "rounded-xl border border-border bg-white p-5";

/** 우측 카드 "완료하면 달라지는 것". metrics 가 없으면 "자료 없음". */
export function ChangeCard({
  metrics,
  recalculated,
}: {
  metrics: unknown;
  recalculated: boolean;
}) {
  const rows = buildChangeRows(metrics);
  return (
    <section aria-labelledby="plan-change-heading" className={CARD}>
      <div className="flex items-center justify-between gap-2">
        <h2
          id="plan-change-heading"
          className="text-app-card-title font-semibold text-ink-strong"
        >
          완료하면 달라지는 것
        </h2>
        {recalculated ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-app-badge font-medium text-emerald-800">
            방금 다시 계산함
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-app-caption text-ink-sub">
        지금과 모두 완료했을 때를 나란히 보여줘요.
      </p>
      {rows ? (
        <table className="mt-3 w-full text-left text-app-label">
          <thead>
            <tr className="text-app-caption text-ink-sub">
              <th scope="col" className="py-1 font-normal">
                항목
              </th>
              <th scope="col" className="py-1 text-right font-normal">
                지금
              </th>
              <th scope="col" className="py-1 text-right font-normal">
                완료 후
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-border align-top">
                <th scope="row" className="py-2 pr-2 font-normal text-ink-sub">
                  {row.label}
                </th>
                <td className="py-2 text-right text-ink-strong">
                  {row.now}
                  {row.nowVerdict ? (
                    <span className="block text-app-caption text-ink-sub">
                      {row.nowVerdict}
                    </span>
                  ) : null}
                </td>
                <td className="py-2 text-right font-semibold text-ink-strong">
                  {row.after}
                  {row.afterVerdict ? (
                    <span className="block text-app-caption font-normal text-ink-sub">
                      {row.afterVerdict}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-3 text-app-label text-ink-sub">자료 없음</p>
      )}
      <p className="mt-3 text-app-caption text-ink-sub">
        완료 처리되면 수치와 판정이 다시 계산돼요
      </p>
    </section>
  );
}

/** 우측 카드 "피해야 할 반복". 비면 그리지 않는다. */
export function AvoidRepeatsCard({ texts }: { texts: string[] }) {
  if (texts.length === 0) return null;
  return (
    <section aria-labelledby="plan-avoid-heading" className={CARD}>
      <h2
        id="plan-avoid-heading"
        className="text-app-card-title font-semibold text-ink-strong"
      >
        피해야 할 반복
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {texts.map((text) => (
          <li
            key={text}
            className="rounded-lg bg-amber-50 px-3 py-2 text-app-label text-ink-strong"
          >
            {text}
          </li>
        ))}
      </ul>
    </section>
  );
}
