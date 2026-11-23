import type { ScoreBar } from "@/lib/diagnosis-v3/types";
import StatusBadge, { areaStateOfScore, STATE_FILL_CLASS } from "./StatusBadge";

const SCORE_MAX = 100;

type ScoreBarsProps = {
  /** in display order as the payload gives it (22 r58, r65) */
  bars: readonly ScoreBar[];
};

/** Horizontal 0 to 100 bars with score and state label. */
export default function ScoreBars({ bars }: ScoreBarsProps) {
  return (
    <ul className="flex flex-col gap-3">
      {bars.map((bar) => {
        // ScoreBar carries no state code, so the state comes from the score (06 r20-r23)
        const state = areaStateOfScore(bar.score);
        return (
          <li
            key={bar.code}
            className="grid grid-cols-[7rem_1fr_2.5rem_auto] items-center gap-3 text-sm"
          >
            <span className="text-ink-strong">{bar.label}</span>
            <div
              role="img"
              aria-label={`${bar.label} ${bar.score}`}
              className="h-2 overflow-hidden rounded-full bg-surface-muted"
            >
              <div
                className={`h-full rounded-full ${STATE_FILL_CLASS[state]}`}
                style={{ width: `${(bar.score / SCORE_MAX) * 100}%` }}
              />
            </div>
            <span className="text-right font-semibold tabular-nums">
              {bar.score}
            </span>
            <StatusBadge state={state}>{bar.state}</StatusBadge>
          </li>
        );
      })}
    </ul>
  );
}
