import type { Page5 } from "@/lib/diagnosis-v3/types";
import CopyText from "./parts/CopyText";
import { REPORT_LABELS as L } from "./parts/labels";
import ReportCard from "./parts/ReportCard";
import ReportSheet from "./parts/ReportSheet";
import ScoreBars from "./parts/ScoreBars";
import SectionHeader from "./parts/SectionHeader";

const PAGE = 5;

type Page05ObstaclesProps = { page: Page5; tocTitle: string };

/** 5p obstacles and mind, 22 r55-r61. */
export default function Page05Obstacles({
  page,
  tocTitle,
}: Page05ObstaclesProps) {
  return (
    <ReportSheet page={PAGE}>
      <SectionHeader
        page={PAGE}
        tocTitle={tocTitle}
        title={page.title}
        lead={page.lead}
      />
      {/* 22 r57 */}
      <ReportCard title={L.obstacles}>
        <div className="grid grid-cols-7 gap-2">
          {page.groups.map((group) => {
            const pickedCount = group.options.filter(
              (option) => option.selected,
            ).length;
            return (
              <section
                key={group.area}
                data-group
                className={`flex flex-col gap-2 rounded-lg p-2 text-xs ${pickedCount > 0 ? "border-2 border-navy-ink" : "bg-surface-card"}`}
              >
                <h3 className="flex justify-between font-semibold">
                  <span>{group.area}</span>
                  <span>{pickedCount}</span>
                </h3>
                <ul className="flex flex-col gap-1">
                  {group.options.map((option) => (
                    <li
                      key={option.label}
                      data-selected={String(option.selected)}
                      className={option.selected ? "font-bold" : "text-ink-sub"}
                    >
                      {option.label}
                      {option.selected && (
                        <span className="sr-only"> {L.selected}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </ReportCard>
      <div className="grid grid-cols-2 gap-4">
        {/* 22 r58 */}
        <ReportCard title={L.mind}>
          <ScoreBars bars={page.mind.bars} />
          <p className="text-xs text-ink-sub">
            <CopyText text={page.mind.note} />
          </p>
        </ReportCard>
        {/* 22 r59 */}
        <ReportCard title={L.interpretation}>
          <ul className="flex list-disc flex-col gap-2 pl-4">
            {page.interpretation.areas.map((line) => (
              <li key={line}>
                <CopyText text={line} />
              </li>
            ))}
            <li>
              <CopyText text={page.interpretation.weak} />
            </li>
          </ul>
        </ReportCard>
      </div>
      {/* 22 r60 items, r61 skipped note, absent when SIMPLE with picks */}
      {page.crossCheck && (
        <ReportCard title={L.crossCheck}>
          {page.crossCheck.kind === "items" ? (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink-title text-xs text-ink-sub">
                <tr>
                  <th className="py-2 font-normal">{L.crossOption}</th>
                  <th className="py-2 font-normal">{L.crossAnswers}</th>
                  <th className="py-2 font-normal">{L.verdict}</th>
                </tr>
              </thead>
              <tbody>
                {page.crossCheck.items.map((item) => (
                  <tr key={item.option} className="border-b border-line">
                    <td className="py-2 pr-4">{item.option}</td>
                    <td className="py-2 pr-4">
                      {item.answers
                        .map((answer) => `${answer.question} ${answer.answer}`)
                        .join(", ")}
                      {L.joiner}
                      {item.area.label} {item.area.score}
                    </td>
                    <td className="py-2 font-semibold">{item.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>
              <CopyText text={page.crossCheck.text} />
            </p>
          )}
        </ReportCard>
      )}
    </ReportSheet>
  );
}
