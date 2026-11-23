import type { ReportCh04 } from "@/lib/selfeval/reportTypes";
import { circledList } from "./reportFormat";

export default function Ch04View({ ch }: { ch: ReportCh04 }) {
  return (
    <>
      <ul className="flex flex-col gap-3">
        {ch.rows.map((row) => (
          <li
            key={row.tag}
            data-testid={`ch04-row-${row.tag}`}
            data-muted={!row.reflected}
            className={`grid grid-cols-[3.5rem_1fr] gap-3 ${
              row.reflected ? "" : "opacity-55"
            }`}
          >
            <div>
              <p className="text-app-label font-bold text-ink-strong">
                {row.tag}
              </p>
              <p className="mt-1 text-app-caption text-ink-natural">
                {row.writtenOn}
              </p>
            </div>
            <div className="overflow-hidden rounded-2xl border border-line">
              <div className="flex items-start gap-2 bg-[#faf7f0] px-4 py-3">
                <span className="shrink-0 rounded bg-[#e3f5ec] px-1.5 py-0.5 text-[0.6875rem] font-bold leading-none text-[#15845a]">
                  학생 수기 입력
                </span>
                <p
                  data-testid="memo-text"
                  className="whitespace-pre-wrap text-app-label text-ink-strong"
                >
                  {row.text}
                </p>
              </div>
              <div className="flex items-start gap-2 border-t border-dashed border-line px-4 py-3 text-app-label text-ink-sub">
                {row.reflected ? (
                  <span className="shrink-0 rounded bg-surface-04 px-1.5 py-0.5 text-[0.6875rem] font-bold leading-none text-ink-strong">
                    문장 {circledList(row.sentenceNumbers)}
                  </span>
                ) : (
                  <>
                    <span className="shrink-0 rounded bg-surface-04 px-1.5 py-0.5 text-[0.6875rem] font-bold leading-none text-ink-strong">
                      미반영
                    </span>
                    {row.reasonLabel && (
                      <span className="shrink-0">{row.reasonLabel}</span>
                    )}
                  </>
                )}
                <p>{row.explanation}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div
        data-testid="ch04-rate"
        className="rounded-2xl border-l-4 border-[#15845a] bg-[#e3f5ec] p-4 text-app-label text-ink-strong"
      >
        <p className="font-bold">
          수기 기록 반영률 {ch.reflectedCount} / {ch.totalCount}
        </p>
        <p className="mt-1">{ch.summary}</p>
      </div>
    </>
  );
}
