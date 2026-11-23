import { site } from "@/config/site";
import type { GoalCell, Page2 } from "@/lib/diagnosis-v3/types";
import CopyText from "./parts/CopyText";
import { REPORT_LABELS as L } from "./parts/labels";
import ReportCard from "./parts/ReportCard";
import ReportSheet from "./parts/ReportSheet";
import SectionHeader from "./parts/SectionHeader";

const PAGE = 2;

// 22 r34: 2 rows (명확 C, 탐색 E) by 3 columns (내재 IN, 혼합 MIX, 외재 EX).
const MATRIX_ROWS = [
  { key: "C", label: L.matrixClear },
  { key: "E", label: L.matrixExplore },
] as const;
const MATRIX_COLS = [
  { key: "IN", label: L.matrixIn },
  { key: "MIX", label: L.matrixMix },
  { key: "EX", label: L.matrixEx },
] as const;

type Page02GoalProps = { page: Page2; tocTitle: string };

/** 2p goal diagnosis, 22 r30-r36. */
export default function Page02Goal({ page, tocTitle }: Page02GoalProps) {
  const { specificity, reasons, matrix, ladder } = page;
  const target = [specificity.university, specificity.major]
    .filter(Boolean)
    .join(" ");
  const rungs = [
    { label: L.ladderFar, filled: ladder.far },
    { label: L.ladderMid, filled: ladder.mid },
    { label: L.ladderNear, filled: ladder.near },
  ];

  return (
    <ReportSheet page={PAGE}>
      <SectionHeader
        page={PAGE}
        tocTitle={tocTitle}
        title={page.title}
        lead={page.lead}
      />
      <div className="grid grid-cols-2 gap-4">
        {/* 22 r32 */}
        <ReportCard title={L.goalSpecificity}>
          <ol className="grid grid-cols-6 gap-1 text-center text-xs">
            {specificity.options.map((option, index) => {
              const isSelected = index === specificity.selectedIndex;
              return (
                <li
                  key={option}
                  data-step
                  aria-current={isSelected ? "step" : undefined}
                  className={`flex flex-col gap-1 ${isSelected ? "font-bold text-ink-title" : "text-ink-sub"}`}
                >
                  <span
                    aria-hidden
                    className={`h-2 rounded-full ${isSelected ? "bg-navy-ink" : "bg-surface-muted"}`}
                  />
                  {option}
                </li>
              );
            })}
          </ol>
          {target && <p className="font-semibold">{target}</p>}
        </ReportCard>
        {/* 22 r33, only when q3r was shown */}
        {reasons && (
          <ReportCard title={L.goalReasons}>
            <ul className="flex flex-wrap gap-2">
              {reasons.chips.map((chip) => (
                <li
                  key={chip}
                  className="rounded-md bg-navy-ink px-3 py-1 text-white"
                >
                  {chip}
                </li>
              ))}
            </ul>
            <dl className="grid grid-cols-[1fr_auto] gap-y-1">
              <dt>{L.intrinsic}</dt>
              <dd className="font-semibold">
                {reasons.intrinsic}
                {L.count}
              </dd>
              <dt>{L.extrinsic}</dt>
              <dd className="font-semibold">
                {reasons.extrinsic}
                {L.count}
              </dd>
            </dl>
          </ReportCard>
        )}
      </div>
      {/* 22 r34 */}
      <ReportCard title={L.goalMatrix}>
        <div className="grid grid-cols-[5rem_1fr_1fr_1fr] gap-2">
          <span />
          {MATRIX_COLS.map((col) => (
            <span key={col.key} className="text-center text-xs text-ink-sub">
              {col.label}
            </span>
          ))}
          {MATRIX_ROWS.map((row) => (
            <MatrixRow
              key={row.key}
              label={row.label}
              cells={MATRIX_COLS.map((col) =>
                matrix.cells.find(
                  (cell) => cell.cell === `${row.key}_${col.key}`,
                ),
              )}
              highlighted={matrix.highlighted}
            />
          ))}
        </div>
      </ReportCard>
      <div className="grid grid-cols-2 gap-4">
        {/* 22 r35 */}
        <ReportCard title={L.ladder}>
          <ul className="flex flex-col gap-2">
            {rungs.map((rung) => (
              <li
                key={rung.label}
                data-rung
                data-filled={String(rung.filled)}
                className={`flex items-center gap-2 border-b border-line pb-2 ${rung.filled ? "font-semibold" : "text-ink-sub"}`}
              >
                <span
                  aria-hidden
                  className={`size-3 rounded-full ${rung.filled ? "bg-navy-ink" : "border border-line"}`}
                />
                {rung.label}
                <span className="sr-only">
                  {rung.filled ? L.ladderFilled : L.ladderEmpty}
                </span>
              </li>
            ))}
          </ul>
          <p>
            <CopyText text={ladder.text} />
          </p>
        </ReportCard>
        {/* 22 r36 */}
        <ReportCard title={`${site.brandName} ${L.suggestion}`}>
          <ul className="flex list-disc flex-col gap-2 pl-4">
            {page.tips.map((tip) => (
              <li key={tip}>
                <CopyText text={tip} />
              </li>
            ))}
          </ul>
        </ReportCard>
      </div>
    </ReportSheet>
  );
}

type MatrixCell = Page2["matrix"]["cells"][number];

function MatrixRow({
  label,
  cells,
  highlighted,
}: {
  label: string;
  cells: readonly (MatrixCell | undefined)[];
  highlighted?: GoalCell;
}) {
  return (
    <>
      <span className="self-center text-xs text-ink-sub">{label}</span>
      {cells.map((cell, index) => {
        if (!cell) {
          // A cell the payload does not carry is not drawn (no fallback text).
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed 3-column grid slot
          return <span key={index} />;
        }
        const isCurrent = cell.cell === highlighted;
        return (
          <div
            key={cell.cell}
            data-cell={cell.cell}
            aria-current={isCurrent ? "true" : undefined}
            className={`rounded-lg p-3 ${isCurrent ? "border-2 border-navy-ink bg-white" : "bg-surface-card"}`}
          >
            <p className="font-semibold">{cell.name}</p>
            {isCurrent && (
              <p className="mt-1 text-xs text-ink">
                <CopyText text={cell.desc} />
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}
